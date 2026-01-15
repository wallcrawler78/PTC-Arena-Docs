# AI Document Generation Feature

## Overview
The AI Document Generation feature uses Google Gemini AI to automatically generate professional documents with Arena PLM tokens pre-placed in the correct locations. This significantly speeds up document template creation and reduces manual token placement work.

## Key Features

### 1. **AI Document Generation Wizard**
A 5-step wizard that guides users through creating complete documents:

1. **Category & Field Selection** - Choose Arena category and fields to include
2. **Document Type Selection** - Select from 6 professional templates
3. **Parameters** - Configure tone, length, and formatting options
4. **Description** - Describe desired document content in natural language
5. **Preview & Insert** - Review generated content with token highlighting

### 2. **Autodetect Field Tokens**
Intelligent fuzzy matching that scans existing documents and suggests token placements:
- Pattern recognition with multiple variations (exact, abbreviations, common terms)
- Confidence scoring (75-100%)
- Context-aware suggestions
- Batch insertion with approval workflow

## Document Types

The system includes templates for 6 professional document types:

| Type | Description | Key Sections |
|------|-------------|-------------|
| **SOP** | Standard Operating Procedure | Purpose, Scope, Definitions, Responsibilities, Procedure, References, Revision History |
| **Work Instruction** | Step-by-step task instructions | Overview, Tools & Materials, Safety, Instructions, Quality Checks, Troubleshooting |
| **Policy** | Policy documents | Policy Statement, Purpose, Scope, Policy Details, Responsibilities, Compliance, Review |
| **Technical Spec** | Technical specifications | Overview, Requirements, Specifications, Performance, Testing, Acceptance |
| **Test Procedure** | Testing procedures | Overview, Equipment, Setup, Test Steps, Criteria, Results |
| **Assembly Guide** | Assembly instructions | Parts List, Tools Required, Assembly Steps, Quality Checks, Final Inspection |

## Technical Architecture

### Files Structure

```
src/
├── GeminiAPI.gs              # Gemini API OAuth client
├── PromptTemplates.gs        # Document templates and prompt engineering
├── DocumentGenerator.gs      # Generation orchestration and validation
├── DocumentInsertion.gs      # Content insertion with markdown parsing
└── TokenAutodetect.gs        # Fuzzy matching algorithm

html/
├── DocumentGenerationWizard.html  # 5-step wizard UI
└── AutodetectDialog.html          # Autodetect suggestions UI
```

### API Integration

**Authentication**: OAuth-based using Google Apps Script's `ScriptApp.getOAuthToken()`
- No API key management required
- Uses user's existing Google credentials
- Requires `https://www.googleapis.com/auth/generative-language` scope

**Model**: Gemini 1.5 Flash (`gemini-1.5-flash-latest`)
- Fast generation (10-30 seconds)
- Cost-effective for document generation
- 8K max output tokens for long documents

### Token Format

Generated tokens follow the exact format:
```
{{ARENA:CATEGORY_NAME:FIELD_NAME}}
```

Example:
```
{{ARENA:PCB_Assembly:Part Number}}
{{ARENA:PCB_Assembly:Revision}}
{{ARENA:PCB_Assembly:Owner}}
```

### Prompt Engineering

The system uses carefully crafted prompts with:

1. **System Instructions** - Critical rules for token placement
2. **Document Type Guidance** - Structure and formatting requirements
3. **Available Fields** - List of valid tokens
4. **User Requirements** - Custom description of desired content
5. **Parameters** - Tone, length, and options

### Token Validation

After generation, the system validates:
- Token format is exactly `{{ARENA:CATEGORY:FIELD}}`
- Category name matches selected category
- Field names exist in selected fields
- No hallucinated or invalid tokens

### Autodetect Algorithm

**Pattern Generation** (per field):
1. Exact with colon (score: 1.0) - `"Part Number:"`
2. Exact word boundary (0.95) - `\bPart Number\b`
3. Underscores (0.9) - `"Part_Number:"`
4. Abbreviations (0.85) - `"P/N:"` for "Part Number"
5. Case variations (0.8)
6. Common variations (0.75) - `"Item Number"` for "Part Number"

