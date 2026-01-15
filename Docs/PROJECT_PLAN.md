# PTC Arena Docs - Project Plan

## Project Overview

A Google Docs add-on that enables merge-field capabilities with PTC Arena PLM data. Users can map Arena item fields to document tokens, search for items, and populate documents with live Arena data.

## Core Functionality

### 1. Category-Based Field Mapping
- Display available Arena categories to user
- Show fields/attributes for selected category
- Map category fields to custom tokens
- Store token mappings for reuse

### 2. Token/Anchor System
- Create draggable tokens representing Arena fields
- Insert tokens into document as named ranges/bookmarks
- Visual representation of tokens in document
- Token metadata storage (category, field, formatting)

### 3. Arena Search Integration
- Search Arena items by number, name, or attributes
- Filter by category
- Preview item details before selection
- Cache search results for performance

### 4. Document Population
- Select Arena item to populate document
- Replace tokens with actual field values
- Maintain formatting and styling
- Support multiple items in same document

### 5. Document Revisioning
- **Replace in Place**: Update current document
- **Make Copy**: Create new versioned document
- **Preview Changes**: Show what will change before applying
- Track which Arena item/revision is linked

## Technical Architecture

### Apps Script Structure

```
src/
├── Code.gs                 # Main menu and initialization
├── ArenaAPI.gs            # Arena API client (adapted from Sheets version)
├── CategoryManager.gs     # Category and field management
├── TokenManager.gs        # Token creation and management
├── DocumentPopulator.gs   # Document merge functionality
├── SearchDialog.gs        # Arena search functionality
├── RevisionManager.gs     # Document versioning logic
└── Utils.gs               # Common utilities

html/
├── CategorySelector.html  # Choose category and map fields
├── TokenPalette.html      # Drag-and-drop token interface
├── SearchDialog.html      # Arena item search
├── PopulateDialog.html    # Select item and populate
├── RevisionDialog.html    # Revision options
└── styles.html            # Shared CSS

appsscript.json            # Apps Script configuration
.clasp.json                # Clasp configuration
```

### Token Format

Tokens will be inserted as named ranges with special formatting:

```
{{ARENA:CATEGORY_NAME:FIELD_NAME}}
```

Examples:
- `{{ARENA:RESISTOR:PART_NUMBER}}`
- `{{ARENA:ASSEMBLY:NAME}}`
- `{{ARENA:DOCUMENT:REVISION}}`

Stored as bookmarks with metadata:
```json
{
  "categoryGuid": "abc123",
  "categoryName": "Resistor",
  "fieldName": "partNumber",
  "fieldType": "standard|custom",
  "attributeGuid": "xyz789",
  "formatting": {
    "bold": true,
    "fontSize": 12
  }
}
```

### Menu Structure

```
Arena PLM
├── Login / Logout
├── ─────────────────
├── Insert Tokens
│   ├── Select Category...
│   └── Show Token Palette
├── ─────────────────
├── Populate from Arena
│   ├── Search Item...
│   ├── Quick Search (by number)
│   └── Clear All Tokens
├── ─────────────────
├── Revisions
│   ├── Update in Place
│   ├── Create Revised Copy
│   └── Show Change Preview
├── ─────────────────
└── Settings
    ├── Manage Token Mappings
    └── Cache Management
```

## User Workflow

### Setup Workflow

1. User opens Google Doc
2. Selects **Arena PLM > Insert Tokens > Select Category**
3. Logs into Arena (if needed)
4. Chooses category (e.g., "Resistor")
5. System shows available fields:
   - Standard: Number, Name, Description, Revision
   - Custom: Resistance Value, Tolerance, Power Rating, etc.
6. User creates tokens for desired fields
7. Token palette opens showing available tokens

### Document Creation Workflow

1. User drags tokens from palette into document
2. Tokens appear as styled placeholders: `{{ARENA:RESISTOR:PART_NUMBER}}`
3. User arranges tokens in desired layout
4. User selects **Arena PLM > Populate from Arena > Search Item**
5. Searches for specific item (e.g., "RES-001")
6. Previews item details
7. Clicks "Populate Document"
8. All tokens replaced with actual values from Arena

### Revision Workflow

