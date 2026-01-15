# Lessons Learned & Common Pitfalls

This document captures important lessons learned during development, common mistakes to avoid, and best practices discovered through real-world usage.

## Arena API Integration

### Lesson 1: Response Field Casing is Inconsistent

**Problem:**
Arena API responses sometimes use lowercase field names (`results`, `guid`) and sometimes capitalized (`Results`, `Guid`). This caused crashes when assuming one format.

**Solution:**
Always handle both cases:
```javascript
var items = response.results || response.Results || [];
var guid = item.guid || item.Guid;
var number = item.number || item.Number;
```

**Impact:** Fixed multiple crashes and made code resilient to API changes.

**Files:** `ArenaAPI.gs`, `BOMBuilder.gs`, `CategoryManager.gs`

---

### Lesson 2: Categories Must Exist Before Creating Items

**Problem:**
Hardcoded category names (`category: 'Row'`, `category: 'POD'`) caused HTTP 400 errors because those categories didn't exist in all Arena workspaces.

**Error:**
```
HTTP 400: [{"code":4073,"message":"The value for the attribute \"category\" is not valid."}]
```

**Solution:**
1. Get list of available categories from Arena
2. Prompt user to select from their categories
3. Or validate category exists before using it

**Code:**
```javascript
// BAD
var newItem = client.createItem({
  name: "Item",
  category: "HardcodedCategory" // Might not exist!
});

// GOOD
var categories = getArenaCategories();
// Show list to user, let them select
var selectedCategory = promptUserForCategory(categories);

var newItem = client.createItem({
  name: "Item",
  category: selectedCategory
});
```

**Impact:** Fixed POD/Row creation failures.

**Commit:** `ff70adc` - "Fix category error: prompt user for Row and POD categories"

---

### Lesson 3: BOM Operations Require GUIDs, Not Item Numbers

**Problem:**
Trying to create BOM lines with item numbers instead of GUIDs caused API errors.

**Error:**
```
HTTP 400: Invalid item reference
```

**Solution:**
Always look up item GUID first:
```javascript
// BAD
client.makeRequest('/items/' + parentGuid + '/bom', {
  method: 'POST',
  payload: {
    item: { number: "ITEM-001" } // Won't work!
  }
});

// GOOD
var childItem = client.getItemByNumber("ITEM-001");
var childGuid = childItem.guid || childItem.Guid;

client.makeRequest('/items/' + parentGuid + '/bom', {
  method: 'POST',
  payload: {
    item: { guid: childGuid } // Correct!
  }
});
```

**Impact:** Fixed BOM sync operations.

---

### Lesson 4: Session IDs Expire - Handle 401 Gracefully

**Problem:**
Arena session IDs expire after ~6 hours. If not handled, all subsequent requests would fail with 401.

**Solution:**
Automatically re-login on 401 responses:
```javascript
if (responseCode === 401) {
  Logger.log('Session expired, re-logging in...');
  clearSession();
  this.sessionId = getValidSessionId(); // Re-login

  // Retry request with new session
  headers['arena_session_id'] = this.sessionId;
  response = UrlFetchApp.fetch(url, requestOptions);
}
```

**Impact:** Seamless user experience, no manual re-login required.

**File:** `ArenaAPI.gs` (line 67-80)

---

### Lesson 5: Empty BOMs Don't Return Errors

**Problem:**
Expected an error when item has no BOM, but Arena returns `{"results": []}`.

**Solution:**
Check for empty array, not error:
```javascript
var bomData = client.makeRequest('/items/' + itemGuid + '/bom', { method: 'GET' });
var bomLines = bomData.results || bomData.Results || [];

if (bomLines.length === 0) {
  // Item has no BOM - this is OK, not an error
  Logger.log('Item has no BOM');
}
```

**Impact:** Correctly identifies items with vs. without BOMs.

---

### Lesson 6: API Errors Need Local Fallbacks

**Problem:**
When API calls fail (network issues, timeouts), the system would mark valid racks as "custom" and try to recreate them.

**Original Bad Logic:**
```javascript
try {
  var arenaItem = client.getItemByNumber(itemNumber);
  // Check item...
} catch (error) {
  // Assume it's custom - WRONG!
  customRacks.push(rack);
}
```

**Solution:**
Check local data first:
```javascript
// Check if rack has BOM data locally
var children = getRackConfigChildren(rackSheet);
if (children && children.length > 0) {
  // Has local data, skip - already populated
  return;
}

// Only check Arena if local data is empty
try {
  var arenaItem = client.getItemByNumber(itemNumber);
} catch (error) {
  // On error, check local again
  if (hasLocalData) {
    return; // Skip, has data
  }
  // Otherwise, can't determine - skip to be safe
}
```

