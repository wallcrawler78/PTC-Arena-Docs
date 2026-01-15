/**
 * Document Generator
 * Orchestrates Gemini-powered document generation with Arena tokens
 */

/**
 * Generates a complete document with Arena tokens using Gemini AI
 * @param {Object} wizardData - Data from the wizard
 * @param {string} wizardData.categoryName - Category name
 * @param {string} wizardData.categoryGuid - Category GUID
 * @param {Array} wizardData.selectedFields - Array of field objects
 * @param {string} wizardData.documentType - Document type key (SOP, WORK_INSTRUCTION, etc.)
 * @param {Object} wizardData.parameters - Generation parameters (tone, length, etc.)
 * @param {string} wizardData.userPrompt - User's description of desired document
 * @return {Object} Generation result
 */
function generateDocumentWithGemini(wizardData) {
  try {
    // 1. Validate input
    if (!wizardData || !wizardData.categoryName || !wizardData.selectedFields) {
      return {
        success: false,
        error: 'Invalid wizard data. Category and fields are required.'
      };
    }

    if (!wizardData.userPrompt || wizardData.userPrompt.trim() === '') {
      return {
        success: false,
        error: 'Please provide a description of the document you want to generate.'
      };
    }

    // 2. Validate Gemini API access
    var geminiClient = createGeminiClient();
    var accessCheck = geminiClient.validateAccess();

    if (!accessCheck.success) {
      return {
        success: false,
        error: 'Gemini API access failed: ' + accessCheck.error,
        message: 'Unable to access Gemini API. Please ensure the Generative Language API is enabled in your Google Cloud Console.'
      };
    }

    // 3. Build prompt
    var prompt = buildDocumentPrompt(wizardData);

    Logger.log('Generating document with prompt length: ' + prompt.length);

    // 4. Generate content with Gemini
    var generationOptions = {
      temperature: wizardData.parameters.temperature || 0.7,
      maxTokens: _calculateMaxTokens(wizardData.parameters.length),
      topP: 0.95,
      topK: 40
    };

    var geminiResponse = geminiClient.generateContent(prompt, generationOptions);

    if (!geminiResponse || !geminiResponse.text) {
      return {
        success: false,
        error: 'Gemini did not return any content',
        finishReason: geminiResponse.finishReason
      };
    }

    // 5. Extract tokens from generated content
    var extractionResult = extractTokensFromContent(geminiResponse.text);

    // 6. Validate tokens
    var validation = validateGeneratedTokens(
      extractionResult.tokens,
      wizardData.categoryName,
      wizardData.selectedFields
    );

    // 7. Store generation metadata
    var metadata = {
      generatedAt: new Date().toISOString(),
      model: geminiResponse.model,
      documentType: wizardData.documentType,
      categoryName: wizardData.categoryName,
      categoryGuid: wizardData.categoryGuid,
      promptLength: prompt.length,
      tokensFound: extractionResult.tokens.length,
      validTokens: validation.validTokens.length,
      invalidTokens: validation.invalidTokens.length,
      usageMetadata: geminiResponse.usageMetadata,
      finishReason: geminiResponse.finishReason
    };

    // 8. Return result
    return {
      success: true,
      content: geminiResponse.text,
      tokens: extractionResult.tokens,
      tokenCount: extractionResult.tokens.length,
      metadata: metadata,
      warnings: validation.warnings,
      validTokens: validation.validTokens,
      invalidTokens: validation.invalidTokens
    };

  } catch (error) {
    Logger.log('Document generation error: ' + error.message);
    return {
      success: false,
      error: error.message,
      message: 'Failed to generate document. Please try again.'
    };
  }
}

/**
 * Extracts Arena tokens from generated content
 * @private
 * @param {string} content - Generated document content
 * @return {Object} Extraction result with tokens array
 */
function extractTokensFromContent(content) {
  var tokenRegex = /\{\{ARENA:([^:]+):([^}]+)\}\}/g;
  var tokens = [];
  var match;
  var uniqueTokens = {};

  while ((match = tokenRegex.exec(content)) !== null) {
    var tokenText = match[0];
    var categoryName = match[1];
    var fieldName = match[2];

    // Deduplicate tokens
    if (!uniqueTokens[tokenText]) {
      uniqueTokens[tokenText] = true;
      tokens.push({
        tokenText: tokenText,
        categoryName: categoryName,
        fieldName: fieldName,
        position: match.index
      });
    }
  }

  Logger.log('Extracted ' + tokens.length + ' unique tokens from generated content');

  return {
    tokens: tokens,
    content: content
  };
}

/**
 * Validates that generated tokens match selected fields
 * @private
 * @param {Array} tokens - Extracted tokens
 * @param {string} expectedCategory - Expected category name
 * @param {Array} selectedFields - Selected field objects
 * @return {Object} Validation result
 */