1. Item in Arena is updated (new revision)
2. User opens document with populated tokens
3. Selects **Arena PLM > Revisions > Show Change Preview**
4. System compares current document values with latest Arena data
5. Shows diff of changes
6. User chooses:
   - **Update in Place**: Replaces values in current document
   - **Create Revised Copy**: Makes new document with updated values
   - **Cancel**: Keep current document as-is

## Key Implementation Details

### Token Insertion Strategy

Google Docs doesn't have "anchors" like HTML, so we'll use:
1. **Named Ranges** - Primary method for token placement
2. **Bookmarks** - Store token metadata
3. **Text Style** - Visual distinction (background color, special font)

```javascript
function insertToken(categoryName, fieldName, fieldGuid) {
  var doc = DocumentApp.getActiveDocument();
  var cursor = doc.getCursor();

  if (!cursor) {
    showAlert('Please place cursor where token should be inserted');
    return;
  }

  // Create token text
  var tokenText = '{{ARENA:' + categoryName + ':' + fieldName + '}}';

  // Insert with special formatting
  var element = cursor.insertText(tokenText);
  element.setBackgroundColor('#E8F4F8')
         .setForegroundColor('#1976D2')
         .setBold(true);

  // Create bookmark for metadata
  var position = doc.newPosition(element, 0);
  var bookmark = doc.addBookmark(position);

  // Store metadata in document properties
  var props = PropertiesService.getDocumentProperties();
  var metadata = {
    bookmarkId: bookmark.getId(),
    categoryName: categoryName,
    fieldName: fieldName,
    fieldGuid: fieldGuid,
    tokenText: tokenText
  };

  props.setProperty('token_' + bookmark.getId(), JSON.stringify(metadata));
}
```

### Document Population Strategy

```javascript
function populateDocument(itemGuid) {
  var client = new ArenaAPIClient();
  var item = client.getItem(itemGuid);

  // Get all token metadata
  var props = PropertiesService.getDocumentProperties();
  var allProps = props.getProperties();

  var tokens = Object.keys(allProps)
    .filter(key => key.startsWith('token_'))
    .map(key => JSON.parse(allProps[key]));

  // Replace each token
  tokens.forEach(function(token) {
    var value = getFieldValue(item, token.fieldName, token.fieldGuid);
    replaceTokenInDocument(token.tokenText, value);
  });

  // Store link to Arena item
  props.setProperty('arena_item_guid', itemGuid);
  props.setProperty('arena_item_number', item.number);
  props.setProperty('arena_populated_date', new Date().toISOString());
}

function replaceTokenInDocument(tokenText, value) {
  var doc = DocumentApp.getActiveDocument();
  var body = doc.getBody();

  // Find and replace
  var searchResult = body.findText(tokenText);

  while (searchResult) {
    var element = searchResult.getElement();
    var start = searchResult.getStartOffset();
    var end = searchResult.getEndOffsetInclusive();

    // Replace text but keep bookmark
    element.asText().deleteText(start, end);
    element.asText().insertText(start, value);

    // Optionally remove token styling
    element.asText().setBackgroundColor(start, start + value.length - 1, null);
    element.asText().setForegroundColor(start, start + value.length - 1, null);

    searchResult = body.findText(tokenText, searchResult);
  }
}
```

### Change Detection for Revisions

```javascript
function detectChanges(itemGuid) {
  var props = PropertiesService.getDocumentProperties();
  var currentItemGuid = props.getProperty('arena_item_guid');

  if (currentItemGuid !== itemGuid) {
    return { error: 'Document linked to different item' };
  }

  var client = new ArenaAPIClient();
  var currentItem = client.getItem(itemGuid);

  var tokens = getDocumentTokens();
  var changes = [];

  tokens.forEach(function(token) {
    var currentValue = getTokenValueInDocument(token.tokenText);
    var arenaValue = getFieldValue(currentItem, token.fieldName, token.fieldGuid);

    if (currentValue !== arenaValue) {
      changes.push({
        token: token.tokenText,
        field: token.fieldName,
        currentValue: currentValue,
        newValue: arenaValue
      });
    }
  });

  return changes;
}
```

## Arena API Integration

### Reusing Existing Patterns