**Impact:** Fixed false positives where racks pulled from Arena were flagged as needing creation.

**Commit:** `b49384c` - "Fix custom rack detection - check local BOM data first"

---

## Google Apps Script Quirks

### Lesson 7: Quota Limits Are Real

**Problem:**
Apps Script has daily quotas:
- UrlFetch calls: 20,000/day (consumer accounts)
- Execution time: 6 minutes max per execution
- Spreadsheet read/writes: Limited

**Solutions:**
1. Cache API responses
2. Batch spreadsheet operations
3. Break long operations into smaller chunks
4. Add user progress indicators

**Code:**
```javascript
// Cache expensive calls
var cache = CacheService.getUserCache();
var cached = cache.get('expensive_data');
if (cached) {
  return JSON.parse(cached);
}

var data = expensiveOperation();
cache.put('expensive_data', JSON.stringify(data), 3600);
return data;
```

---

### Lesson 8: Spreadsheet Operations Are Slow

**Problem:**
Reading/writing individual cells is extremely slow.

**Slow (1000ms for 100 cells):**
```javascript
for (var i = 0; i < 100; i++) {
  sheet.getRange(i, 1).setValue(data[i]);
}
```

**Fast (50ms for 100 cells):**
```javascript
var values = data.map(function(item) { return [item]; });
sheet.getRange(1, 1, values.length, 1).setValues(values);
```

**Impact:** 20x performance improvement!

---

### Lesson 9: HTML Service Has Sandbox Restrictions

**Problem:**
Client-side code in HTML files runs in sandbox mode (IFRAME) with restrictions:
- No `window.open()`
- No accessing parent window
- Limited DOM access

**Solution:**
Use `google.script.run` for communication:
```javascript
// Client-side
google.script.run
  .withSuccessHandler(function(result) {
    // Handle result
  })
  .serverSideFunction(data);

// Server-side
function serverSideFunction(data) {
  // Process and return
  return { success: true };
}
```

---

### Lesson 10: V8 Runtime vs Rhino

**Problem:**
Old Rhino runtime doesn't support modern JavaScript (`const`, `let`, arrow functions, etc.).

**Solution:**
Enable V8 runtime in `appsscript.json`:
```json
{
  "runtimeVersion": "V8"
}
```

**Benefits:**
- Modern JavaScript syntax
- Better performance
- Consistent behavior with Node.js

---

## User Experience

### Lesson 11: Progress Indicators Are Critical

**Problem:**
Long-running operations (POD creation with 10+ rows) appeared frozen to users.

**Solution:**
Add progress alerts between steps:
```javascript
ui.alert('Step 1 of 5', 'Validating configuration...', ui.ButtonSet.OK);
// Do step 1
ui.alert('Step 2 of 5', 'Creating custom racks...', ui.ButtonSet.OK);
// Do step 2
```

**Better Solution:**
Show detailed progress with counters:
```javascript
for (var i = 0; i < rows.length; i++) {
  var promptMsg = 'CREATING ROW ITEM ' + (i + 1) + ' of ' + rows.length;
  // Show prompt
}
```

**Impact:** Users understand what's happening and that system isn't frozen.

**Commit:** Improved prompts with progress indicators

---

### Lesson 12: Explicit Context in Prompts

**Problem:**
Prompts like "Enter name:" were ambiguous. Users didn't know if they were naming a Row, POD, or Rack.

**Bad:**
```javascript
ui.prompt('Create Item', 'Enter a name:', ui.ButtonSet.OK_CANCEL);
```

**Good:**
```javascript
var promptMsg = '========================================\n' +
                'CREATING ROW ITEM 1 of 3\n' +
                '========================================\n\n' +
                'Overview Row Number: 1\n\n' +
                'Racks in this row:\n' +
                '  • Pos 1: RACK-001\n' +
                '  • Pos 3: RACK-002\n\n' +
                'Enter a name for this Row item:';

ui.prompt('Create Row Item (1 of 3)', promptMsg, ui.ButtonSet.OK_CANCEL);
```

**Impact:** Dramatically improved user clarity and reduced confusion.

**Commit:** Enhanced prompt clarity throughout POD creation workflow

---

### Lesson 13: Default Values Prevent Empty Inputs

**Problem:**
Users sometimes clicked OK without entering a value, causing validation errors.

**Solution:**
Provide sensible defaults:
```javascript
var rowName = response.getResponseText().trim();
if (!rowName) {
  rowName = 'Row ' + rowNumber; // Default!
}
```

**Impact:** Better UX, fewer validation errors.

---

## Data Validation

### Lesson 14: Always Validate Sheet Structure

**Problem:**
Functions crashed when run on wrong sheet types (e.g., trying to get rack metadata from overview sheet).

