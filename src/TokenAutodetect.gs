/**
 * Token Autodetect
 * Scans documents and suggests token placements using fuzzy matching
 */

/**
 * Autodetects token opportunities in the current document
 * @param {string} categoryGuid - Arena category GUID
 * @return {Object} Autodetect result with suggestions
 */
function autodetectTokenOpportunities(categoryGuid) {
  try {
    // Get category fields
    var fieldsData = getCategoryFields(categoryGuid);

    if (!fieldsData) {
      return {
        success: false,
        error: 'No fields found for this category'
      };
    }

    // Combine standard and custom fields into a single array and normalize structure
    var standardFields = (fieldsData.standardFields || []).map(function(field) {
      return {
        displayName: field.displayName || field.name,
        apiName: field.name,
        fieldType: 'SINGLELINE',
        attributeGuid: null,
        type: 'standard'
      };
    });

    var customFields = (fieldsData.customFields || []).map(function(field) {
      return {
        displayName: field.displayName || field.name,
        apiName: field.name,
        fieldType: field.fieldType || 'SINGLELINE',
        attributeGuid: field.guid,
        type: 'custom'
      };
    });

    var fields = standardFields.concat(customFields);

    if (fields.length === 0) {
      return {
        success: false,
        error: 'No fields found for this category'
      };
    }

    // Get document text
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var text = body.getText();

    // Get existing token positions to avoid duplicates
    var existingTokens = getAllTokenMetadata();
    var existingPositions = existingTokens.map(function(token) {
      return token.bookmarkId;
    });

    // Generate suggestions for each field
    var allSuggestions = [];

    fields.forEach(function(field) {
      var patterns = generateFieldPatterns(field);

      patterns.forEach(function(pattern) {
        var matches = findPatternMatches(body, text, pattern);

        matches.forEach(function(match) {
          // Calculate confidence score
          var confidence = calculateConfidence(match, pattern, text);

          if (confidence >= 0.75) { // Only suggest if ≥75% confidence
            allSuggestions.push({
              fieldName: field.displayName,
              fieldApiName: field.apiName,
              fieldType: field.fieldType,
              attributeGuid: field.attributeGuid,
              pattern: pattern.text,
              patternType: pattern.type,
              matchedText: match.text,
              position: match.position,
              context: match.context,
              confidence: confidence,
              element: match.element,
              offset: match.offset
            });
          }
        });
      });
    });

    // Sort by confidence (highest first)
    allSuggestions.sort(function(a, b) {
      return b.confidence - a.confidence;
    });

    // Deduplicate by position
    var uniqueSuggestions = deduplicateSuggestions(allSuggestions);

    return {
      success: true,
      suggestions: uniqueSuggestions,
      totalScanned: fields.length,
      totalMatches: uniqueSuggestions.length
    };

  } catch (error) {
    Logger.log('Autodetect error: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Generates fuzzy matching patterns for a field
 * @private
 * @param {Object} field - Field object
 * @return {Array} Array of pattern objects
 */
function generateFieldPatterns(field) {
  var patterns = [];
  var fieldName = field.displayName;

  // Pattern 1: Exact with colon (1.0 score)
  patterns.push({
    text: fieldName + ':',
    regex: new RegExp(escapeRegex(fieldName) + '\\s*:', 'gi'),
    type: 'exact_colon',
    baseScore: 1.0
  });

  // Pattern 2: Exact word boundary (0.95 score)
  patterns.push({
    text: fieldName,
    regex: new RegExp('\\b' + escapeRegex(fieldName) + '\\b', 'gi'),
    type: 'exact_word',
    baseScore: 0.95
  });

  // Pattern 3: Underscores (0.9 score)
  var underscored = fieldName.replace(/\s+/g, '_');
  if (underscored !== fieldName) {
    patterns.push({
      text: underscored + ':',
      regex: new RegExp(escapeRegex(underscored) + '\\s*:', 'gi'),
      type: 'underscored',
      baseScore: 0.9
    });
  }

  // Pattern 4: Common abbreviations (0.85 score)
  var abbreviations = getCommonAbbreviations(fieldName);
  abbreviations.forEach(function(abbr) {
    patterns.push({
      text: abbr,
      regex: new RegExp('\\b' + escapeRegex(abbr) + '\\b', 'gi'),
      type: 'abbreviation',
      baseScore: 0.85
    });
  });

  // Pattern 5: Common variations (0.75 score)
  var variations = getCommonVariations(fieldName);
  variations.forEach(function(variation) {
    patterns.push({
      text: variation,
      regex: new RegExp('\\b' + escapeRegex(variation) + '\\b', 'gi'),
      type: 'variation',
      baseScore: 0.75
    });
  });

  return patterns;
}

/**
 * Finds all matches for a pattern in the document
 * @private
 * @param {Body} body - Document body
 * @param {string} text - Document text
 * @param {Object} pattern - Pattern object
 * @return {Array} Array of match objects
 */
function findPatternMatches(body, text, pattern) {
  var matches = [];
  var match;

  while ((match = pattern.regex.exec(text)) !== null) {
    var matchText = match[0];
    var position = match.index;

    // Get context (30 chars before and after)
    var contextStart = Math.max(0, position - 30);
    var contextEnd = Math.min(text.length, position + matchText.length + 30);
    var context = text.substring(contextStart, contextEnd);

    // Find the element containing this text
    var elementInfo = findElementAtPosition(body, position);

    matches.push({
      text: matchText,
      position: position,
      context: context,
      element: elementInfo.element,
      offset: elementInfo.offset
    });
  }

  return matches;
}

/**
 * Finds the element at a specific text position
 * @private
 * @param {Body} body - Document body
 * @param {number} position - Text position
 * @return {Object} Element info
 */
function findElementAtPosition(body, position) {
  var currentPosition = 0;

  for (var i = 0; i < body.getNumChildren(); i++) {
    var child = body.getChild(i);
    var childText = child.asText ? child.asText().getText() : child.getText();
    var childLength = childText.length + 1; // +1 for newline

    if (currentPosition + childLength > position) {
      return {
        element: child,
        offset: position - currentPosition
      };
    }

    currentPosition += childLength;
  }

  return {
    element: null,
    offset: 0
  };
}

/**
 * Calculates confidence score for a match
 * @private
 * @param {Object} match - Match object
 * @param {Object} pattern - Pattern object
 * @param {string} fullText - Full document text
 * @return {number} Confidence score (0-1)
 */
function calculateConfidence(match, pattern, fullText) {
  var confidence = pattern.baseScore;

  // Bonus: Followed by blank/empty space (likely a label)
  var afterMatch = fullText.substring(match.position + match.text.length, match.position + match.text.length + 10);
  if (afterMatch.match(/^\s*$/)) {
    confidence += 0.05;
  }

  // Bonus: In table context
  if (match.context.indexOf('|') !== -1) {
    confidence += 0.05;
  }

  // Bonus: Colon at end
  if (match.text.endsWith(':')) {
    confidence += 0.03;
  }

  // Penalty: Already has Arena token nearby
  var nearbyText = fullText.substring(
    Math.max(0, match.position - 50),
    Math.min(fullText.length, match.position + match.text.length + 50)
  );

  if (nearbyText.indexOf('{{ARENA:') !== -1) {
    confidence -= 0.15;
  }

  return Math.min(1.0, Math.max(0, confidence));
}

/**
 * Deduplicates suggestions by position
 * @private
 * @param {Array} suggestions - Array of suggestion objects
 * @return {Array} Deduplicated suggestions
 */
function deduplicateSuggestions(suggestions) {
  var seen = {};
  var unique = [];

  suggestions.forEach(function(suggestion) {
    var key = suggestion.position + ':' + suggestion.fieldName;

    if (!seen[key]) {
      seen[key] = true;
      unique.push(suggestion);
    }
  });

  return unique;
}

/**
 * Gets common abbreviations for a field name
 * @private
 * @param {string} fieldName - Field name
 * @return {Array} Array of abbreviations
 */
function getCommonAbbreviations(fieldName) {
  var abbr = [];
  var lower = fieldName.toLowerCase();

  // Standard PLM abbreviations
  var abbreviationMap = {
    'part number': ['P/N', 'PN', 'Part #'],
    'item number': ['Item #', 'Item No'],
    'revision': ['Rev', 'Rev.'],
    'description': ['Desc', 'Desc.'],
    'quantity': ['Qty', 'Qty.'],
    'owner': ['Owned By'],
    'created by': ['Creator', 'Author'],
    'lifecycle phase': ['Phase', 'Status'],
    'effectivity date': ['Eff Date', 'Effective']
  };

  for (var key in abbreviationMap) {
    if (lower.indexOf(key) !== -1) {
      abbr = abbr.concat(abbreviationMap[key]);
    }
  }

  return abbr;
}

/**
 * Gets common variations for a field name
 * @private
 * @param {string} fieldName - Field name
 * @return {Array} Array of variations
 */
function getCommonVariations(fieldName) {
  var variations = [];
  var lower = fieldName.toLowerCase();

  // Common variations
  var variationMap = {
    'part number': ['Item Number', 'Component Number'],
    'item number': ['Part Number'],
    'name': ['Title', 'Label'],
    'description': ['Summary', 'Details'],
    'owner': ['Responsible', 'Contact'],
    'created by': ['Created By User', 'Author Name']
  };

  for (var key in variationMap) {
    if (lower.indexOf(key) !== -1) {
      variations = variations.concat(variationMap[key]);
    }
  }

  return variations;
}

/**
 * Escapes special regex characters
 * @private
 * @param {string} str - String to escape
 * @return {string} Escaped string
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Inserts selected autodetected tokens
 * @param {Array} selectedSuggestions - Array of selected suggestion objects
 * @param {string} categoryGuid - Category GUID
 * @param {string} categoryName - Category name
 * @return {Object} Insertion result
 */
function insertAutodetectedTokens(selectedSuggestions, categoryGuid, categoryName) {
  try {
    var doc = DocumentApp.getActiveDocument();
    var body = doc.getBody();
    var tokensInserted = 0;

    // Sort by position descending (insert from end first to avoid position shifts)
    var sortedSuggestions = selectedSuggestions.slice().sort(function(a, b) {
      return b.position - a.position;
    });

    sortedSuggestions.forEach(function(suggestion) {
      try {
        // Re-find the element at this position (element refs don't survive serialization)
        var elementInfo = findElementAtPosition(body, suggestion.position + suggestion.matchedText.length);
        var element = elementInfo.element;
        var offset = elementInfo.offset;

        if (!element || !element.asText) {
          Logger.log('Could not find valid text element at position ' + suggestion.position);
          return;
        }

        // Insert token text
        var tokenText = '{{ARENA:' + categoryName + ':' + suggestion.fieldName + '}}';

        // Insert the token
        element.asText().insertText(offset, ' ' + tokenText);

        // Apply token styling
        var startIdx = offset + 1; // +1 for space
        element.asText().setBackgroundColor(startIdx, startIdx + tokenText.length - 1, '#E8F4F8');
        element.asText().setForegroundColor(startIdx, startIdx + tokenText.length - 1, '#1976D2');
        element.asText().setBold(startIdx, startIdx + tokenText.length - 1, true);

        // Create bookmark
        var bookmarkPos = doc.newPosition(element, startIdx);
        var bookmark = doc.addBookmark(bookmarkPos);

        // Store metadata
        var metadata = {
          bookmarkId: bookmark.getId(),
          tokenText: tokenText,
          categoryName: categoryName,
          categoryGuid: categoryGuid,
          fieldName: suggestion.fieldName,
          fieldType: suggestion.fieldType,
          attributeGuid: suggestion.attributeGuid,
          createdAt: new Date().toISOString(),
          source: 'autodetect',
          detectedFrom: suggestion.matchedText,
          confidence: suggestion.confidence
        };

        var docProps = PropertiesService.getDocumentProperties();
        docProps.setProperty('token_' + bookmark.getId(), JSON.stringify(metadata));

        tokensInserted++;

      } catch (error) {
        Logger.log('Error inserting token for ' + suggestion.fieldName + ': ' + error.message);
      }
    });

    return {
      success: true,
      tokensInserted: tokensInserted
    };

  } catch (error) {
    Logger.log('Error in batch token insertion: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
