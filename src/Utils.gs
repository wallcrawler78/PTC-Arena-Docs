/**
 * Utility Functions
 * Common helper functions used throughout the add-on
 */

/**
 * Formats a date string to a readable format
 * @param {string} isoDateString - ISO date string
 * @return {string} Formatted date string
 */
function formatDate(isoDateString) {
  if (!isoDateString) {
    return 'N/A';
  }

  try {
    var date = new Date(isoDateString);
    return Utilities.formatDate(date, Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a');
  } catch (error) {
    return isoDateString;
  }
}

/**
 * Truncates a string to a maximum length
 * @param {string} str - String to truncate
 * @param {number} maxLength - Maximum length
 * @return {string} Truncated string
 */
function truncate(str, maxLength) {
  if (!str) {
    return '';
  }

  if (str.length <= maxLength) {
    return str;
  }

  return str.substring(0, maxLength - 3) + '...';
}

/**
 * Shows a toast notification
 * @param {string} message - Message to display
 * @param {string} title - Optional title
 * @param {number} timeout - Optional timeout in seconds
 */
function showToast(message, title, timeout) {
  var doc = DocumentApp.getActiveDocument();

  if (!doc) {
    Logger.log('Toast: ' + (title || '') + ' - ' + message);
    return;
  }

  doc.toast(message, title || 'Arena PLM', timeout || 5);
}

/**
 * Shows an alert dialog
 * @param {string} title - Dialog title
 * @param {string} message - Dialog message
 * @param {string} buttonSet - Optional button set (default: OK)
 * @return {Button} Button clicked
 */
function showAlert(title, message, buttonSet) {
  var ui = DocumentApp.getUi();

  buttonSet = buttonSet || ui.ButtonSet.OK;

  return ui.alert(title, message, buttonSet);
}

/**
 * Safely gets a property value with fallback
 * @param {Object} obj - Object to get property from
 * @param {string} key1 - First key to try
 * @param {string} key2 - Second key to try (fallback)
 * @param {*} defaultValue - Default value if neither key exists
 * @return {*} Property value or default
 */
function safeGet(obj, key1, key2, defaultValue) {
  if (!obj) {
    return defaultValue;
  }

  if (obj.hasOwnProperty(key1)) {
    return obj[key1];
  }

  if (key2 && obj.hasOwnProperty(key2)) {
    return obj[key2];
  }

  return defaultValue;
}

/**
 * Validates an email address
 * @param {string} email - Email to validate
 * @return {boolean} True if valid
 */
function isValidEmail(email) {
  if (!email) {
    return false;
  }

  var regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

/**
 * Validates a workspace ID (should be numeric)
 * @param {string} workspaceId - Workspace ID to validate
 * @return {boolean} True if valid
 */
function isValidWorkspaceId(workspaceId) {
  if (!workspaceId) {
    return false;
  }

  return /^\d+$/.test(workspaceId);
}

/**
 * Logs an error with context
 * @param {string} functionName - Name of the function where error occurred
 * @param {Error} error - Error object
 * @param {Object} context - Optional context object
 */
function logError(functionName, error, context) {
  var logMessage = 'Error in ' + functionName + ': ' + error.message;

  if (error.stack) {
    logMessage += '\nStack: ' + error.stack;
  }

  if (context) {
    logMessage += '\nContext: ' + JSON.stringify(context);
  }

  Logger.log(logMessage);
}

/**
 * Creates a unique ID
 * @return {string} Unique ID
 */
function createUniqueId() {
  return Utilities.getUuid();
}

/**
 * Sanitizes HTML input
 * @param {string} input - Input string
 * @return {string} Sanitized string
 */
function sanitizeHtml(input) {
  if (!input) {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Parses JSON safely with error handling
 * @param {string} jsonString - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @return {*} Parsed object or default value
 */
function safeParseJSON(jsonString, defaultValue) {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    Logger.log('Failed to parse JSON: ' + error.message);
    return defaultValue;
  }
}

/**
 * Checks if a string is empty or whitespace
 * @param {string} str - String to check
 * @return {boolean} True if empty or whitespace
 */
function isEmptyOrWhitespace(str) {
  return !str || str.trim().length === 0;
}

/**
 * Retries a function up to a maximum number of times
 * @param {Function} func - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} delayMs - Delay between retries in milliseconds
 * @return {*} Function result
 */
function retryOperation(func, maxRetries, delayMs) {
  maxRetries = maxRetries || 3;
  delayMs = delayMs || 1000;

  for (var i = 0; i < maxRetries; i++) {
    try {
      return func();
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }

      Logger.log('Retry ' + (i + 1) + ' failed: ' + error.message + '. Retrying...');
      Utilities.sleep(delayMs);
    }
  }
}