function validateGeneratedTokens(tokens, expectedCategory, selectedFields) {
  var validTokens = [];
  var invalidTokens = [];
  var warnings = [];

  // Build lookup map of valid field names
  var validFieldNames = {};
  selectedFields.forEach(function(field) {
    validFieldNames[field.displayName] = true;
    validFieldNames[field.displayName.toUpperCase()] = true;
    validFieldNames[field.displayName.toLowerCase()] = true;
  });

  // Validate each token
  tokens.forEach(function(token) {
    var isValid = true;
    var issues = [];

    // Check category name matches
    if (token.categoryName !== expectedCategory) {
      isValid = false;
      issues.push('Category mismatch (expected "' + expectedCategory + '", got "' + token.categoryName + '")');
    }

    // Check field name is in selected fields (case-insensitive)
    if (!validFieldNames[token.fieldName] &&
        !validFieldNames[token.fieldName.toUpperCase()] &&
        !validFieldNames[token.fieldName.toLowerCase()]) {
      isValid = false;
      issues.push('Field "' + token.fieldName + '" not in selected fields');
    }

    if (isValid) {
      validTokens.push(token);
    } else {
      invalidTokens.push({
        token: token,
        issues: issues
      });
      warnings.push('Invalid token: ' + token.tokenText + ' - ' + issues.join(', '));
    }
  });

  // Log validation results
  if (invalidTokens.length > 0) {
    Logger.log('Token validation found ' + invalidTokens.length + ' invalid tokens:');
    warnings.forEach(function(warning) {
      Logger.log('  - ' + warning);
    });
  }

  return {
    validTokens: validTokens,
    invalidTokens: invalidTokens,
    warnings: warnings,
    isFullyValid: invalidTokens.length === 0
  };
}

/**
 * Calculates max tokens based on desired document length
 * @private
 * @param {string} length - Length parameter (Short/Medium/Long)
 * @return {number} Max token count
 */
function _calculateMaxTokens(length) {
  switch (length) {
    case 'Short (1-2 pages)':
      return 2048;
    case 'Medium (3-5 pages)':
      return 4096;
    case 'Long (6+ pages)':
      return 8192;
    default:
      return 4096; // Default to medium
  }
}

/**
 * Regenerates document with modified parameters
 * This is called when user clicks "Regenerate" in preview
 * @param {Object} wizardData - Original wizard data
 * @param {Object} modifications - Modified parameters
 * @return {Object} Generation result
 */
function regenerateDocument(wizardData, modifications) {
  // Merge modifications into wizard data
  var modifiedData = Object.assign({}, wizardData);

  if (modifications.userPrompt) {
    modifiedData.userPrompt = modifications.userPrompt;
  }

  if (modifications.parameters) {
    modifiedData.parameters = Object.assign({}, wizardData.parameters, modifications.parameters);
  }

  return generateDocumentWithGemini(modifiedData);
}

/**
 * Gets example prompts for document types to help users
 * @param {string} documentType - Document type key
 * @return {Array} Array of example prompts
 */
function getExamplePrompts(documentType) {
  var examples = {
    'SOP': [
      'Create a standard operating procedure for quality inspection of incoming materials',
      'Generate an SOP for equipment calibration and maintenance tracking',
      'Write a procedure for handling non-conforming products'
    ],
    'WORK_INSTRUCTION': [
      'Create step-by-step instructions for assembling the main circuit board',
      'Generate a work instruction for soldering SMD components',
      'Write instructions for packaging and labeling finished products'
    ],
    'POLICY': [
      'Create a document control policy with version management requirements',
      'Generate a supplier quality policy with audit requirements',
      'Write an environmental compliance policy for manufacturing'
    ],
    'TECHNICAL_SPEC': [
      'Create technical specifications for a power supply with performance requirements',
      'Generate specifications for mechanical enclosure with dimensional tolerances',
      'Write technical requirements for software interface protocol'
    ],
    'TEST_PROCEDURE': [
      'Create a test procedure for verifying electrical safety compliance',
      'Generate a functional test procedure with pass/fail criteria',
      'Write environmental stress testing procedure with acceptance limits'
    ],
    'ASSEMBLY_GUIDE': [
      'Create an assembly guide for final product integration with quality checkpoints',
      'Generate step-by-step assembly instructions for mechanical subassembly',
      'Write an assembly guide including torque specifications and inspection points'
    ]
  };

  return examples[documentType] || [];
}

/**
 * Previews how many tokens would be used for a generation request
 * This helps users understand API usage before generating
 * @param {Object} wizardData - Wizard data
 * @return {Object} Token estimate
 */
function estimateTokenUsage(wizardData) {
  var prompt = buildDocumentPrompt(wizardData);
  var estimatedInputTokens = Math.ceil(prompt.length / 4); // Rough estimate: 4 chars per token
  var maxOutputTokens = _calculateMaxTokens(wizardData.parameters.length);

  return {
    estimatedInputTokens: estimatedInputTokens,
    maxOutputTokens: maxOutputTokens,
    totalEstimate: estimatedInputTokens + maxOutputTokens,
    promptLength: prompt.length
  };
}
