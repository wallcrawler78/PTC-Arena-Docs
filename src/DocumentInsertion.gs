/**
 * Document Insertion
 * Handles inserting generated content with formatting and token creation
 */

/**
 * Inserts generated content into the document
 * @param {string} content - Generated document content
 * @param {string} mode - Insert mode ('cursor' or 'replace')
 * @param {Object} wizardData - Original wizard data for metadata
 * @return {Object} Insertion result
 */
function insertGeneratedContent(content, mode, wizardData) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();

    // Clear document if replace mode
    if (mode === 'replace') {
      body.clear();
    }

    // Get insertion point
    var insertionPoint;
    if (mode === 'cursor') {
      var cursor = doc.getCursor();
      if (!cursor) {
        return {
          success: false,
          error: 'No cursor position found. Please place your cursor where you want to insert the document.'
        };
      }
      insertionPoint = cursor.getElement();
    } else {
      insertionPoint = body;
    }

    // Parse and insert content with formatting
    var result = parseAndInsertContent(content, body, mode, wizardData);

    return {
      success: true,
      tokensCreated: result.tokensCreated,
      message: 'Document inserted successfully'
    };

  } catch (error) {
    Logger.log('Error inserting generated content: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Parses markdown-style content and inserts it with proper formatting
 * @private
 * @param {string} content - Content to parse and insert
 * @param {Body} body - Document body
 * @param {string} mode - Insert mode
 * @param {Object} wizardData - Wizard data for metadata
 * @return {Object} Parsing result
 */
function parseAndInsertContent(content, body, mode, wizardData) {
  var tokensCreated = 0;
  var lines = content.split('\n');
  var i = 0;

  // Process each line
  while (i < lines.length) {
    var line = lines[i];

    // Skip empty lines at the start
    if (line.trim() === '' && body.getText().trim() === '') {
      i++;
      continue;
    }

    // Heading 1 (# )
    if (line.match(/^# (.+)$/)) {
      var text = line.replace(/^# /, '');
      var paragraph = body.appendParagraph(text);
      paragraph.setHeading(DocumentApp.ParagraphHeading.HEADING1);
      tokensCreated += applyTokenFormatting(paragraph, wizardData);
      i++;
      continue;
    }

    // Heading 2 (## )
    if (line.match(/^## (.+)$/)) {
      var text = line.replace(/^## /, '');
      var paragraph = body.appendParagraph(text);
      paragraph.setHeading(DocumentApp.ParagraphHeading.HEADING2);
      tokensCreated += applyTokenFormatting(paragraph, wizardData);
      i++;
      continue;
    }

    // Heading 3 (### )
    if (line.match(/^### (.+)$/)) {
      var text = line.replace(/^### /, '');
      var paragraph = body.appendParagraph(text);
      paragraph.setHeading(DocumentApp.ParagraphHeading.HEADING3);
      tokensCreated += applyTokenFormatting(paragraph, wizardData);
      i++;
      continue;
    }

    // Table detection (| ... |)
    if (line.match(/^\|.+\|$/)) {
      var tableLines = [];
      while (i < lines.length && lines[i].match(/^\|.+\|$/)) {
        tableLines.push(lines[i]);
        i++;
      }
      tokensCreated += insertTable(body, tableLines, wizardData);
      continue;
    }

    // Regular paragraph
    if (line.trim() !== '') {
      // Combine consecutive non-heading, non-table lines into a paragraph
      var paragraphText = line;
      var j = i + 1;
      while (j < lines.length &&
             lines[j].trim() !== '' &&
             !lines[j].match(/^#{1,3} /) &&
             !lines[j].match(/^\|.+\|$/)) {
        paragraphText += '\n' + lines[j];
        j++;
      }

      var paragraph = body.appendParagraph(paragraphText);
      tokensCreated += applyTokenFormatting(paragraph, wizardData);
      i = j;
      continue;
    }

    i++;
  }

  return {
    tokensCreated: tokensCreated
  };
}

/**
 * Inserts a table from markdown-style table lines
 * @private
 * @param {Body} body - Document body
 * @param {Array} tableLines - Array of table lines
 * @param {Object} wizardData - Wizard data for metadata
 * @return {number} Number of tokens created
 */
function insertTable(body, tableLines, wizardData) {
  var tokensCreated = 0;

  if (tableLines.length < 2) {
    return 0; // Need at least header and separator
  }

  // Parse header row
  var headerCells = tableLines[0].split('|')
    .map(function(cell) { return cell.trim(); })
    .filter(function(cell) { return cell !== ''; });

  // Skip separator row (usually line 1 with dashes)
  var dataRows = tableLines.slice(2);

  // Create table
  var numRows = dataRows.length + 1; // +1 for header
  var numCols = headerCells.length;
  var table = body.appendTable();

  // Add header row
  var headerRow = table.appendTableRow();
  headerCells.forEach(function(cellText) {
    var cell = headerRow.appendTableCell(cellText);
    cell.setBackgroundColor('#E3F2FD');
    cell.getChild(0).asParagraph().setBold(true);
    tokensCreated += applyTokenFormatting(cell.getChild(0).asParagraph(), wizardData);
  });

  // Add data rows
  dataRows.forEach(function(rowLine) {
    var cells = rowLine.split('|')
      .map(function(cell) { return cell.trim(); })
      .filter(function(cell) { return cell !== ''; });

    var row = table.appendTableRow();
    cells.forEach(function(cellText) {
      var cell = row.appendTableCell(cellText);
      tokensCreated += applyTokenFormatting(cell.getChild(0).asParagraph(), wizardData);
    });
  });

  return tokensCreated;
}

/**
 * Applies token formatting and creates bookmarks
 * @private
 * @param {Paragraph} paragraph - Paragraph element
 * @param {Object} wizardData - Wizard data for metadata
 * @return {number} Number of tokens formatted
 */
function applyTokenFormatting(paragraph, wizardData) {
  var text = paragraph.getText();
  var tokenRegex = /\{\{ARENA:([^:]+):([^}]+)\}\}/g;
  var match;
  var tokensFormatted = 0;
  var searchOffset = 0;

  while ((match = tokenRegex.exec(text)) !== null) {
    var tokenText = match[0];
    var categoryName = match[1];
    var fieldName = match[2];
    var startIndex = match.index;

    try {
      // Find the token position in the paragraph
      var textElement = paragraph.editAsText();

      // Apply token styling
      textElement.setBackgroundColor(startIndex, startIndex + tokenText.length - 1, '#E8F4F8');
      textElement.setForegroundColor(startIndex, startIndex + tokenText.length - 1, '#1976D2');
      textElement.setBold(startIndex, startIndex + tokenText.length - 1, true);

      // Create bookmark at token position
      var position = DocumentApp.getActiveDocument().newPosition(paragraph, startIndex);
      var bookmark = DocumentApp.getActiveDocument().addBookmark(position);

      // Find matching field from wizard data
      var matchingField = findMatchingField(wizardData.selectedFields, fieldName);

      // Store token metadata
      var metadata = {
        bookmarkId: bookmark.getId(),
        tokenText: tokenText,
        categoryName: categoryName,
        categoryGuid: wizardData.categoryGuid,
        fieldName: fieldName,
        fieldType: matchingField ? matchingField.fieldType : 'SINGLELINE',
        attributeGuid: matchingField ? matchingField.attributeGuid : null,
        createdAt: new Date().toISOString(),
        source: 'gemini_generation'
      };

      var docProps = PropertiesService.getDocumentProperties();
      docProps.setProperty('token_' + bookmark.getId(), JSON.stringify(metadata));

      tokensFormatted++;

    } catch (error) {
      Logger.log('Error formatting token at position ' + startIndex + ': ' + error.message);
    }
  }

  // Apply bold formatting for **text**
  applyBoldFormatting(paragraph);

  return tokensFormatted;
}

/**
 * Finds a matching field from selected fields by display name
 * @private
 * @param {Array} selectedFields - Array of field objects
 * @param {string} fieldName - Field name to match
 * @return {Object} Matching field object or null
 */
function findMatchingField(selectedFields, fieldName) {
  return selectedFields.find(function(field) {
    return field.displayName === fieldName ||
           field.displayName.toUpperCase() === fieldName.toUpperCase() ||
           field.displayName.toLowerCase() === fieldName.toLowerCase();
  }) || null;
}

/**
 * Applies bold formatting for **text** markdown
 * @private
 * @param {Paragraph} paragraph - Paragraph element
 */
function applyBoldFormatting(paragraph) {
  var text = paragraph.getText();
  var boldRegex = /\*\*(.+?)\*\*/g;
  var match;

  // Find all bold markers
  var boldRanges = [];
  while ((match = boldRegex.exec(text)) !== null) {
    boldRanges.push({
      start: match.index,
      end: match.index + match[0].length,
      innerStart: match.index + 2,
      innerEnd: match.index + match[0].length - 2
    });
  }

  // Process in reverse to maintain correct indices
  boldRanges.reverse().forEach(function(range) {
    try {
      var textElement = paragraph.editAsText();

      // Remove ** markers
      textElement.deleteText(range.innerEnd, range.innerEnd + 1); // Remove trailing **
      textElement.deleteText(range.start, range.start + 1); // Remove leading **

      // Apply bold (indices shifted after deletion)
      textElement.setBold(range.start, range.innerEnd - 3, true);
    } catch (error) {
      Logger.log('Error applying bold formatting: ' + error.message);
    }
  });
}

/**
 * Inserts content at cursor position (alternative to full parsing for simple inserts)
 * @param {string} content - Content to insert
 * @return {Object} Result
 */
function insertAtCursor(content) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();

  if (!cursor) {
    return {
      success: false,
      error: 'No cursor position found'
    };
  }

  var element = cursor.insertText(content);

  return {
    success: true,
    element: element
  };
}

/**
 * Clears the entire document body
 * @return {Object} Result
 */
function clearDocumentBody() {
  try {
    var doc = DocumentApp.getActiveDocument();
    doc.getBody().clear();

    return {
      success: true
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}