We'll adapt the Google Sheets Arena API client with these key components:

1. **Authentication**: Session-based login with PropertiesService storage
2. **Caching**: Category and item data caching (6-hour TTL)
3. **Error Handling**: 401 auto-retry, user-friendly error messages
4. **Performance**: Batch fetching, local checks before API calls

### Key API Endpoints Used

- `POST /login` - Authenticate
- `GET /settings/items/categories` - Get available categories
- `GET /items/{guid}` - Get single item details
- `GET /items/{guid}?responseview=full` - Get item with attributes
- `GET /items?limit=400` - Search items (with caching)

## Development Workflow

### Using Clasp

```bash
# Initial setup
npm install -g @google/clasp
clasp login

# Create project
clasp create --type docs --title "Arena PLM for Docs"

# Push changes
clasp push

# Pull changes
clasp pull

# Open in editor
clasp open
```

### Testing Strategy

1. **Unit Testing**: Test individual functions with sample data
2. **Integration Testing**: Test with real Arena API (development workspace)
3. **User Testing**: Document templates with various token configurations

### Development Phases

**Phase 1: Foundation** (Week 1)
- ✓ Git repository setup
- ✓ Project structure
- ✓ Arena API client
- ✓ Basic menu system
- ✓ Login/logout

**Phase 2: Token System** (Week 1-2)
- Category selection UI
- Token creation and insertion
- Token palette interface
- Bookmark/metadata management

**Phase 3: Population** (Week 2-3)
- Arena search dialog
- Item selection and preview
- Document population logic
- Value replacement

**Phase 4: Revisions** (Week 3-4)
- Change detection
- Preview differences
- Copy vs replace logic
- Version tracking

**Phase 5: Polish** (Week 4)
- Error handling improvements
- Performance optimization
- User documentation
- Testing and bug fixes

## Performance Considerations

### Caching Strategy

- **Categories**: Cache for 6 hours (rarely change)
- **Items**: Cache for 1 hour (may change frequently)
- **Search Results**: Cache for 15 minutes
- **Document Tokens**: Store in document properties (persist with document)

### Optimization Techniques

1. Batch fetch all items once rather than individual lookups
2. Use CacheService for Arena data
3. Store token mappings in document properties (no API calls needed)
4. Lazy-load token palette (only when opened)
5. Debounce search input (wait for user to stop typing)

## Security Considerations

1. **Credentials**: Store session ID in UserProperties (not DocumentProperties)
2. **Validation**: Validate all user input before API calls
3. **Permissions**: Request minimal OAuth scopes needed
4. **Logging**: Never log passwords or session IDs
5. **Session Management**: Auto-clear on logout, handle expiration gracefully

## Future Enhancements

### V2 Features
- Multiple item support (table population)
- Custom formatting rules per token
- Formula support (e.g., calculated fields)
- Batch document processing
- Template library
- Arena change notifications

### V3 Features
- Two-way sync (update Arena from Docs)
- Approval workflows
- Digital signatures integration
- PDF generation with Arena data
- Collaborative editing with Arena locks

## Success Metrics

- Time to create Arena-linked document: < 2 minutes
- Document population time: < 10 seconds
- Token insertion: < 1 second each
- Search response: < 2 seconds (cached), < 5 seconds (uncached)
- User satisfaction: Minimal support requests, positive feedback

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| Arena API changes | High | Medium | Version checking, graceful degradation |
| Performance issues | Medium | Medium | Aggressive caching, optimization |
| Complex token scenarios | Medium | High | Comprehensive testing, good error messages |
| User confusion | Medium | Medium | Clear UI, helpful tooltips, documentation |
| Session expiry | Low | High | Auto-refresh, graceful re-login |

## Documentation Deliverables

1. **README.md** - Project overview, installation, quick start
2. **USER_GUIDE.md** - Detailed user instructions with screenshots
3. **API_REFERENCE.md** - Code documentation for developers
4. **DEPLOYMENT_GUIDE.md** - How to deploy and configure
5. **TROUBLESHOOTING.md** - Common issues and solutions

---

**Last Updated**: 2026-01-14
**Status**: Planning Phase
**Next Review**: After Phase 1 completion
