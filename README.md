# PTC Arena Docs

A Google Docs add-on that enables powerful merge-field capabilities with PTC Arena PLM data. Create document templates with Arena field tokens, search for items, and automatically populate documents with live PLM data.

## Features

- **Category-Based Field Mapping**: Select Arena item categories and map fields to document tokens
- **Drag-and-Drop Tokens**: Insert Arena field tokens anywhere in your document
- **Arena Search Integration**: Search and select items directly from Google Docs
- **Smart Document Population**: Automatically fill tokens with Arena item data
- **Document Revisioning**: Update documents in place or create revised copies when Arena data changes
- **Caching & Performance**: Optimized for speed with intelligent caching strategies

## Use Cases

- **Part Specifications**: Create part spec sheets that auto-populate from Arena
- **Assembly Instructions**: Build assembly docs that update when BOMs change
- **Quality Documentation**: Generate test procedures with current revision data
- **Compliance Documents**: Maintain certifications that reference latest Arena data
- **Customer Deliverables**: Create quotes and proposals with real-time item information

## Quick Start

1. Open a Google Doc
2. Select **Arena PLM > Login** from the menu
3. Choose **Arena PLM > Insert Tokens > Select Category**
4. Create tokens for desired fields (e.g., Part Number, Name, Description)
5. Drag tokens into your document layout
6. Select **Arena PLM > Populate from Arena > Search Item**
7. Find your item and click "Populate Document"

Your document is now populated with live Arena data!

## Project Structure

```
PTC-Arena-Docs/
├── src/                          # Apps Script source code
│   ├── Code.gs                   # Main entry point and menu
│   ├── ArenaAPI.gs              # Arena API client
│   ├── CategoryManager.gs       # Category and field management
│   ├── TokenManager.gs          # Token creation and management
│   ├── DocumentPopulator.gs     # Document merge functionality
│   ├── SearchDialog.gs          # Arena search
│   ├── RevisionManager.gs       # Document versioning
│   └── Utils.gs                 # Common utilities
├── html/                         # UI components
│   ├── CategorySelector.html    # Category selection dialog
│   ├── TokenPalette.html        # Token drag-and-drop interface
│   ├── SearchDialog.html        # Item search dialog
│   ├── PopulateDialog.html      # Population confirmation
│   ├── RevisionDialog.html      # Revision options
│   └── styles.html              # Shared CSS
├── Docs/                         # Documentation
│   ├── PROJECT_PLAN.md          # Detailed project plan
│   ├── USER_GUIDE.md            # User documentation
│   ├── API_REFERENCE.md         # Developer documentation
│   ├── LESSONS_LEARNED.md       # Common pitfalls and solutions
│   └── Google-and-Arena-working-together.md  # Integration best practices
├── appsscript.json              # Apps Script configuration
├── .clasp.json                  # Clasp configuration (not committed)
├── package.json                 # Node dependencies
└── README.md                    # This file
```

## Development

### Prerequisites

- Node.js 16+ and npm
- Google Account with Docs access
- PTC Arena PLM account
- clasp CLI tool

### Setup

```bash
# Install clasp globally
npm install -g @google/clasp

# Login to Google
clasp login

# Clone this repository
git clone https://github.com/YOUR_USERNAME/PTC-Arena-Docs.git
cd PTC-Arena-Docs

# Install dependencies
npm install

# Create Apps Script project
clasp create --type docs --title "Arena PLM for Docs"

# Push code to Apps Script
clasp push

# Open in Apps Script editor
clasp open
```

### Development Workflow

```bash
# Make changes to code in src/ or html/

# Push changes to Apps Script
clasp push

# Test in a Google Doc

# Pull changes from Apps Script editor (if edited there)
clasp pull
```

### Testing

Open a test Google Doc and verify:

1. Menu appears: **Arena PLM**
2. Login functionality works
3. Category selection loads categories
4. Tokens can be inserted
5. Search returns results
6. Document population replaces tokens correctly
7. Revision detection shows changes

## How It Works

### Token System

Tokens are special placeholders in your document:

```
{{ARENA:CATEGORY_NAME:FIELD_NAME}}
```

Examples:
- `{{ARENA:RESISTOR:PART_NUMBER}}`
- `{{ARENA:ASSEMBLY:NAME}}`
- `{{ARENA:DOCUMENT:REVISION}}`

Tokens are stored as:
- Named ranges for positioning
- Bookmarks for metadata
- Document properties for persistence

### Arena Integration

The add-on uses Arena's REST API to:
- Authenticate users
- Fetch categories and their fields
- Search for items
- Retrieve item details and attributes
- Handle multi-level BOMs

See [Google-and-Arena-working-together.md](Docs/Google-and-Arena-working-together.md) for detailed Arena API patterns.

### Caching Strategy

- **Categories**: 6 hours (rarely change)
- **Items**: 1 hour (may change)
- **Search Results**: 15 minutes
- **Tokens**: Stored in document (no expiration)

## Security

- Session IDs stored in user properties (not shared)
- Credentials never logged
- Minimal OAuth scopes requested
- Input validation on all user data
- Automatic session expiry handling

## Troubleshooting

### "Session expired" error
- Select **Arena PLM > Logout**, then **Login** again

### Tokens not populating
- Verify you're logged into Arena
- Check that item exists in Arena
- Ensure category matches original token creation

### Performance issues
- Clear cache: **Arena PLM > Settings > Cache Management**
- Check internet connection
- Verify Arena API is accessible

See [LESSONS_LEARNED.md](Docs/LESSONS_LEARNED.md) for more common issues and solutions.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Built on PTC Arena PLM REST API
- Inspired by Google Apps Script community
- Based on learnings from Arena Sheets DataCenter project

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check the [User Guide](Docs/USER_GUIDE.md)
- Review [Lessons Learned](Docs/LESSONS_LEARNED.md)

---

**Status**: In Active Development
**Version**: 0.1.0-alpha
**Last Updated**: 2026-01-14
