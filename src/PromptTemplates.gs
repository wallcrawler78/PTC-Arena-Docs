/**
 * Prompt Templates for Document Generation
 * Provides structured prompts for different document types with Gemini
 */

/**
 * Gets the base system instructions for Gemini
 * @private
 * @return {string} System instructions
 */
function _getSystemInstructions() {
  return `You are a technical documentation specialist helping to create professional documents.

CRITICAL RULES FOR TOKEN PLACEMENT:
1. You MUST insert Arena field tokens using this EXACT format: {{ARENA:CATEGORY_NAME:FIELD_NAME}}
2. Place tokens where live data from Arena PLM should appear
3. Tokens must match the provided available fields list exactly
4. Common token placements:
   - Document title: Use {{ARENA:CATEGORY:NAME}}
   - Part numbers: Use {{ARENA:CATEGORY:NUMBER}}
   - Revision info: Use {{ARENA:CATEGORY:REVISION}}
   - Descriptions: Use {{ARENA:CATEGORY:DESCRIPTION}}
   - Owner/Author: Use {{ARENA:CATEGORY:OWNER}}
   - Lifecycle Phase: Use {{ARENA:CATEGORY:LIFECYCLE_PHASE}}
5. Use tokens naturally within sentences and tables
6. NEVER modify the token format - use it exactly as shown
7. Only use tokens from the provided available fields list

OUTPUT REQUIREMENTS:
- Generate complete, professional document text
- Use proper headings, sections, and formatting instructions
- Include token placeholders in appropriate locations
- Use markdown-style formatting (# for headings, ## for subheadings, **text** for bold)
- Create realistic content that would be useful in production
- Be thorough and detailed
- Include tables where appropriate
- Add placeholders for signatures, dates, and approval sections`;
}

/**
 * Document type templates with specific instructions
 */
var DOCUMENT_TYPE_TEMPLATES = {
  'SOP': {
    name: 'Standard Operating Procedure',
    instructions: 'Include: Purpose, Scope, Definitions, Responsibilities, Procedure steps (numbered), References, and Revision history section. Use formal, procedural language. Each step should be clear and actionable.',
    suggestedSections: ['1. Purpose', '2. Scope', '3. Definitions', '4. Responsibilities', '5. Procedure', '6. References', '7. Revision History'],
    exampleStructure: '# Standard Operating Procedure\n## 1. Purpose\n[Purpose text]\n## 2. Scope\n...'
  },
  'WORK_INSTRUCTION': {
    name: 'Work Instruction',
    instructions: 'Include: Overview, Tools & Materials Required, Safety Warnings, Step-by-step instructions (with sub-steps), Quality checkpoints, and Troubleshooting. Use clear, concise language. Focus on HOW to do the task.',
    suggestedSections: ['Overview', 'Tools & Materials', 'Safety', 'Instructions', 'Quality Checks', 'Troubleshooting'],
    exampleStructure: '# Work Instruction: [Task Name]\n## Overview\n## Tools & Materials\n## Safety Precautions\n## Instructions\n### Step 1: ...'
  },
  'POLICY': {
    name: 'Policy Document',
    instructions: 'Include: Policy Statement, Purpose, Scope, Policy Details, Roles & Responsibilities, Compliance requirements, and Review schedule. Use authoritative, formal language. Make requirements clear.',
    suggestedSections: ['Policy Statement', 'Purpose', 'Scope', 'Policy Details', 'Responsibilities', 'Compliance', 'Review'],
    exampleStructure: '# Policy: [Policy Name]\n## Policy Statement\n## Purpose\n## Scope\n...'
  },
  'TECHNICAL_SPEC': {
    name: 'Technical Specification',
    instructions: 'Include: Overview, Technical Requirements, Specifications table, Performance criteria, Testing requirements, and Acceptance criteria. Use precise technical language. Include measurable specifications.',
    suggestedSections: ['Overview', 'Requirements', 'Specifications', 'Performance', 'Testing', 'Acceptance'],
    exampleStructure: '# Technical Specification\n## Overview\n## Requirements\n## Specifications\n| Parameter | Value | Tolerance |\n|---|---|---|'
  },
  'TEST_PROCEDURE': {
    name: 'Test Procedure',
    instructions: 'Include: Test Overview, Equipment needed, Setup instructions, Test steps, Pass/Fail criteria, and Results documentation. Use clear, methodical language. Make pass/fail criteria measurable.',
    suggestedSections: ['Overview', 'Equipment', 'Setup', 'Test Steps', 'Criteria', 'Results'],
    exampleStructure: '# Test Procedure\n## Overview\n## Equipment Required\n## Setup\n## Test Steps\n### Test 1: ...'
  },
  'ASSEMBLY_GUIDE': {
    name: 'Assembly Guide',
    instructions: 'Include: Parts list (with Arena tokens for part numbers), Tools required, Assembly sequence (step-by-step with diagrams placeholders), Quality checks at each stage, and Final inspection. Use visual, step-by-step language.',
    suggestedSections: ['Parts List', 'Tools Required', 'Assembly Steps', 'Quality Checks', 'Final Inspection'],
    exampleStructure: '# Assembly Guide\n## Parts List\n| Part Number | Description | Quantity |\n## Assembly Steps\n### Step 1: ...'
  }
};

