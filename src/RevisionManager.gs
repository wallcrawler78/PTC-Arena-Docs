/**
 * Revision Manager
 * Handles document revisioning and change detection
 */

/**
 * Detects changes between current document and Arena data
 * @return {Array} Array of change objects
 */
function detectDocumentChanges() {
  try {
    var props = PropertiesService.getDocumentProperties();
    var itemGuid = props.getProperty('arena_item_guid');

    if (!itemGuid) {
      throw new Error('Document is not linked to an Arena item');
    }

    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    var tokens = getAllTokenMetadata();
    var changes = [];

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var currentValue = getTokenValueInDocument(token.tokenText);
      var arenaValue = client.getFieldValue(item, token.fieldName, token.attributeGuid);

      // Check if value has changed
      if (currentValue && currentValue !== arenaValue && currentValue !== token.tokenText) {
        changes.push({
          token: token.tokenText,
          fieldName: token.fieldName,
          categoryName: token.categoryName,
          currentValue: currentValue,
          newValue: arenaValue,
          type: 'modified'
        });
      }
    }

    return changes;
  } catch (error) {
    Logger.log('Error detecting changes: ' + error.message);
    throw error;
  }
}

/**
 * Creates a revised copy of the document with updated Arena data
 * @param {string} newDocumentName - Name for the new document
 * @return {Object} Result with success status and new document URL
 */
function createRevisedDocumentCopy(newDocumentName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var props = PropertiesService.getDocumentProperties();
    var itemGuid = props.getProperty('arena_item_guid');

    if (!itemGuid) {
      return {
        success: false,
        error: 'Document is not linked to an Arena item'
      };
    }

    // Make a copy of the document
    var file = DriveApp.getFileById(doc.getId());
    var copy = file.makeCopy(newDocumentName || doc.getName() + ' (Revised)');
    var copyId = copy.getId();

    // Open the copy
    var copyDoc = DocumentApp.openById(copyId);

    // Update the copy with latest Arena data
    // We need to work with the copy, not the original
    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    // Get tokens from original document
    var tokens = getAllTokenMetadata();

    // Update each token in the copy
    var copyBody = copyDoc.getBody();

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var value = client.getFieldValue(item, token.fieldName, token.attributeGuid);

      // Find and replace in the copy
      var searchResult = copyBody.findText(escapeRegExp(token.tokenText));

      while (searchResult) {
        var element = searchResult.getElement();
        var startOffset = searchResult.getStartOffset();
        var endOffset = searchResult.getEndOffsetInclusive();

        // Replace with value
        element.asText().deleteText(startOffset, endOffset);
        element.asText().insertText(startOffset, value);

        // Remove token styling
        var valueEndOffset = startOffset + value.length - 1;
        if (valueEndOffset >= startOffset) {
          element.asText().setBackgroundColor(startOffset, valueEndOffset, null);
          element.asText().setForegroundColor(startOffset, valueEndOffset, null);
          element.asText().setBold(startOffset, valueEndOffset, false);
        }

        searchResult = copyBody.findText(escapeRegExp(token.tokenText), searchResult);
      }
    }

    // Save and close the copy
    copyDoc.saveAndClose();

    return {
      success: true,
      documentId: copyId,
      documentUrl: copy.getUrl(),
      documentName: newDocumentName || doc.getName() + ' (Revised)'
    };
  } catch (error) {
    Logger.log('Error creating revised copy: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gets information about the linked Arena item
 * @return {Object|null} Item information or null if not linked
 */
function getLinkedItemInfo() {
  var props = PropertiesService.getDocumentProperties();
  var itemGuid = props.getProperty('arena_item_guid');

  if (!itemGuid) {
    return null;
  }

  try {
    var client = createArenaClient();
    var item = client.getItem(itemGuid);

    return {
      guid: itemGuid,
      number: item.number || item.Number,
      name: item.name || item.Name,
      description: item.description || item.Description,
      revisionNumber: item.revisionNumber || item.RevisionNumber,
      populatedDate: props.getProperty('arena_populated_date')
    };
  } catch (error) {
    Logger.log('Error getting linked item info: ' + error.message);
    return null;
  }
}