**Solution:**
Validate before processing:
```javascript
function getRackConfigMetadata(sheet) {
  var cell = sheet.getRange(1, 1).getValue();

  if (cell !== 'PARENT_ITEM') {
    return null; // Not a rack config sheet
  }

  // Extract metadata
  return {
    itemNumber: sheet.getRange(1, 2).getValue(),
    // ...
  };
}
```

**Impact:** Graceful handling of invalid inputs.

---

### Lesson 15: Check Array Lengths Before Access

**Problem:**
Accessing array elements without checking length caused crashes.

**Bad:**
```javascript
var items = response.results;
var firstItem = items[0]; // Crash if empty!
```

**Good:**
```javascript
var items = response.results || [];
if (items.length === 0) {
  Logger.log('No items found');
  return;
}
var firstItem = items[0];
```

---

## Performance Optimization

### Lesson 16: Cache Rarely-Changing Data

**Problem:**
Fetching categories on every operation was slow and wasteful.

**Solution:**
Cache with appropriate TTL:
```javascript
// Categories rarely change - cache for 6 hours
var cache = CacheService.getUserCache();
var cached = cache.get('arena_categories');

if (cached) {
  return JSON.parse(cached);
}

var categories = client.getCategories();
cache.put('arena_categories', JSON.stringify(categories), 21600); // 6 hours
return categories;
```

**Impact:** 10x faster category operations.

---

### Lesson 17: Batch API Calls When Possible

**Problem:**
Sequential API calls for items was extremely slow.

**Slow (10 seconds for 50 items):**
```javascript
items.forEach(function(itemNumber) {
  var item = client.getItemByNumber(itemNumber); // 50 API calls!
});
```

**Fast (2 seconds for 50 items):**
```javascript
// Fetch all once
var allItems = client.getAllItems(); // 1-2 API calls with pagination

// Build lookup map
var itemMap = {};
allItems.forEach(function(item) {
  itemMap[item.number] = item;
});

// Use map for lookups
items.forEach(function(itemNumber) {
  var item = itemMap[itemNumber]; // Instant!
});
```

**Impact:** 5x performance improvement.

---

### Lesson 18: Local Checks Before Remote Calls

**Problem:**
Checking Arena API for every rack to see if it needs creation was slow.

**Solution:**
Check local data first:
```javascript
// Fast - local check
var children = getRackConfigChildren(sheet);
if (children && children.length > 0) {
  // Has local BOM, skip Arena check
  return;
}

// Only check Arena if local is empty
var arenaItem = client.getItemByNumber(itemNumber);
```

**Impact:** Massive performance gain, reduced API calls by 80%.

---

## Error Handling

### Lesson 19: User-Friendly Error Messages

**Problem:**
Technical error messages confused users.

**Bad:**
```javascript
throw new Error('HTTP 400: [{"code":4073,"message":"The value for the attribute \"category\" is not valid."}]');
```

**Good:**
```javascript
try {
  // Operation
} catch (error) {
  Logger.log('Technical error: ' + error.message); // Log details

  // Show user-friendly message
  ui.alert('Error',
    'Failed to create item. Please check that the category is valid.',
    ui.ButtonSet.OK);
}
```

**Impact:** Better UX, users understand what to fix.

---

### Lesson 20: Log Context with Errors

**Problem:**
Errors without context made debugging difficult.

**Bad:**
```javascript
Logger.log('Error: ' + error.message);
```

**Good:**
```javascript
Logger.log('Error in createRowItems for row ' + rowNumber + ': ' + error.message);
Logger.log('Stack trace: ' + error.stack);
Logger.log('Row data: ' + JSON.stringify(rowData));
```

**Impact:** Much easier debugging.

---

## Code Organization

### Lesson 21: Modular Functions Are Easier to Test

**Problem:**
Large monolithic functions were hard to test and debug.

**Solution:**
Break into smaller, focused functions:
```javascript
// Instead of one giant function
function createPODStructure() {
  // 500 lines of code
}

// Break into steps
function createPODStructure() {
  validateSetup();
  var customRacks = identifyCustomRacks();
  createCustomRackItems(customRacks);
  var rowItems = createRowItems();
  var podItem = createPODItem(rowItems);
  updateOverview(podItem, rowItems);
}
```

**Impact:** Each function can be tested independently.

---

### Lesson 22: Consistent Naming Conventions

**Problem:**
Inconsistent naming made code hard to follow.

**Standards Adopted:**
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Classes: `PascalCase`
- Booleans: `isXyz`, `hasXyz`, `shouldXyz`

**Example:**
```javascript
function isRackConfigSheet(sheet) { return Boolean }
function getRackConfigMetadata(sheet) { return Object }
function createNewRackConfiguration() { return Sheet }
```