**Confidence Scoring**:
- Base score from pattern type
- +0.05 if followed by blank space (likely a label)
- +0.05 if in table context
- +0.03 if ends with colon
- -0.15 if Arena token already nearby

**Threshold**: Only suggests matches ≥75% confidence

## Usage

### Generating a New Document

1. **Menu**: Arena PLM > Document Generation > Generate with AI...
2. **Login**: Ensure logged into Arena PLM
3. **Select Category**: Choose category containing relevant fields
4. **Select Fields**: Multi-select fields to include (standard fields auto-selected)
5. **Choose Document Type**: Select from 6 templates
6. **Configure Parameters**:
   - Tone: Professional / Technical / Formal
   - Length: Short (1-2 pages) / Medium (3-5) / Long (6+)
   - Options: Table of Contents, Revision Table, Approval Section
7. **Describe Document**: Enter natural language description
   - Example: "Create an SOP for quality inspection of incoming electronic components"
8. **Review Preview**: Generated content with tokens highlighted
9. **Insert**: Choose "at cursor" or "replace entire document"

### Using Autodetect

1. **Menu**: Arena PLM > Document Generation > Autodetect Field Tokens...
2. **Select Category**: Choose category with fields to detect
3. **Scan**: System analyzes document for patterns
4. **Review Suggestions**:
   - Green badges (90%+): High confidence
   - Orange badges (75-90%): Medium confidence
   - Context shows where match was found
5. **Select**: Check/uncheck suggestions to approve
6. **Insert**: Batch insert all selected tokens

## Metadata Storage

Each generated or autodetected token stores metadata:

```javascript
{
  bookmarkId: "bookmark_id",
  tokenText: "{{ARENA:Category:Field}}",
  categoryName: "Category",
  categoryGuid: "guid",
  fieldName: "Field",
  fieldType: "SINGLELINE",
  attributeGuid: "attr_guid",
  createdAt: "2025-01-14T...",
  source: "gemini_generation" | "autodetect",

  // Autodetect only:
  detectedFrom: "Part Number:",
  confidence: 0.95
}
```

## Token Styling

