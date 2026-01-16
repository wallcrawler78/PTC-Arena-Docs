/**
 * Gemini API Client
 * Handles all communication with Google Gemini API for document generation
 * Follows the ArenaAPIClient pattern for consistency
 * Implements intelligent rate limiting to stay within free tier limits
 */

var GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
var GEMINI_MODEL = 'gemini-2.0-flash'; // Current stable model for v1beta API (2026)
var CACHE_TTL_GEMINI = 0; // No caching for generated content

// Rate limiting configuration
var GEMINI_RATE_LIMITS = {
  requestsPerMinute: 15,
  requestsPerDay: 1500,
  windowMs: 60000 // 1 minute in milliseconds
};

/**
 * Gemini API Client Class
 */
var GeminiAPIClient = (function() {

  function GeminiAPIClient() {
    // Uses API key from UserProperties
  }

  /**
   * Gets API key for Gemini API access
   * @private
   * @return {string} API key
   */
  GeminiAPIClient.prototype._getApiKey = function() {
    var userProps = PropertiesService.getUserProperties();
    var apiKey = userProps.getProperty('gemini_api_key');

    if (!apiKey) {
      throw new Error('Gemini API key not configured. Please set your API key in Arena PLM > Settings > Configure Gemini API Key');
    }

    return apiKey;
  };

  /**
   * Gets request history from last minute
   * @private
   * @return {Array} Array of timestamps
   */
  GeminiAPIClient.prototype._getRequestHistory = function() {
    var userProps = PropertiesService.getUserProperties();
    var historyJson = userProps.getProperty('gemini_request_history');

    if (!historyJson) {
      return [];
    }

    try {
      var history = JSON.parse(historyJson);
      var now = Date.now();

      // Filter out requests older than 1 minute
      var recentRequests = history.filter(function(timestamp) {
        return (now - timestamp) < GEMINI_RATE_LIMITS.windowMs;
      });

      return recentRequests;
    } catch (e) {
      Logger.log('Error parsing request history: ' + e.message);
      return [];
    }
  };

  /**
   * Records a new API request
   * @private
   */
  GeminiAPIClient.prototype._recordRequest = function() {
    var history = this._getRequestHistory();
    history.push(Date.now());

    var userProps = PropertiesService.getUserProperties();
    userProps.setProperty('gemini_request_history', JSON.stringify(history));
  };

  /**
   * Checks if we can make a request within rate limits
   * @private
   * @return {Object} {canProceed: boolean, waitMs: number, requestsInWindow: number}
   */
  GeminiAPIClient.prototype._checkRateLimit = function() {
    var history = this._getRequestHistory();
    var requestsInWindow = history.length;

    if (requestsInWindow < GEMINI_RATE_LIMITS.requestsPerMinute) {
      return {
        canProceed: true,
        waitMs: 0,
        requestsInWindow: requestsInWindow
      };
    }

    // Calculate how long to wait until oldest request expires
    var oldestRequest = Math.min.apply(Math, history);
    var waitMs = GEMINI_RATE_LIMITS.windowMs - (Date.now() - oldestRequest);

    return {
      canProceed: false,
      waitMs: Math.max(waitMs, 1000), // At least 1 second
      requestsInWindow: requestsInWindow
    };
  };

  /**
   * Waits if necessary to respect rate limits
   * @private
   * @return {Object} Status of rate limit check
   */
  GeminiAPIClient.prototype._waitForRateLimit = function() {
    var check = this._checkRateLimit();

    if (check.canProceed) {
      Logger.log('Rate limit OK: ' + check.requestsInWindow + '/' + GEMINI_RATE_LIMITS.requestsPerMinute + ' requests in window');
      return check;
    }

    var waitSeconds = Math.ceil(check.waitMs / 1000);
    Logger.log('Rate limit reached (' + check.requestsInWindow + '/' + GEMINI_RATE_LIMITS.requestsPerMinute + '). Waiting ' + waitSeconds + ' seconds...');

    // Wait for rate limit to clear
    Utilities.sleep(check.waitMs);

    Logger.log('Rate limit wait complete. Proceeding with request.');
    return {
      canProceed: true,
      waitMs: 0,
      requestsInWindow: check.requestsInWindow,
      didWait: true,
      waitedSeconds: waitSeconds
    };
  };

  /**
   * Makes an authenticated request to Gemini API
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} payload - Request payload
   * @param {boolean} skipRateLimitCheck - Skip rate limit check (used during retries)
   * @return {Object} Parsed JSON response
   */
  GeminiAPIClient.prototype._makeRequest = function(endpoint, payload, skipRateLimitCheck) {
    // Check rate limit before making request (unless skipped for retry)
    if (!skipRateLimitCheck) {
      this._waitForRateLimit();
    }

    var apiKey = this._getApiKey();
    var url = GEMINI_BASE_URL + endpoint + '?key=' + apiKey;

    var options = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();

      if (responseCode === 429) {
        var error = new Error('Gemini API rate limit exceeded. Waiting before retry...');
        error.isRateLimitError = true;
        throw error;
      }

      if (responseCode === 403 || responseCode === 400) {
        throw new Error('Invalid Gemini API key. Please check your API key in Arena PLM > Settings > Configure Gemini API Key');
      }

      if (responseCode === 401) {
        throw new Error('Authentication failed. Please try logging out and back in.');
      }

      if (responseCode !== 200) {
        var errorText = response.getContentText();
        Logger.log('Gemini API Error ' + responseCode + ': ' + errorText);
        throw new Error('Gemini API Error: ' + this._parseErrorMessage(errorText));
      }

      // Record successful request for rate limiting
      this._recordRequest();

      return JSON.parse(response.getContentText());
    } catch (error) {
      Logger.log('Gemini API request failed: ' + error.message);
      throw error;
    }
  };

  /**
   * Makes request with intelligent retry logic
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} payload - Request payload
   * @param {number} maxRetries - Maximum number of retries (default 5)
   * @return {Object} API response
   */
  GeminiAPIClient.prototype._makeRequestWithRetry = function(endpoint, payload, maxRetries) {
    maxRetries = maxRetries || 5;
    var rateLimitRetries = 0;
    var maxRateLimitRetries = 3;

    for (var i = 0; i < maxRetries; i++) {
      try {
        // Skip rate limit check on retries (we already waited)
        var skipCheck = (i > 0);
        return this._makeRequest(endpoint, payload, skipCheck);
      } catch (error) {
        // Don't retry on auth or permission errors
        if (error.message.indexOf('Invalid Gemini API key') !== -1 ||
            error.message.indexOf('Authentication failed') !== -1 ||
            error.message.indexOf('API key not configured') !== -1) {
          throw error;
        }

        // Handle rate limit errors specially
        if (error.isRateLimitError) {
          rateLimitRetries++;

          if (rateLimitRetries > maxRateLimitRetries) {
            throw new Error('Rate limit exceeded multiple times. Please wait a few minutes before trying again.');
          }

          // Longer wait for rate limit errors: 5s, 15s, 30s
          var rateLimitDelay = Math.min(5000 * Math.pow(3, rateLimitRetries - 1), 60000);
          var waitSeconds = Math.ceil(rateLimitDelay / 1000);

          Logger.log('Rate limit error - waiting ' + waitSeconds + ' seconds before retry ' + rateLimitRetries + '/' + maxRateLimitRetries);
          Utilities.sleep(rateLimitDelay);

          // Don't count rate limit retries against normal retry limit
          i--;
          continue;
        }

        // Last retry - throw error
        if (i === maxRetries - 1) {
          throw error;
        }

        // Exponential backoff for other errors: 2s, 4s, 8s, 16s
        var delay = Math.pow(2, i + 1) * 1000;
        Logger.log('Retry ' + (i + 1) + '/' + maxRetries + ' after ' + (delay/1000) + 's - Error: ' + error.message);
        Utilities.sleep(delay);
      }
    }

    throw new Error('Max retries exceeded');
  };

  /**
   * Parses error message from Gemini API response
   * @private
   */
  GeminiAPIClient.prototype._parseErrorMessage = function(errorText) {
    try {
      var errorObj = JSON.parse(errorText);
      if (errorObj.error && errorObj.error.message) {
        return errorObj.error.message;
      }
      return errorText;
    } catch (e) {
      return errorText;
    }
  };

  /**
   * Generates document content using Gemini
   * @param {string} prompt - The generation prompt
   * @param {Object} options - Generation options (temperature, maxTokens, etc.)
   * @return {Object} Generated content with metadata
   */
  GeminiAPIClient.prototype.generateContent = function(prompt, options) {
    options = options || {};

    var endpoint = '/models/' + GEMINI_MODEL + ':generateContent';

    var payload = {
      contents: [{
        parts: [{
          text: prompt
        }]
      }],
      generationConfig: {
        temperature: options.temperature || 0.7,
        maxOutputTokens: options.maxTokens || 8192,
        topP: options.topP || 0.95,
        topK: options.topK || 40
      },
      safetySettings: [
        {
          category: 'HARM_CATEGORY_HARASSMENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_HATE_SPEECH',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        },
        {
          category: 'HARM_CATEGORY_DANGEROUS_CONTENT',
          threshold: 'BLOCK_MEDIUM_AND_ABOVE'
        }
      ]
    };

    var response = this._makeRequestWithRetry(endpoint, payload);

    // Extract text from response
    var generatedText = '';
    if (response.candidates && response.candidates.length > 0) {
      var candidate = response.candidates[0];
      if (candidate.content && candidate.content.parts) {
        generatedText = candidate.content.parts.map(function(part) {
          return part.text || '';
        }).join('');
      }
    }

    return {
      text: generatedText,
      model: GEMINI_MODEL,
      finishReason: response.candidates && response.candidates[0] ? response.candidates[0].finishReason : null,
      safetyRatings: response.candidates && response.candidates[0] ? response.candidates[0].safetyRatings : null,
      usageMetadata: response.usageMetadata || {}
    };
  };

  /**
   * Validates that Gemini API is accessible
   * @return {Object} Validation result
   */
  GeminiAPIClient.prototype.validateAccess = function() {
    try {
      // Simple test prompt
      var result = this.generateContent('Say "OK" if you can read this.', {
        maxTokens: 10
      });

      return {
        success: true,
        message: 'Gemini API is accessible'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Gemini API access denied. ' + error.message
      };
    }
  };

  return GeminiAPIClient;
})();

/**
 * Helper function to create a new Gemini API client instance
 * @return {GeminiAPIClient} New client instance
 */
function createGeminiClient() {
  return new GeminiAPIClient();
}
