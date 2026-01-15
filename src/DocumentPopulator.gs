/**
 * Document Populator
 * Handles populating documents with Arena item data
 */

/**
 * Populates the document with data from an Arena item by item number
 * @param {string} itemNumber - Arena item number
 * @return {Object} Result with success status
 */
function populateDocumentByItemNumber(itemNumber) {
  try {
    var client = createArenaClient();
    var item = client.findItemByNumber(itemNumber);

    if (!item) {
      return {
        success: false,
        error: 'Item not found: ' + itemNumber
      };
    }

    var guid = item.guid || item.Guid;
    return populateDocumentByGuid(guid);
  } catch (error) {
    Logger.log('Error in populateDocumentByItemNumber: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Populates the document with data from an Arena item by GUID
 * @param {string} itemGuid - Arena item GUID
 * @return {Object} Result with success status
 */
function populateDocumentByGuid(itemGuid) {
  try {
    var result = replaceAllTokensWithItemData(itemGuid);

    return result;
  } catch (error) {
    Logger.log('Error in populateDocumentByGuid: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Updates document tokens with latest Arena data
 * @return {Object} Result with success status and count
 */
function updateDocumentTokens() {
  try {
    var props = PropertiesService.getDocumentProperties();
    var itemGuid = props.getProperty('arena_item_guid');

    if (!itemGuid) {
      return {
        success: false,
        error: 'Document is not linked to an Arena item'
      };
    }

    // Get latest item data
    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    // Get all tokens
    var tokens = getAllTokenMetadata();
    var updated = 0;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var currentValue = getTokenValueInDocument(token.tokenText);
      var newValue = client.getFieldValue(item, token.fieldName, token.attributeGuid);

      // Only update if value has changed
      if (currentValue !== newValue && currentValue !== null) {
        // Replace token text with new value
        replaceTokenInDocument(currentValue, newValue, false);
        updated++;
      }
    }

    // Update populated date
    props.setProperty('arena_populated_date', new Date().toISOString());

    return {
      success: true,
      tokensUpdated: updated
    };
  } catch (error) {
    Logger.log('Error updating document tokens: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Creates a preview of what will be populated
 * @param {string} itemGuid - Arena item GUID
 * @return {Object} Preview data
 */
function getPopulationPreview(itemGuid) {
  try {
    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    var tokens = getAllTokenMetadata();
    var preview = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var value = client.getFieldValue(item, token.fieldName, token.attributeGuid);

      preview.push({
        token: token.tokenText,
        fieldName: token.fieldName,
        categoryName: token.categoryName,
        value: value
      });
    }

    return {
      success: true,
      itemNumber: item.number || item.Number,
      itemName: item.name || item.Name,
      preview: preview
    };
  } catch (error) {
    Logger.log('Error generating preview: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