Tokens are visually styled for easy identification:
- **Background**: Light blue (#E8F4F8)
- **Text Color**: Blue (#1976D2)
- **Font Weight**: Bold
- **Font Family**: Courier New (in generated preview)

## Document Formatting

Generated documents support markdown-style formatting:

- `# Heading` → HEADING1
- `## Heading` → HEADING2
- `### Heading` → HEADING3
- `**bold text**` → **bold text**
- Table markdown → Google Docs table

Example:
```markdown
# Standard Operating Procedure
## 1. Purpose
This procedure defines the process for **quality inspection**...

## 2. Scope
Part Number: {{ARENA:PCB_Assembly:Part Number}}
Revision: {{ARENA:PCB_Assembly:Revision}}
```

## Error Handling

The system handles common errors gracefully:

1. **Gemini API Errors**:
   - 429 (Rate Limit): "Please try again in a few moments"
   - 403 (Access Denied): Instructions to enable Generative Language API
   - 401 (Auth): "Please try logging out and back in"

2. **Validation Errors**:
   - Invalid tokens: Warning shown with list of issues
   - Missing fields: Prevents generation
   - Empty prompts: Provides default template-specific prompt

3. **Insertion Errors**:
   - No cursor: "Please place your cursor"
   - Network errors: Retry with exponential backoff

## Performance

**Generation Speed**:
- Short documents (1-2 pages): 5-15 seconds
- Medium documents (3-5 pages): 15-25 seconds
- Long documents (6+ pages): 25-40 seconds

**Autodetect Speed**:
- 100 fields x 1000 words: ~2-5 seconds
- Results cached during session

## Security

- **OAuth Authentication**: Uses user's Google credentials
- **No API Keys**: Zero risk of key exposure
- **Scope Limited**: Only `generative-language` access
- **Arena Credentials**: Stored in UserProperties (encrypted by Google)
- **Token Validation**: Prevents injection of invalid tokens

## Best Practices

### For Document Generation

1. **Be Specific**: Detailed prompts yield better results
   - ✅ "Create an SOP for visual and electrical inspection of PCBs with specific test points and acceptance criteria"
   - ❌ "Create an SOP"

2. **Select Relevant Fields**: Only include fields you'll actually use
   - Standard fields (Name, Number, Revision) usually auto-selected
   - Add custom fields as needed

3. **Review Before Inserting**: Always preview generated content
   - Check token placement makes sense
   - Verify no hallucinated fields
   - Use "Regenerate" if needed

4. **Start Medium Length**: Medium (3-5 pages) is a good default
   - Can expand or trim after generation
   - Shorter = faster but less detail

### For Autodetect

1. **Use After Manual Labeling**: Best results when document already has field labels
   - Example: "Part Number: _____" → Autodetect suggests inserting token after "Part Number:"

2. **Review Confidence Scores**:
   - Green (90%+): Usually safe to accept
   - Orange (75-90%): Review context carefully
   - Consider rejecting low-confidence matches

3. **Check Context**: Always read surrounding text
   - Ensure token placement makes semantic sense
   - Watch for false positives (e.g., "Owner" in "homeowner")

4. **One Category at a Time**: Run autodetect separately for each category
   - Prevents field name conflicts
   - Easier to review suggestions

## Limitations

1. **Gemini API Quota**: Subject to Google's usage limits
   - Typically generous for individual users
   - Rate limiting handled automatically

2. **Token Format Strictness**: Must be exact `{{ARENA:CATEGORY:FIELD}}`
   - Gemini occasionally deviates (validated and warned)
   - User can fix in preview before inserting

3. **English Language**: Prompts and templates optimized for English
   - Other languages may work but not tested

4. **No Image Generation**: Text-only document generation
   - Placeholders for diagrams suggested but not created

5. **Autodetect False Positives**: Pattern matching can over-match
   - "Owner" might match "homeowner"
   - Always review suggestions before inserting

## Troubleshooting

### "Gemini API access denied"
**Solution**: Enable the Generative Language API in Google Cloud Console
1. Go to console.cloud.google.com
2. Select your Apps Script project
3. Enable "Generative Language API"

### "No token opportunities found"
**Possible causes**:
- Document doesn't have field labels yet
- Field names don't match common patterns
- Different category selected than document expects

**Solutions**:
- Add field labels manually first (e.g., "Part Number:")
- Try different category
- Use manual token insertion instead

### "Generation taking too long"
**Causes**:
- Very long document requested
- High API load

**Solutions**:
- Try "Short" or "Medium" length
- Wait a moment and try again
- Check internet connection

### "Invalid tokens generated"
**Why**: Gemini occasionally hallucinates field names

**Solution**: Review warnings in preview, regenerate, or manually edit tokens before inserting

## Future Enhancements

Potential improvements for future versions:

1. **Template Library**: Save/load custom document templates
2. **Multi-language Support**: Internationalization
3. **Batch Generation**: Generate multiple documents at once
4. **Smart Suggestions**: Learn from user's token placement patterns
5. **Version History**: Track document generation iterations
6. **Custom Prompts**: Allow users to define custom system instructions
7. **Table Detection**: Better table parsing and token placement in cells
8. **Image Placeholders**: Suggest specific diagram types

## Related Documentation

- [Google-and-Arena-working-together.md](./Google-and-Arena-working-together.md) - Original integration concept
- [LESSONS_LEARNED.md](./LESSONS_LEARNED.md) - Development insights
- [README.md](../README.md) - Project overview

## Support

For issues or questions:
1. Check error messages in UI
2. Review Apps Script logs (View > Logs in Apps Script editor)
3. Verify Arena login is active
4. Ensure Generative Language API is enabled
5. Check GitHub issues: https://github.com/wallcrawler78/PTC-Arena-Docs/issues