/**
 * Builds the complete prompt for document generation
 * @param {Object} wizardData - Data from wizard (category, fields, user prompt, etc.)
 * @return {string} Complete prompt for Gemini
 */
function buildDocumentPrompt(wizardData) {
  var systemInstructions = _getSystemInstructions();

  var availableFields = wizardData.selectedFields.map(function(field) {
    return '- {{ARENA:' + wizardData.categoryName + ':' + field.displayName + '}} - ' + field.description;
  }).join('\n');

  var documentType = wizardData.documentType;
  var template = DOCUMENT_TYPE_TEMPLATES[documentType];
  var parameters = wizardData.parameters || {};
  var userPrompt = wizardData.userPrompt;

  var prompt = systemInstructions + '\n\n';
  prompt += '---\n\n';
  prompt += 'DOCUMENT TYPE: ' + (template ? template.name : documentType) + '\n\n';

  if (template) {
    prompt += 'DOCUMENT STRUCTURE GUIDANCE:\n';
    prompt += template.instructions + '\n\n';
    prompt += 'Suggested sections: ' + template.suggestedSections.join(', ') + '\n\n';
  }

  prompt += 'CATEGORY: ' + wizardData.categoryName + '\n\n';
  prompt += 'AVAILABLE ARENA FIELDS (use these tokens in your document):\n';
  prompt += availableFields + '\n\n';

  prompt += 'DOCUMENT PARAMETERS:\n';
  prompt += '- Tone: ' + (parameters.tone || 'Professional') + '\n';
  prompt += '- Length: ' + (parameters.length || 'Medium (3-5 pages)') + '\n';
  prompt += '- Include Table of Contents: ' + (parameters.includeTOC ? 'Yes' : 'No') + '\n';
  prompt += '- Include Revision Table: ' + (parameters.includeRevisionTable ? 'Yes' : 'No') + '\n';
  prompt += '- Include Approval Section: ' + (parameters.includeApprovalSection !== false ? 'Yes' : 'No') + '\n\n';

  prompt += 'USER REQUIREMENTS:\n';
  prompt += userPrompt + '\n\n';

  prompt += '---\n\n';
  prompt += 'Now generate the complete document following the guidance above. Remember:\n';
  prompt += '- Use the Arena tokens EXACTLY as shown ({{ARENA:' + wizardData.categoryName + ':FIELD_NAME}})\n';
  prompt += '- Place tokens where Arena data should appear (titles, part numbers, descriptions, etc.)\n';
  prompt += '- Use markdown formatting for headings (# and ##) and bold (**text**)\n';
  prompt += '- Create a professional, production-ready document\n';
  prompt += '- Be thorough and include all relevant sections\n\n';
  prompt += 'BEGIN DOCUMENT GENERATION:';

  return prompt;
}

/**
 * Enhances user prompt with document type specific guidance
 * @param {string} userPrompt - Original user prompt
 * @param {string} documentType - Document type key
 * @return {string} Enhanced prompt
 */
function enhancePromptWithTemplate(userPrompt, documentType) {
  var template = DOCUMENT_TYPE_TEMPLATES[documentType];
  if (!template) return userPrompt;

  var enhanced = userPrompt;

  if (!userPrompt || userPrompt.trim() === '') {
    // Provide default prompt if user didn't enter anything
    enhanced = 'Create a comprehensive ' + template.name + ' following industry best practices.';
  }

  enhanced += '\n\nDOCUMENT STRUCTURE GUIDANCE:\n';
  enhanced += template.instructions + '\n\n';
  enhanced += 'Suggested sections: ' + template.suggestedSections.join(', ');

  return enhanced;
}

/**
 * Gets document type display information
 * @return {Array} Array of document type objects for UI
 */
function getDocumentTypes() {
  var types = [];

  for (var key in DOCUMENT_TYPE_TEMPLATES) {
    if (DOCUMENT_TYPE_TEMPLATES.hasOwnProperty(key)) {
      var template = DOCUMENT_TYPE_TEMPLATES[key];
      types.push({
        key: key,
        name: template.name,
        description: template.instructions
      });
    }
  }

  return types;
}
