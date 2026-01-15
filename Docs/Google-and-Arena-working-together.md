# Google Apps Script and Arena PLM Integration Best Practices

This document provides comprehensive guidance for developing applications that connect Google Sheets (via Google Apps Script) to Arena PLM's REST API. It covers common patterns, pitfalls, and optimization strategies learned from real-world implementation.

---

## Table of Contents

1. [Connection Setup](#connection-setup)
2. [Google Sheets UI Integration](#google-sheets-ui-integration)
3. [Credential Management](#credential-management)
4. [Understanding Arena's Data Model](#understanding-arenas-data-model)
5. [Working with Items](#working-with-items)
6. [Working with BOMs](#working-with-boms)
7. [Categories and Item Number Generation](#categories-and-item-number-generation)
8. [Lifecycle Phases](#lifecycle-phases)
9. [API Performance Optimization](#api-performance-optimization)
10. [Caching Strategies](#caching-strategies)
11. [Pagination](#pagination)
12. [Wizard-Based User Flows](#wizard-based-user-flows)
13. [Error Handling and Validation](#error-handling-and-validation)
14. [Common Pitfalls](#common-pitfalls)

---

## Connection Setup

### Required Headers

Every Arena API request requires these headers:

```javascript
var headers = {
  'Content-Type': 'application/json',
  'arena_session_id': sessionId  // Obtained from login
};
```

### Base URL Configuration

```javascript
var BASE_URL = 'https://api.arenasolutions.com/v1';
```

### Authentication Flow

Arena uses session-based authentication:

```javascript
function login(email, password, workspaceId) {
  var loginUrl = 'https://api.arenasolutions.com/v1/login';

  var payload = {
    email: email,
    password: password,
    workspaceId: workspaceId  // Numeric workspace ID
  };

  var options = {
    method: 'POST',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(loginUrl, options);
  var result = JSON.parse(response.getContentText());

  // Store session ID for subsequent requests
  return result.arenaSessionId;
}
```

### Making Authenticated Requests

```javascript
function makeRequest(endpoint, options) {
  var url = BASE_URL + endpoint;

  var fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      'arena_session_id': getSessionId()
    },
    muteHttpExceptions: true
  };

  if (options.payload) {
    fetchOptions.payload = JSON.stringify(options.payload);
  }

  var response = UrlFetchApp.fetch(url, fetchOptions);

  if (response.getResponseCode() !== 200) {
    throw new Error('API Error: ' + response.getContentText());
  }

  return JSON.parse(response.getContentText());
}
```

---

## Google Sheets UI Integration

### Creating Custom Menus

```javascript
function onOpen() {
  var ui = SpreadsheetApp.getUi();

  ui.createMenu('Arena PLM')
    .addItem('Login', 'showLoginDialog')
    .addItem('Logout', 'clearCredentials')
    .addSeparator()
    .addSubMenu(ui.createMenu('Items')
      .addItem('Browse Items', 'showItemPicker')
      .addItem('Create Item', 'showCreateItemDialog'))
    .addSubMenu(ui.createMenu('BOM')
      .addItem('Push BOM to Arena', 'showBOMPushWizard')
      .addItem('Refresh from Arena', 'refreshBOM'))
    .addSeparator()
    .addItem('Settings', 'showSettings')
    .addToUi();
}
```

### Modal Dialogs vs Sidebars

**Modals** - Use for focused, sequential workflows:
```javascript
function showLoginDialog() {
  var html = HtmlService.createHtmlOutputFromFile('LoginDialog')
    .setWidth(400)
    .setHeight(300);
  SpreadsheetApp.getUi().showModalDialog(html, 'Login to Arena');
}
```

**Sidebars** - Use for persistent tools that don't block the sheet:
```javascript
function showItemPicker() {
  var html = HtmlService.createHtmlOutputFromFile('ItemPicker')
    .setTitle('Select Item');
  SpreadsheetApp.getUi().showSidebar(html);
}
```

---

## Credential Management

### Storing Credentials Securely

Use `PropertiesService` for credential storage - never hardcode:

```javascript
// User-specific storage (recommended for credentials)
function saveCredentials(email, sessionId, workspaceId) {
  var userProps = PropertiesService.getUserProperties();
  userProps.setProperties({
    'arena_email': email,
    'arena_session_id': sessionId,
    'arena_workspace_id': workspaceId
  });
}

// Retrieve credentials
function getSessionId() {
  return PropertiesService.getUserProperties().getProperty('arena_session_id');
}

// Clear credentials on logout
function clearCredentials() {
  var userProps = PropertiesService.getUserProperties();
  userProps.deleteProperty('arena_email');
  userProps.deleteProperty('arena_session_id');
  userProps.deleteProperty('arena_workspace_id');

  SpreadsheetApp.getUi().alert('Logged out successfully');
}
```

### Session Validation

Arena sessions expire. Always validate before operations:

```javascript
function isSessionValid() {
  var sessionId = getSessionId();
  if (!sessionId) return false;

  try {
    // Make a lightweight API call to test session
    makeRequest('/items?limit=1', { method: 'GET' });
    return true;
  } catch (e) {
    return false;
  }
}
```

---

## Understanding Arena's Data Model

### Core Concepts

1. **Items** - The fundamental unit (parts, assemblies, documents)
2. **Revisions** - Versioned snapshots of items (A, B, C, etc.)
3. **Working Revision** - The editable, unreleased version
4. **BOMs** - Bill of Materials linking parent assemblies to child items
5. **Categories** - Classification that determines item number format
6. **Lifecycle Phases** - Status workflow (Design, Production, Obsolete)
7. **Changes (ECOs)** - Formal change process for releasing revisions

### Item GUID vs Item Number

- **GUID** - Unique identifier, never changes
- **Item Number** - Human-readable identifier (e.g., "100-00001")

Always use GUID for API operations; item number for display.

---

## Working with Items

### Fetching Items

**Get all items (with full details):**
```javascript
function getAllItems() {
  var endpoint = '/items?responseview=full&limit=400';
  var response = makeRequest(endpoint, { method: 'GET' });
  return response.results;
}
```

**Get single item by GUID:**
```javascript
function getItem(guid) {
  var endpoint = '/items/' + guid;
  return makeRequest(endpoint, { method: 'GET' });
}
```

**Search by item number:**
```javascript
function findItemByNumber(itemNumber) {
  // Arena doesn't have direct lookup - must search
  var allItems = getAllItems();
  return allItems.find(function(item) {
    return item.number === itemNumber;
  });
}
```

### Creating Items

```javascript
function createItem(itemData) {
  var payload = {
    category: { guid: itemData.categoryGuid },
    name: itemData.name,
    description: itemData.description,
    // Item number - omit to auto-generate, or provide if category allows
    number: itemData.number || undefined
  };

  return makeRequest('/items', {
    method: 'POST',
    payload: payload
  });
}
```

### Updating Items

Only the **working revision** can be updated:

```javascript
function updateItem(guid, updates) {
  var payload = {
    name: updates.name,
    description: updates.description
    // Cannot change: number, category, revision
  };

  return makeRequest('/items/' + guid, {
    method: 'PUT',
    payload: payload
  });
}
```

### Item Attributes

Arena items have standard fields plus custom attributes:

```javascript
function getItemAttributes(guid) {
  var endpoint = '/items/' + guid + '?responseview=full';
  var item = makeRequest(endpoint, { method: 'GET' });

  // Standard attributes
  var standard = {
    name: item.name,
    description: item.description,
    revisionNumber: item.revisionNumber
  };

  // Custom attributes (defined per category)
  var custom = item.additionalAttributes || [];

  return { standard: standard, custom: custom };
}

function updateItemAttribute(guid, attributeGuid, value) {
  var payload = {
    value: value
  };

  return makeRequest('/items/' + guid + '/additionalattributes/' + attributeGuid, {
    method: 'PUT',
    payload: payload
  });
}
```

---

## Working with BOMs

### BOM Structure

BOMs are stored on the **parent assembly**, not the children. Each BOM row links to a child item.

### Fetching BOM

```javascript
function getBOM(parentGuid) {
  var endpoint = '/items/' + parentGuid + '/bom';
  var response = makeRequest(endpoint, { method: 'GET' });
  return response.results;  // Array of BOM rows
}
```

### BOM Row Structure

```javascript
{
  guid: "BOM_ROW_GUID",
  lineNumber: 1,
  quantity: 2,
  refDes: "R1,R2",
  notes: "Optional notes",
  item: {
    guid: "CHILD_ITEM_GUID",
    number: "100-00001",
    name: "Resistor 10K"
  }
}
```

### Adding Items to BOM

```javascript
function addToBOM(parentGuid, childGuid, quantity, lineNumber, refDes) {
  var payload = {
    item: { guid: childGuid },
    quantity: quantity,
    lineNumber: lineNumber,
    refDes: refDes || null,
    notes: null
  };

  return makeRequest('/items/' + parentGuid + '/bom', {
    method: 'POST',
    payload: payload
  });
}
```

### Updating BOM Row

```javascript
function updateBOMRow(parentGuid, bomRowGuid, updates) {
  var payload = {
    quantity: updates.quantity,
    refDes: updates.refDes,
    notes: updates.notes
    // Cannot change: item (must delete and re-add)
  };

  return makeRequest('/items/' + parentGuid + '/bom/' + bomRowGuid, {
    method: 'PUT',
    payload: payload
  });
}
```

### BOM Attributes

BOMs can have custom attributes (e.g., "Position" for rack location):

```javascript
function getBOMAttributes(parentGuid, bomRowGuid) {
  var endpoint = '/items/' + parentGuid + '/bom/' + bomRowGuid + '/additionalattributes';
  return makeRequest(endpoint, { method: 'GET' });
}

function updateBOMAttribute(parentGuid, bomRowGuid, attributeGuid, value) {
  var payload = { value: value };

  return makeRequest(
    '/items/' + parentGuid + '/bom/' + bomRowGuid + '/additionalattributes/' + attributeGuid,
    { method: 'PUT', payload: payload }
  );
}
```

### Multi-Level BOM Creation Strategy

**Critical: Build BOMs from the bottom up.**

When creating a multi-level BOM structure:

1. Create leaf items first (no children)
2. Create sub-assemblies and add leaf items to their BOMs
3. Create parent assemblies and add sub-assemblies to their BOMs
4. Continue up to the top-level assembly

```javascript
function createMultiLevelBOM(structure) {
  var createdItems = {};

  // Sort by level (deepest first)
  var sortedItems = structure.sort(function(a, b) {
    return b.level - a.level;
  });

  for (var i = 0; i < sortedItems.length; i++) {
    var item = sortedItems[i];

    // Create the item
    var created = createItem({
      categoryGuid: item.categoryGuid,
      name: item.name,
      description: item.description
    });

    createdItems[item.tempId] = created.guid;

    // Add children to BOM (they already exist)
    if (item.children && item.children.length > 0) {
      for (var j = 0; j < item.children.length; j++) {
        var child = item.children[j];
        var childGuid = createdItems[child.tempId];

        addToBOM(created.guid, childGuid, child.quantity, j + 1);
      }
    }
  }

  return createdItems;
}
```

---

## Categories and Item Number Generation

### Understanding Category Number Schemes

Each category defines how item numbers are generated:

1. **Auto-generated** - Arena assigns next number (e.g., "100-00001")
2. **User-entered** - User must provide unique number
3. **Prefix + auto** - Category prefix + sequence (e.g., "RES-00001")

### Fetching Categories

```javascript
function getCategories() {
  var endpoint = '/settings/items/categories';
  var response = makeRequest(endpoint, { method: 'GET' });
  return response.results;
}
```

### Category Structure

```javascript
{
  guid: "CATEGORY_GUID",
  name: "Resistor",
  path: "Components/Passive/Resistor",
  itemNumberType: "AUTO"  // or "USER" or "PREFIX_AUTO"
}
```

### Handling Different Number Types

```javascript
function createItemWithNumber(categoryGuid, name, userNumber) {
  var category = getCategoryByGuid(categoryGuid);

  var payload = {
    category: { guid: categoryGuid },
    name: name
  };

  // Only include number if category allows user entry
  if (category.itemNumberType === 'USER' && userNumber) {
    payload.number = userNumber;
  }
  // For AUTO and PREFIX_AUTO, omit number field

  return makeRequest('/items', {
    method: 'POST',
    payload: payload
  });
}
```

---

## Lifecycle Phases

### Understanding Lifecycle

Items progress through lifecycle phases:

- **Design** - Initial creation, fully editable
- **Prototype** - Testing phase
- **Production** - Released, locked
- **Obsolete** - End of life

### Lifecycle Rules

1. Only **working revision** can be edited
2. Released revisions are locked
3. To modify released item, create new revision via ECO
4. Lifecycle determines which fields are editable

### Fetching Lifecycle Phases

```javascript
function getLifecyclePhases() {
  var endpoint = '/settings/items/lifecyclephases';
  var response = makeRequest(endpoint, { method: 'GET' });
  return response.results;
}
```

### Checking Editability

```javascript
function canEditItem(item) {
  // Check if item is in a working state
  var editablePhases = ['Design', 'Prototype'];
  var phase = item.lifecyclePhase.name;

  return editablePhases.indexOf(phase) !== -1 && !item.isLocked;
}
```

---

## API Performance Optimization

### The Fundamental Problem

Arena's API requires individual calls for many operations. A naive implementation fetching items one-by-one will be extremely slow.

**Bad Pattern:**
```javascript
// DON'T DO THIS - 50 API calls for 50 items!
function findMultipleItems(itemNumbers) {
  return itemNumbers.map(function(num) {
    return getAllItems().find(function(item) {
      return item.number === num;
    });
  });
}
```

**Good Pattern:**
```javascript
// DO THIS - 1 API call for all items
function findMultipleItems(itemNumbers) {
  var allItems = getAllItems();
  var itemMap = {};

  allItems.forEach(function(item) {
    itemMap[item.number] = item;
  });

  return itemNumbers.map(function(num) {
    return itemMap[num];
  });
}
```

### Batch Operations

Arena supports some batch operations:

```javascript
// Batch create BOM rows
function addMultipleToBOM(parentGuid, children) {
  var results = [];

  // Arena doesn't support true batch - but we can parallelize
  // Note: Google Apps Script doesn't support parallel fetch, so sequential
  for (var i = 0; i < children.length; i++) {
    var result = addToBOM(
      parentGuid,
      children[i].guid,
      children[i].quantity,
      i + 1
    );
    results.push(result);
  }

  return results;
}
```

---

## Caching Strategies

### Why Cache?

Arena API calls are slow (500ms-2s each). Caching reduces:
- Redundant fetches
- User wait time
- API rate limit issues

### Google Apps Script CacheService

**Critical Limitations:**
- Maximum 100KB per key
- Maximum 6 hour TTL
- Shared across executions

### Implementing Item Cache

```javascript
var ITEM_CACHE_KEY = 'arena_items_cache';
var ITEM_CACHE_TTL = 6 * 60 * 60;  // 6 hours in seconds

function getCachedItems() {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ITEM_CACHE_KEY);

  if (cached) {
    return JSON.parse(cached);
  }

  // Cache miss - fetch from Arena
  var items = getAllItems();

  // Trim to essential fields to stay under 100KB
  var trimmedItems = items.map(function(item) {
    return {
      guid: item.guid,
      number: item.number,
      name: item.name,
      description: item.description,
      categoryGuid: item.category.guid,
      categoryName: item.category.name,
      lifecyclePhase: item.lifecyclePhase.name
    };
  });

  try {
    var json = JSON.stringify(trimmedItems);
    cache.put(ITEM_CACHE_KEY, json, ITEM_CACHE_TTL);
    Logger.log('Cached ' + items.length + ' items (' + Math.round(json.length/1024) + ' KB)');
  } catch (e) {
    Logger.log('Cache too large: ' + e.message);
  }

  return trimmedItems;
}
```

### Cache Invalidation

```javascript
function invalidateCache() {
  var cache = CacheService.getScriptCache();
  cache.remove(ITEM_CACHE_KEY);
}

// Invalidate after creating items
function createItemWithCacheUpdate(itemData) {
  var created = createItem(itemData);

  // Add to existing cache instead of full invalidation
  addToCache(created);

  return created;
}

function addToCache(item) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ITEM_CACHE_KEY);

  if (cached) {
    var items = JSON.parse(cached);
    items.push({
      guid: item.guid,
      number: item.number,
      name: item.name,
      // ... trimmed fields
    });

    cache.put(ITEM_CACHE_KEY, JSON.stringify(items), ITEM_CACHE_TTL);
  }
}
```

### Split Caching for Large Data

When data exceeds 100KB, split into multiple keys:

```javascript
function cacheLargeDataset(items, categories, colors) {
  var cache = CacheService.getScriptCache();

  // Cache separately
  cache.put('items_cache', JSON.stringify(items), ITEM_CACHE_TTL);
  cache.put('categories_cache', JSON.stringify(categories), ITEM_CACHE_TTL);
  cache.put('colors_cache', JSON.stringify(colors), ITEM_CACHE_TTL);
}

function loadFromSplitCache() {
  var cache = CacheService.getScriptCache();

  var items = JSON.parse(cache.get('items_cache') || '[]');
  var categories = JSON.parse(cache.get('categories_cache') || '[]');
  var colors = JSON.parse(cache.get('colors_cache') || '{}');

  return { items: items, categories: categories, colors: colors };
}
```

---

## Pagination

### Server-Side Pagination (Arena API)

Arena returns limited results per request:

```javascript
function getAllItemsPaginated() {
  var allItems = [];
  var offset = 0;
  var limit = 400;  // Arena's max per request

  while (true) {
    var endpoint = '/items?limit=' + limit + '&offset=' + offset;
    var response = makeRequest(endpoint, { method: 'GET' });

    allItems = allItems.concat(response.results);

    if (response.results.length < limit) {
      break;  // No more results
    }

    offset += limit;
  }

  return allItems;
}
```

### Client-Side Pagination (UI)

For smoother UX, load items progressively:

```javascript
// In HTML file
var allItems = [];
var displayedCount = 0;
var pageSize = 50;

function loadInitialItems() {
  google.script.run
    .withSuccessHandler(function(items) {
      allItems = items;
      displayItems(0, pageSize);
    })
    .getAllCachedItems();
}

function displayItems(start, count) {
  var itemsToShow = allItems.slice(start, start + count);

  itemsToShow.forEach(function(item) {
    appendItemToList(item);
  });

  displayedCount = start + count;
}

// Infinite scroll
document.getElementById('itemList').addEventListener('scroll', function() {
  if (this.scrollTop + this.clientHeight >= this.scrollHeight - 100) {
    if (displayedCount < allItems.length) {
      displayItems(displayedCount, 25);
    }
  }
});
```

---

## Wizard-Based User Flows

### Why Use Wizards?

Complex operations benefit from step-by-step guidance:
- Reduces errors
- Allows validation at each step
- Enables preview before commit
- Supports cancellation

### Wizard Structure

```html
<!-- In HTML file -->
<div class="wizard">
  <div class="wizard-steps">
    <div class="step" data-step="1">Select Items</div>
    <div class="step" data-step="2">Configure</div>
    <div class="step" data-step="3">Review</div>
  </div>

  <div class="wizard-content">
    <div class="stage" id="stage1"><!-- Selection UI --></div>
    <div class="stage" id="stage2"><!-- Configuration UI --></div>
    <div class="stage" id="stage3"><!-- Review/Preview --></div>
  </div>

  <div class="wizard-buttons">
    <button id="btnBack">Back</button>
    <button id="btnNext">Next</button>
    <button id="btnCreate">Create in Arena</button>
  </div>
</div>
```

### Pre-flight Validation

Before executing, validate everything:

```javascript
function validateBeforeCreate(wizardData) {
  var errors = [];
  var warnings = [];

  // Check required fields
  if (!wizardData.parentItem) {
    errors.push('Parent item is required');
  }

  // Check for existing items
  wizardData.children.forEach(function(child) {
    var existing = findItemByNumber(child.number);
    if (existing) {
      warnings.push(child.number + ' already exists and will be linked');
    }
  });

  // Check category permissions
  var category = getCategoryByGuid(wizardData.categoryGuid);
  if (category.itemNumberType === 'USER' && !wizardData.userNumber) {
    errors.push('This category requires manual item number entry');
  }

  return { errors: errors, warnings: warnings };
}
```

### Preventing Duplicate Submissions

Use execution locks:

```javascript
function executeWithLock(operation) {
  var props = PropertiesService.getUserProperties();
  var lockKey = 'operation_lock';

  // Check for existing lock
  if (props.getProperty(lockKey) === 'true') {
    throw new Error('Operation already in progress');
  }

  // Set lock
  props.setProperty(lockKey, 'true');

  try {
    return operation();
  } finally {
    // Always clear lock
    props.deleteProperty(lockKey);
  }
}

// Usage
function createBOMStructure(data) {
  return executeWithLock(function() {
    // ... create items and BOMs
  });
}
```

---

## Error Handling and Validation

### API Error Handling

```javascript
function makeRequest(endpoint, options) {
  var response = UrlFetchApp.fetch(url, fetchOptions);
  var code = response.getResponseCode();

  if (code === 401) {
    // Session expired
    clearCredentials();
    throw new Error('Session expired. Please log in again.');
  }

  if (code === 400) {
    // Bad request - parse error details
    var error = JSON.parse(response.getContentText());
    throw new Error('Validation error: ' + error.errors[0].message);
  }

  if (code === 409) {
    // Conflict - item already exists, etc.
    throw new Error('Conflict: Resource already exists');
  }

  if (code !== 200 && code !== 201) {
    throw new Error('API error ' + code + ': ' + response.getContentText());
  }

  return JSON.parse(response.getContentText());
}
```

### Rollback Support

For complex operations, track what was created to enable rollback:

```javascript
function createWithRollback(items) {
  var created = [];

  try {
    for (var i = 0; i < items.length; i++) {
      var result = createItem(items[i]);
      created.push(result.guid);
    }
    return { success: true, guids: created };

  } catch (error) {
    // Rollback - delete created items
    Logger.log('Error occurred, rolling back ' + created.length + ' items');

    for (var j = 0; j < created.length; j++) {
      try {
        deleteItem(created[j]);
      } catch (e) {
        Logger.log('Failed to rollback: ' + created[j]);
      }
    }

    throw error;
  }
}
```

---

## Common Pitfalls

### 1. Fetching Items Repeatedly

**Problem:** Calling `getAllItems()` for each lookup
**Solution:** Fetch once, build lookup map, cache results

### 2. Cache Size Exceeded

**Problem:** `Argument too large: value` error
**Solution:**
- Trim objects to essential fields only
- Split into multiple cache keys
- CacheService limit is 100KB per key

### 3. Modal Appears Before Wizard Closes

**Problem:** Server-side modal opens while client wizard still visible
**Solution:** Return from server, let client show modal and close wizard

```javascript
// Server-side
function execute(data) {
  // Do work...

  // Store results for modal to retrieve
  storeResults(results);

  // Return - don't show modal here
  return results;
}

// Client-side
function onSuccess(result) {
  // Show completion modal from client
  google.script.run.showCompletionModal();

  // Close wizard
  google.script.host.close();
}
```

### 4. Multiple Button Clicks Creating Duplicates

**Problem:** User clicks "Create" multiple times during slow operation
**Solution:**
- Disable button immediately on click
- Use execution lock on server
- Show loading indicator

```javascript
function onCreate() {
  var btn = document.getElementById('btnCreate');
  btn.disabled = true;
  btn.textContent = 'Creating...';

  google.script.run
    .withSuccessHandler(onSuccess)
    .withFailureHandler(function(e) {
      btn.disabled = false;
      btn.textContent = 'Create';
    })
    .execute(data);
}
```

### 5. Item Numbers in Wrong Category Format

**Problem:** Creating item with user-provided number in auto-generate category
**Solution:** Check category's `itemNumberType` before including number in payload

### 6. BOM Created Top-Down Instead of Bottom-Up

**Problem:** Parent items created before children, BOM links fail
**Solution:** Always create deepest items first, work up to top-level

### 7. Trying to Edit Released Items

**Problem:** PUT request fails on production items
**Solution:** Check lifecycle phase and `isLocked` before attempting edit

### 8. Not Handling Partial Existence

**Problem:** Some items exist in Arena, others don't
**Solution:** Check existence first, create only what's missing, link existing

```javascript
function createOrLink(items) {
  var results = [];

  for (var i = 0; i < items.length; i++) {
    var existing = findItemByNumber(items[i].number);

    if (existing) {
      // Link existing
      results.push({
        action: 'linked',
        guid: existing.guid,
        number: existing.number
      });
    } else {
      // Create new
      var created = createItem(items[i]);
      results.push({
        action: 'created',
        guid: created.guid,
        number: created.number
      });
    }
  }

  return results;
}
```

### 9. Session Expiry During Long Operations

**Problem:** Session expires mid-operation
**Solution:**
- Validate session before starting
- Keep operations under 6 minute Apps Script limit
- For very long operations, batch and checkpoint

### 10. Ignoring API Rate Limits

**Problem:** Too many rapid requests cause failures
**Solution:** Add delays between bulk operations if needed

```javascript
function bulkCreate(items) {
  var results = [];

  for (var i = 0; i < items.length; i++) {
    results.push(createItem(items[i]));

    // Small delay to avoid rate limiting
    if (i > 0 && i % 10 === 0) {
      Utilities.sleep(500);  // 500ms pause every 10 items
    }
  }

  return results;
}
```

---

## Summary

Building a Google Sheets to Arena PLM integration requires attention to:

1. **Performance** - Cache aggressively, fetch once, minimize API calls
2. **Data Size** - Stay under 100KB cache limit by trimming objects
3. **User Experience** - Use wizards, show progress, prevent duplicate submissions
4. **BOM Strategy** - Always build bottom-up
5. **Validation** - Check existence, lifecycle, and category rules before operations
6. **Error Handling** - Handle API errors gracefully, support rollback

Following these patterns will result in a robust, performant integration that handles the nuances of both Google Apps Script and Arena PLM.

---

*Document created: November 2025*
*Based on PTC Arena Sheets DataCenter implementation*
