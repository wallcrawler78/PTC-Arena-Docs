/**
 * Token Manager
 * Handles token creation, insertion, and management in Google Docs
 *
 * Tokens are special placeholders that map to Arena fields:
 * Format: {{ARENA:CATEGORY_NAME:FIELD_NAME}}
 * Example: {{ARENA:RESISTOR:PART_NUMBER}}
 */

/**
 * Token configuration
 */
var TOKEN_PREFIX = '{{ARENA:';
var TOKEN_SUFFIX = '}}';
var TOKEN_SEPARATOR = ':';

// Token styling
var TOKEN_BACKGROUND_COLOR = '#E8F4F8';
var TOKEN_FOREGROUND_COLOR = '#1976D2';
var TOKEN_BOLD = true;

/**
 * Creates a token string
 * @param {string} categoryName - Category name
 * @param {string} fieldName - Field name
 * @return {string} Token string
 */
function createTokenString(categoryName, fieldName) {
  return TOKEN_PREFIX + categoryName + TOKEN_SEPARATOR + fieldName + TOKEN_SUFFIX;
}

/**
 * Parses a token string into its components
 * @param {string} tokenText - Token string (e.g., "{{ARENA:RESISTOR:PART_NUMBER}}")
 * @return {Object|null} Object with categoryName and fieldName, or null if invalid
 */
function parseTokenString(tokenText) {
  if (!tokenText || typeof tokenText !== 'string') {
    return null;
  }

  // Check if it starts with prefix and ends with suffix
  if (!tokenText.startsWith(TOKEN_PREFIX) || !tokenText.endsWith(TOKEN_SUFFIX)) {
    return null;
  }

  // Extract content between prefix and suffix
  var content = tokenText.substring(TOKEN_PREFIX.length, tokenText.length - TOKEN_SUFFIX.length);

  // Split by separator
  var parts = content.split(TOKEN_SEPARATOR);

  if (parts.length !== 2) {
    return null;
  }

  return {
    categoryName: parts[0],
    fieldName: parts[1]
  };
}

/**
 * Inserts a token at the current cursor position
 * @param {string} categoryName - Category name
 * @param {string} categoryGuid - Category GUID
 * @param {string} fieldName - Field name
 * @param {string} fieldType - Field type ('standard' or 'custom')
 * @param {string} attributeGuid - Optional attribute GUID (for custom fields)
 * @return {Object} Result with success status
 */