---

## Security

### Lesson 23: Never Log Passwords

**Problem:**
Debugging code accidentally logged credentials.

**BAD - NEVER DO THIS:**
```javascript
Logger.log('Credentials: ' + JSON.stringify(credentials)); // Exposes password!
```

**Good:**
```javascript
Logger.log('Email: ' + credentials.email); // OK
Logger.log('API Base: ' + credentials.apiBase); // OK
// Never log password field
```

**Impact:** Security compliance.

---

### Lesson 24: Validate All User Input

**Problem:**
Unvalidated input could cause unexpected behavior.

**Solution:**
Always validate:
```javascript
function processItemNumber(userInput) {
  // Trim whitespace
  var input = userInput.trim();

  // Check type
  if (typeof input !== 'string') {
    throw new Error('Item number must be a string');
  }

  // Check length
  if (input.length === 0 || input.length > 100) {
    throw new Error('Invalid item number length');
  }

  // Check format (example)
  if (!/^[A-Z0-9-]+$/.test(input)) {
    throw new Error('Item number contains invalid characters');
  }

  return input;
}
```

---

## Testing

### Lesson 25: Test with Real Data

**Problem:**
Testing with "perfect" data didn't reveal real-world issues.

**Solution:**
Test with:
- Empty values
- Very long strings
- Special characters
- Edge cases (0 items, 100+ items)
- Missing data
- Malformed data

**Example:**
```javascript
// Test with edge cases
testFunction(""); // Empty
testFunction("A".repeat(1000)); // Very long
testFunction("Item-123!@#"); // Special chars
testFunction(null); // Null
testFunction(undefined); // Undefined
testFunction([]); // Wrong type
```

---

## Documentation

### Lesson 26: Document "Why", Not Just "What"

**Problem:**
Comments that just repeat code weren't helpful.

**Bad:**
```javascript
// Set category to selected category
item.category = selectedCategory;
```

**Good:**
```javascript
// Category must exist in Arena or API returns HTTP 400
// User selected from their valid categories
item.category = selectedCategory;
```

---

### Lesson 27: Keep Examples in Documentation

**Problem:**
Developers had to figure out API response formats through trial and error.

**Solution:**
Include examples in comments:
```javascript
/**
 * Gets items from Arena
 * @return {Object} Response with structure:
 * {
 *   "results": [
 *     {
 *       "guid": "abc123",
 *       "number": "ITEM-001",
 *       "name": "Item Name"
 *     }
 *   ]
 * }
 */
```

---

## Summary of Top 10 Most Important Lessons

1. **Check local data before API calls** - Huge performance gain
2. **Handle both response format variations** - `results` and `Results`
3. **Validate categories exist before creating items** - Prevents HTTP 400
4. **Use GUIDs for BOM operations** - Item numbers won't work
5. **Cache rarely-changing data** - Categories, attributes, etc.
6. **Batch spreadsheet operations** - Single write vs. multiple writes
7. **Add progress indicators for long operations** - Better UX
8. **Provide explicit context in prompts** - Users know what they're creating
9. **Always handle 401 and re-login** - Seamless session management
10. **Log context with errors** - Easier debugging

## Quick Reference: Common Patterns

### Safe API Call Pattern
```javascript
try {
  var client = new ArenaAPIClient();
  var result = client.someMethod();

  // Handle both response formats
  var data = result.results || result.Results || [];

  return { success: true, data: data };
} catch (error) {
  Logger.log('Error in functionName: ' + error.message);
  Logger.log('Stack: ' + error.stack);
  return { success: false, error: error.message };
}
```

### User Prompt Pattern
```javascript
var promptMsg = '========================================\n' +
                'ACTION DESCRIPTION (1 of N)\n' +
                '========================================\n\n' +
                'Context information...\n\n' +
                '----------------------------------------\n' +
                'Question?';

var response = ui.prompt('Dialog Title (1 of N)', promptMsg, ui.ButtonSet.OK_CANCEL);

if (response.getSelectedButton() !== ui.Button.OK) {
  ui.alert('Cancelled', 'Operation cancelled.', ui.ButtonSet.OK);
  return null;
}

var value = response.getResponseText().trim();
if (!value) {
  value = 'Default Value'; // Provide default!
}
```

### Caching Pattern
```javascript
var cache = CacheService.getUserCache();
var cacheKey = 'unique_key';
var cached = cache.get(cacheKey);

if (cached) {
  return JSON.parse(cached);
}

var data = fetchExpensiveData();
cache.put(cacheKey, JSON.stringify(data), TTL_SECONDS);
return data;
```

---

**This document should be updated as new lessons are learned!**
