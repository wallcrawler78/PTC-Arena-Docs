/**
 * Gemini API Client
 * Handles all communication with Google Gemini API for document generation
 * Follows the ArenaAPIClient pattern for consistency
 */

var GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
var GEMINI_MODEL = 'gemini-1.5-flash-latest'; // Fast and cost-effective
var CACHE_TTL_GEMINI = 0; // No caching for generated content

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
   * Makes an authenticated request to Gemini API
   * @private
   * @param {string} endpoint - API endpoint
   * @param {Object} payload - Request payload
   * @return {Object} Parsed JSON response
   */
  GeminiAPIClient.prototype._makeRequest = function(endpoint, payload) {
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
        throw new Error('Gemini API rate limit exceeded. Please try again in a few moments.');
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

      return JSON.parse(response.getContentText());
    } catch (error) {
      Logger.log('Gemini API request failed: ' + error.message);
      throw error;
    }
  };

  /**
   * Makes request with retry logic
   * @private
   */
  GeminiAPIClient.prototype._makeRequestWithRetry = function(endpoint, payload, maxRetries) {
    maxRetries = maxRetries || 3;

    for (var i = 0; i < maxRetries; i++) {
      try {
        return this._makeRequest(endpoint, payload);
      } catch (error) {
        if (i === maxRetries - 1) throw error;

        // Don't retry on auth or permission errors
        if (error.message.indexOf('access denied') !== -1 ||
            error.message.indexOf('Authentication failed') !== -1) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        var delay = Math.pow(2, i) * 1000;
        Logger.log('Retry ' + (i + 1) + ' after ' + delay + 'ms');
        Utilities.sleep(delay);
      }
    }
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