function insertToken(categoryName, categoryGuid, fieldName, fieldType, attributeGuid) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var cursor = doc.getCursor();

    if (!cursor) {
      return {
        success: false,
        error: 'Please place your cursor where you want to insert the token'
      };
    }

    // Create token text
    var tokenText = createTokenString(categoryName, fieldName);

    // Insert text at cursor
    var element = cursor.insertText(tokenText);

    // Apply styling
    var style = {};
    style[DocumentApp.Attribute.BACKGROUND_COLOR] = TOKEN_BACKGROUND_COLOR;
    style[DocumentApp.Attribute.FOREGROUND_COLOR] = TOKEN_FOREGROUND_COLOR;
    style[DocumentApp.Attribute.BOLD] = TOKEN_BOLD;

    element.setAttributes(style);

    // Create bookmark for metadata storage
    var position = doc.newPosition(element, 0);
    var bookmark = doc.addBookmark(position);
    var bookmarkId = bookmark.getId();

    // Store token metadata
    var metadata = {
      bookmarkId: bookmarkId,
      tokenText: tokenText,
      categoryName: categoryName,
      categoryGuid: categoryGuid,
      fieldName: fieldName,
      fieldType: fieldType,
      attributeGuid: attributeGuid || null,
      createdAt: new Date().toISOString()
    };

    saveTokenMetadata(bookmarkId, metadata);

    return {
      success: true,
      tokenText: tokenText,
      bookmarkId: bookmarkId
    };
  } catch (error) {
    Logger.log('Error inserting token: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Saves token metadata to document properties
 * @param {string} bookmarkId - Bookmark ID
 * @param {Object} metadata - Token metadata
 */
function saveTokenMetadata(bookmarkId, metadata) {
  var props = PropertiesService.getDocumentProperties();
  var key = 'token_' + bookmarkId;
  props.setProperty(key, JSON.stringify(metadata));
}

/**
 * Gets token metadata by bookmark ID
 * @param {string} bookmarkId - Bookmark ID
 * @return {Object|null} Token metadata or null if not found
 */
function getTokenMetadata(bookmarkId) {
  var props = PropertiesService.getDocumentProperties();
  var key = 'token_' + bookmarkId;
  var value = props.getProperty(key);

  return value ? JSON.parse(value) : null;
}

/**
 * Gets all token metadata from the document
 * @return {Array} Array of token metadata objects
 */
function getAllTokenMetadata() {
  var props = PropertiesService.getDocumentProperties();
  var allProps = props.getProperties();

  var tokens = [];

  for (var key in allProps) {
    if (key.startsWith('token_')) {
      try {
        var metadata = JSON.parse(allProps[key]);
        tokens.push(metadata);
      } catch (error) {
        Logger.log('Error parsing token metadata for key ' + key + ': ' + error.message);
      }
    }
  }

  return tokens;
}

/**
 * Deletes token metadata
 * @param {string} bookmarkId - Bookmark ID
 */
function deleteTokenMetadata(bookmarkId) {
  var props = PropertiesService.getDocumentProperties();
  var key = 'token_' + bookmarkId;
  props.deleteProperty(key);
}

/**
 * Finds all tokens in the document body
 * @return {Array} Array of token information objects
 */
function findAllTokensInDocument() {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  var tokens = [];
  var searchPattern = TOKEN_PREFIX + '.*?' + TOKEN_SUFFIX.replace('}', '\\}').replace('{', '\\{');

  var searchResult = body.findText(searchPattern);

  while (searchResult) {
    var element = searchResult.getElement();
    var startOffset = searchResult.getStartOffset();
    var endOffset = searchResult.getEndOffsetInclusive();

    var tokenText = element.asText().getText().substring(startOffset, endOffset + 1);
    var parsed = parseTokenString(tokenText);

    if (parsed) {
      tokens.push({
        tokenText: tokenText,
        element: element,
        startOffset: startOffset,
        endOffset: endOffset,
        categoryName: parsed.categoryName,
        fieldName: parsed.fieldName
      });
    }

    searchResult = body.findText(searchPattern, searchResult);
  }

  return tokens;
}

/**
 * Replaces a token in the document with a value
 * @param {string} tokenText - Token text to replace
 * @param {string} value - Value to replace with
 * @param {boolean} removeFormatting - Whether to remove token formatting (default: true)
 * @return {number} Number of replacements made
 */
function replaceTokenInDocument(tokenText, value, removeFormatting) {
  if (removeFormatting === undefined) {
    removeFormatting = true;
  }

  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  var count = 0;
  var searchResult = body.findText(escapeRegExp(tokenText));

  while (searchResult) {
    var element = searchResult.getElement();
    var startOffset = searchResult.getStartOffset();
    var endOffset = searchResult.getEndOffsetInclusive();

    // Delete old text
    element.asText().deleteText(startOffset, endOffset);

    // Insert new value
    element.asText().insertText(startOffset, value);

    // Remove formatting if requested
    if (removeFormatting) {
      var valueEndOffset = startOffset + value.length - 1;
      if (valueEndOffset >= startOffset) {
        element.asText().setBackgroundColor(startOffset, valueEndOffset, null);
        element.asText().setForegroundColor(startOffset, valueEndOffset, null);
        element.asText().setBold(startOffset, valueEndOffset, false);
      }
    }

    count++;

    // Continue search from after the replaced text
    searchResult = body.findText(escapeRegExp(tokenText), searchResult);
  }

  return count;
}

/**
 * Replaces all tokens in the document with their values from an Arena item
 * @param {string} itemGuid - Arena item GUID
 * @return {Object} Result with success status and count
 */
function replaceAllTokensWithItemData(itemGuid) {
  try {
    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    var tokens = getAllTokenMetadata();
    var replaced = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var value = client.getFieldValue(item, token.fieldName, token.attributeGuid);

      var count = replaceTokenInDocument(token.tokenText, value, true);
      replaced += count;
    }

    // Store the linked item information
    var props = PropertiesService.getDocumentProperties();
    props.setProperties({
      'arena_item_guid': itemGuid,
      'arena_item_number': item.number || item.Number,
      'arena_populated_date': new Date().toISOString()
    });

    return {
      success: true,
      tokensReplaced: replaced
    };
  } catch (error) {
    Logger.log('Error replacing tokens: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clears all tokens and their metadata from the document
 */
function clearAllTokensFromDocument() {
  // Get all token metadata
  var tokens = getAllTokenMetadata();

  // Delete all token metadata
  var props = PropertiesService.getDocumentProperties();

  for (var i = 0; i < tokens.length; i++) {
    deleteTokenMetadata(tokens[i].bookmarkId);
  }

  // Clear document properties related to Arena item
  props.deleteProperty('arena_item_guid');
  props.deleteProperty('arena_item_number');
  props.deleteProperty('arena_populated_date');

  // Note: We don't remove the actual token text from the document
  // as that would require finding and removing each one
  // Users can do that manually if needed
}

/**
 * Gets the current value of a token in the document
 * @param {string} tokenText - Token text to find
 * @return {string|null} Current value or null if not found
 */
function getTokenValueInDocument(tokenText) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  // Search for the token text
  var searchResult = body.findText(escapeRegExp(tokenText));

  if (searchResult) {
    var element = searchResult.getElement();
    var startOffset = searchResult.getStartOffset();
    var endOffset = searchResult.getEndOffsetInclusive();

    return element.asText().getText().substring(startOffset, endOffset + 1);
  }

  return null;
}

/**
 * Helper function to escape special regex characters
 * @param {string} string - String to escape
 * @return {string} Escaped string
 */
function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Gets information about tokens in the document
 * @return {Object} Token statistics and information
 */
function getDocumentTokenInfo() {
  var metadata = getAllTokenMetadata();
  var tokensInDoc = findAllTokensInDocument();

  var props = PropertiesService.getDocumentProperties();

  return {
    totalTokensDefined: metadata.length,
    tokensInDocument: tokensInDoc.length,
    linkedItemGuid: props.getProperty('arena_item_guid'),
    linkedItemNumber: props.getProperty('arena_item_number'),
    populatedDate: props.getProperty('arena_populated_date'),
    tokens: metadata
  };
}
