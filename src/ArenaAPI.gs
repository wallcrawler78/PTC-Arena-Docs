/**
 * Arena API Client
 * Handles all communication with Arena PLM REST API
 *
 * Based on best practices from Arena Sheets DataCenter project
 * See: Docs/Google-and-Arena-working-together.md for patterns
 */

var ARENA_BASE_URL = 'https://api.arenasolutions.com/v1';
var CACHE_TTL_CATEGORIES = 21600; // 6 hours in seconds
var CACHE_TTL_ITEMS = 3600; // 1 hour in seconds
var CACHE_TTL_SEARCH = 900; // 15 minutes in seconds

/**
 * Arena API Client Class
 */
var ArenaAPIClient = (function() {
  /**
   * Constructor
   */
  function ArenaAPIClient() {
    this.sessionId = this._getSessionId();
  }

  /**
   * Gets the current session ID from user properties
   * @private
   * @return {string|null} Session ID or null if not logged in
   */
  ArenaAPIClient.prototype._getSessionId = function() {
    var userProps = PropertiesService.getUserProperties();
    return userProps.getProperty('arena_session_id');
  };

  /**
   * Logs into Arena and stores session ID
   * @param {string} email - User's email
   * @param {string} password - User's password
   * @param {string} workspaceId - Arena workspace ID
   * @return {Object} Login result with success status and session ID
   */
  ArenaAPIClient.prototype.login = function(email, password, workspaceId) {
    var loginUrl = ARENA_BASE_URL + '/login';

    var payload = {
      email: email,
      password: password,
      workspaceId: workspaceId
    };

    var options = {
      method: 'POST',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    };

    try {
      var response = UrlFetchApp.fetch(loginUrl, options);
      var responseCode = response.getResponseCode();

      if (responseCode === 200 || responseCode === 201) {
        var result = JSON.parse(response.getContentText());

        // Handle both response formats
        var sessionId = result.arenaSessionId || result.ArenaSessionId;

        if (sessionId) {
          // Store credentials with timestamp for session management
          var userProps = PropertiesService.getUserProperties();
          var now = new Date().getTime();

          userProps.setProperties({
            'arena_email': email,
            'arena_session_id': sessionId,
            'arena_workspace_id': workspaceId,
            'arena_session_timestamp': now.toString(),
            'arena_session_last_validated': now.toString()
          });

          this.sessionId = sessionId;

          Logger.log('Arena login successful. Session will be kept alive automatically.');

          return {
            success: true,
            sessionId: sessionId
          };
        } else {
          return {
            success: false,
            error: 'No session ID in response'
          };
        }
      } else {
        var errorText = response.getContentText();
        Logger.log('Login failed with code ' + responseCode + ': ' + errorText);

        return {
          success: false,
          error: 'Login failed: Invalid credentials or workspace ID'
        };
      }
    } catch (error) {
      Logger.log('Login error: ' + error.message);
      return {
        success: false,
        error: 'Network error: ' + error.message
      };
    }
  };

  /**
   * Validates that the current session is still active
   * Makes a lightweight API call to keep session alive
   * @return {boolean} True if session is valid, false otherwise
   */
  ArenaAPIClient.prototype.validateSession = function() {
    if (!this.sessionId) {
      return false;
    }

    try {
      // Make a lightweight request to check session validity
      // Using /settings/users/me as it's a small response
      var url = ARENA_BASE_URL + '/settings/users/me';

      var options = {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'arena_session_id': this.sessionId
        },
        muteHttpExceptions: true
      };

      var response = UrlFetchApp.fetch(url, options);
      var responseCode = response.getResponseCode();

      if (responseCode === 200) {
        // Session is valid - update last validated timestamp
        var userProps = PropertiesService.getUserProperties();
        userProps.setProperty('arena_session_last_validated', new Date().getTime().toString());
        return true;
      } else if (responseCode === 401) {
        // Session expired
        Logger.log('Session validation failed: 401 Unauthorized');
        return false;
      } else {
        // Other error - assume session might still be valid
        Logger.log('Session validation returned ' + responseCode + ', assuming valid');
        return true;
      }
    } catch (error) {
      Logger.log('Session validation error: ' + error.message);
      // Network error - assume session might still be valid
      return true;
    }
  };

  /**
   * Checks if session validation is needed based on time since last validation
   * Validates session every 30 minutes to keep it alive
   * @private
   * @return {boolean} True if validation was successful or not needed
   */
  ArenaAPIClient.prototype._checkSessionHealth = function() {
    if (!this.sessionId) {
      return false;
    }

    var userProps = PropertiesService.getUserProperties();
    var lastValidated = userProps.getProperty('arena_session_last_validated');

    if (!lastValidated) {
      // No validation timestamp, validate now
      return this.validateSession();
    }

    var lastValidatedTime = parseInt(lastValidated);
    var now = new Date().getTime();
    var timeSinceValidation = now - lastValidatedTime;

    // Validate every 30 minutes (1800000 ms) to keep session alive
    var VALIDATION_INTERVAL = 30 * 60 * 1000;

    if (timeSinceValidation > VALIDATION_INTERVAL) {
      Logger.log('Session validation needed (last validated ' + Math.round(timeSinceValidation / 60000) + ' minutes ago)');
      return this.validateSession();
    }

    // Session validated recently, no need to check again
    return true;
  };

  /**
   * Makes an authenticated request to Arena API
   * Automatically validates session health before making requests
   * @private
   * @param {string} endpoint - API endpoint (e.g., '/items')
   * @param {Object} options - Request options (method, payload, etc.)
   * @return {Object} Parsed JSON response
   */
  ArenaAPIClient.prototype._makeRequest = function(endpoint, options) {
    options = options || {};

    // Check session health before making request (validates every 30 min)
    this._checkSessionHealth();

    var url = ARENA_BASE_URL + endpoint;

    var headers = {
      'Content-Type': 'application/json',
      'arena_session_id': this.sessionId
    };

    var requestOptions = {
      method: options.method || 'GET',
      headers: headers,
      muteHttpExceptions: true
    };

    if (options.payload) {
      requestOptions.payload = JSON.stringify(options.payload);
    }

    var response = UrlFetchApp.fetch(url, requestOptions);
    var responseCode = response.getResponseCode();

    // Handle session expiry
    if (responseCode === 401) {
      Logger.log('Session expired, attempting re-login');

      // Try to get credentials and re-login
      var userProps = PropertiesService.getUserProperties();
      var email = userProps.getProperty('arena_email');
      var workspaceId = userProps.getProperty('arena_workspace_id');

      if (email && workspaceId) {
        // Cannot auto-relogin without password
        // Clear session and throw error
        userProps.deleteProperty('arena_session_id');
        throw new Error('Session expired. Please login again.');
      } else {
        throw new Error('Session expired. Please login again.');
      }
    }

    if (responseCode !== 200 && responseCode !== 201) {
      var errorText = response.getContentText();
      Logger.log('API Error ' + responseCode + ': ' + errorText);
      throw new Error('API Error ' + responseCode + ': ' + errorText);
    }

    return JSON.parse(response.getContentText());
  };

  /**
   * Gets all categories from Arena
   * @return {Array} Array of category objects
   */
  ArenaAPIClient.prototype.getCategories = function() {
    // Check cache first
    var cache = CacheService.getUserCache();
    var cached = cache.get('arena_categories');

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch from API
    var response = this._makeRequest('/settings/items/categories', { method: 'GET' });

    // Handle both response formats
    var categories = response.results || response.Results || [];

    // Cache the results
    try {
      cache.put('arena_categories', JSON.stringify(categories), CACHE_TTL_CATEGORIES);
    } catch (error) {
      Logger.log('Failed to cache categories: ' + error.message);
    }

    return categories;
  };

  /**
   * Gets a specific category by GUID
   * @param {string} guid - Category GUID
   * @return {Object|null} Category object or null if not found
   */
  ArenaAPIClient.prototype.getCategoryByGuid = function(guid) {
    var categories = this.getCategories();

    for (var i = 0; i < categories.length; i++) {
      var categoryGuid = categories[i].guid || categories[i].Guid;
      if (categoryGuid === guid) {
        return categories[i];
      }
    }

    return null;
  };

  /**
   * Gets attributes for a specific category
   * @param {string} categoryGuid - Category GUID
   * @return {Array} Array of attribute objects
   */
  ArenaAPIClient.prototype.getCategoryAttributes = function(categoryGuid) {
    var endpoint = '/settings/items/categories/' + categoryGuid + '/attributes';
    Logger.log('Fetching category attributes from: ' + endpoint);

    var response = this._makeRequest(endpoint, { method: 'GET' });

    var results = response.results || response.Results || [];
    Logger.log('Category attributes response - Count: ' + results.length);

    if (results.length === 0) {
      Logger.log('WARNING: No custom attributes found for category: ' + categoryGuid);
      Logger.log('Full response: ' + JSON.stringify(response));
    }

    return results;
  };

  /**
   * Gets all items from Arena (with pagination)
   * @return {Array} Array of item objects
   */
  ArenaAPIClient.prototype.getAllItems = function() {
    // Check cache first
    var cache = CacheService.getUserCache();
    var cached = cache.get('arena_items');

    if (cached) {
      return JSON.parse(cached);
    }

    // Fetch with pagination
    var allItems = [];
    var offset = 0;
    var limit = 400;

    while (true) {
      var endpoint = '/items?limit=' + limit + '&offset=' + offset + '&responseview=full';
      var response = this._makeRequest(endpoint, { method: 'GET' });

      var items = response.results || response.Results || [];
      allItems = allItems.concat(items);

      if (items.length < limit) {
        break; // No more results
      }

      offset += limit;
    }

    // Cache trimmed version to stay under 100KB limit
    var trimmedItems = allItems.map(function(item) {
      return {
        guid: item.guid || item.Guid,
        number: item.number || item.Number,
        name: item.name || item.Name,
        description: item.description || item.Description,
        revisionNumber: item.revisionNumber || item.RevisionNumber,
        categoryGuid: (item.category || item.Category) ? (item.category.guid || item.Category.guid || item.Category.Guid) : null,
        categoryName: (item.category || item.Category) ? (item.category.name || item.Category.name || item.Category.Name) : null
      };
    });

    try {
      cache.put('arena_items', JSON.stringify(trimmedItems), CACHE_TTL_ITEMS);
    } catch (error) {
      Logger.log('Failed to cache items (too large): ' + error.message);
    }

    return allItems;
  };

  /**
   * Gets a single item by GUID
   * @param {string} guid - Item GUID
   * @return {Object} Item object
   */
  ArenaAPIClient.prototype.getItem = function(guid) {
    var endpoint = '/items/' + guid + '?responseview=full';
    return this._makeRequest(endpoint, { method: 'GET' });
  };

  /**
   * Finds an item by item number
   * @param {string} itemNumber - Item number to search for
   * @return {Object|null} Item object or null if not found
   */
  ArenaAPIClient.prototype.findItemByNumber = function(itemNumber) {
    var allItems = this.getAllItems();

    for (var i = 0; i < allItems.length; i++) {
      var number = allItems[i].number || allItems[i].Number;
      if (number === itemNumber) {
        // Get full item details
        var guid = allItems[i].guid || allItems[i].Guid;
        return this.getItem(guid);
      }
    }

    return null;
  };

  /**
   * Searches for items by keyword
   * @param {string} keyword - Search keyword
   * @param {string} categoryGuid - Optional category GUID to filter by
   * @return {Array} Array of matching items
   */
  ArenaAPIClient.prototype.searchItems = function(keyword, categoryGuid) {
    var allItems = this.getAllItems();

    var results = allItems.filter(function(item) {
      // Category filter
      if (categoryGuid) {
        var itemCategoryGuid = (item.category || item.Category) ?
          (item.category.guid || item.Category.guid || item.Category.Guid) : null;

        if (itemCategoryGuid !== categoryGuid) {
          return false;
        }
      }

      // Keyword search
      if (keyword) {
        var searchText = keyword.toLowerCase();
        var number = (item.number || item.Number || '').toLowerCase();
        var name = (item.name || item.Name || '').toLowerCase();
        var description = (item.description || item.Description || '').toLowerCase();

        return number.indexOf(searchText) !== -1 ||
               name.indexOf(searchText) !== -1 ||
               description.indexOf(searchText) !== -1;
      }

      return true;
    });

    return results;
  };

  /**
   * Gets the value of a field from an item
   * @param {Object} item - Item object from Arena
   * @param {string} fieldName - Field name (e.g., 'number', 'name', 'description')
   * @param {string} attributeGuid - Optional attribute GUID for custom attributes
   * @return {string} Field value
   */
  ArenaAPIClient.prototype.getFieldValue = function(item, fieldName, attributeGuid) {
    // Standard fields
    if (fieldName === 'number') {
      return item.number || item.Number || '';
    }
    if (fieldName === 'name') {
      return item.name || item.Name || '';
    }
    if (fieldName === 'description') {
      return item.description || item.Description || '';
    }
    if (fieldName === 'revisionNumber') {
      return item.revisionNumber || item.RevisionNumber || '';
    }
    if (fieldName === 'lifecyclePhase') {
      var phase = item.lifecyclePhase || item.LifecyclePhase;
      return phase ? (phase.name || phase.Name || '') : '';
    }

    // Custom attributes
    if (attributeGuid) {
      var attributes = item.additionalAttributes || item.AdditionalAttributes || [];

      for (var i = 0; i < attributes.length; i++) {
        var attrGuid = attributes[i].guid || attributes[i].Guid;
        if (attrGuid === attributeGuid) {
          return attributes[i].value || attributes[i].Value || '';
        }
      }
    }

    return '';
  };

  return ArenaAPIClient;
})();

/**
 * Helper function to create a new Arena API client instance
 * @return {ArenaAPIClient} New client instance
 */
function createArenaClient() {
  return new ArenaAPIClient();
}
