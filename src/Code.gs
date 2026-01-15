/**
 * Arena PLM for Google Docs
 * Main entry point and menu creation
 *
 * This add-on enables merge-field capabilities with PTC Arena PLM data.
 * Users can create document templates with Arena field tokens, search for items,
 * and automatically populate documents with live PLM data.
 */

/**
 * Runs when the add-on is installed
 */
function onInstall(e) {
  onOpen(e);
}

/**
 * Runs when a document is opened
 * Creates the Arena PLM menu
 */
function onOpen(e) {
  var ui = DocumentApp.getUi();

  var menu = ui.createMenu('Arena PLM');

  // Check if user is logged in
  var isLoggedIn = isUserLoggedIn();

  if (isLoggedIn) {
    menu.addItem('Logout', 'showLogoutDialog');
  } else {
    menu.addItem('Login', 'showLoginDialog');
  }

  menu.addSeparator();

  // Insert Tokens submenu
  var insertTokensMenu = ui.createMenu('Insert Tokens')
    .addItem('Select Category...', 'showCategorySelector')
    .addItem('Show Token Palette', 'showTokenPalette');
  menu.addSubMenu(insertTokensMenu);

  menu.addSeparator();

  // Populate from Arena submenu
  var populateMenu = ui.createMenu('Populate from Arena')
    .addItem('Search Item...', 'showSearchDialog')
    .addItem('Quick Search (by number)', 'showQuickSearchPrompt')
    .addItem('Clear All Tokens', 'clearAllTokens');
  menu.addSubMenu(populateMenu);

  menu.addSeparator();

  // Document Generation submenu (AI-powered)
  var generationMenu = ui.createMenu('Document Generation')
    .addItem('Generate with AI...', 'showDocumentGenerationWizard')
    .addItem('Autodetect Field Tokens...', 'showAutodetectDialog');
  menu.addSubMenu(generationMenu);

  menu.addSeparator();

  // Revisions submenu
  var revisionsMenu = ui.createMenu('Revisions')
    .addItem('Update in Place', 'updateDocumentInPlace')
    .addItem('Create Revised Copy', 'createRevisedCopy')
    .addItem('Show Change Preview', 'showChangePreview');
  menu.addSubMenu(revisionsMenu);

  menu.addSeparator();

  // Settings submenu
  var settingsMenu = ui.createMenu('Settings')
    .addItem('Manage Token Mappings', 'showTokenMappings')
    .addItem('Configure Gemini API Key...', 'showGeminiApiKeyDialog')
    .addItem('Clear Cache', 'clearAllCaches')
    .addItem('About', 'showAboutDialog');
  menu.addSubMenu(settingsMenu);

  menu.addToUi();
}

/**
 * Checks if user is currently logged into Arena
 * @return {boolean} True if logged in, false otherwise
 */
function isUserLoggedIn() {
  var userProps = PropertiesService.getUserProperties();
  var sessionId = userProps.getProperty('arena_session_id');

  return sessionId !== null && sessionId !== '';
}

/**
 * Shows the login dialog
 */
function showLoginDialog() {
  var html = HtmlService.createHtmlOutputFromFile('html/LoginDialog')
    .setWidth(400)
    .setHeight(350)
    .setTitle('Login to Arena PLM');

  DocumentApp.getUi().showModalDialog(html, 'Login to Arena PLM');
}

/**
 * Shows the logout confirmation dialog
 */
function showLogoutDialog() {
  var ui = DocumentApp.getUi();
  var response = ui.alert(
    'Logout from Arena',
    'Are you sure you want to logout from Arena PLM?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    logout();
    ui.alert('Success', 'You have been logged out from Arena PLM.', ui.ButtonSet.OK);
  }
}

/**
 * Logs out the user by clearing credentials
 */
function logout() {
  var userProps = PropertiesService.getUserProperties();
  userProps.deleteProperty('arena_email');
  userProps.deleteProperty('arena_session_id');
  userProps.deleteProperty('arena_workspace_id');

  // Clear user-specific caches
  var cache = CacheService.getUserCache();
  cache.removeAll(['arena_categories', 'arena_items', 'arena_search_results']);
}

/**
 * Shows the category selector dialog
 */
function showCategorySelector() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/CategorySelector')
    .setWidth(600)
    .setHeight(500)
    .setTitle('Select Category');

  DocumentApp.getUi().showModalDialog(html, 'Select Arena Category');
}

/**
 * Shows the token palette sidebar
 */
function showTokenPalette() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/TokenPalette')
    .setTitle('Arena Tokens');

  DocumentApp.getUi().showSidebar(html);
}

/**
 * Shows the Arena search dialog
 */
function showSearchDialog() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/SearchDialog')
    .setWidth(700)
    .setHeight(600)
    .setTitle('Search Arena Items');

  DocumentApp.getUi().showModalDialog(html, 'Search Arena Items');
}

/**
 * Shows a quick search prompt for item number
 */
function showQuickSearchPrompt() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var ui = DocumentApp.getUi();
  var response = ui.prompt(
    'Quick Search',
    'Enter Arena item number:',
    ui.ButtonSet.OK_CANCEL
  );

  if (response.getSelectedButton() === ui.Button.OK) {
    var itemNumber = response.getResponseText().trim();

    if (itemNumber) {
      try {
        var result = populateDocumentByItemNumber(itemNumber);

        if (result.success) {
          ui.alert('Success', 'Document populated with item: ' + itemNumber, ui.ButtonSet.OK);
        } else {
          ui.alert('Error', result.error || 'Failed to populate document', ui.ButtonSet.OK);
        }
      } catch (error) {
        Logger.log('Error in quick search: ' + error.message);
        ui.alert('Error', 'Failed to find or populate item: ' + itemNumber, ui.ButtonSet.OK);
      }
    }
  }
}

/**
 * Clears all tokens from the document
 */
function clearAllTokens() {
  var ui = DocumentApp.getUi();
  var response = ui.alert(
    'Clear All Tokens',
    'This will remove all Arena tokens and their metadata from the document. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    try {
      clearAllTokensFromDocument();
      ui.alert('Success', 'All Arena tokens have been cleared.', ui.ButtonSet.OK);
    } catch (error) {
      Logger.log('Error clearing tokens: ' + error.message);
      ui.alert('Error', 'Failed to clear tokens: ' + error.message, ui.ButtonSet.OK);
    }
  }
}

/**
 * Updates the current document in place with latest Arena data
 */
function updateDocumentInPlace() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var ui = DocumentApp.getUi();
  var response = ui.alert(
    'Update Document',
    'This will replace all token values with the latest data from Arena. Continue?',
    ui.ButtonSet.YES_NO
  );

  if (response === ui.Button.YES) {
    try {
      var result = updateDocumentTokens();

      if (result.success) {
        ui.alert('Success', 'Document updated with ' + result.tokensUpdated + ' changes.', ui.ButtonSet.OK);
      } else {
        ui.alert('Error', result.error || 'Failed to update document', ui.ButtonSet.OK);
      }
    } catch (error) {
      Logger.log('Error updating document: ' + error.message);
      ui.alert('Error', 'Failed to update document: ' + error.message, ui.ButtonSet.OK);
    }
  }
}

/**
 * Creates a revised copy of the document
 */
function createRevisedCopy() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/RevisionDialog')
    .setWidth(500)
    .setHeight(400)
    .setTitle('Create Revised Copy');

  DocumentApp.getUi().showModalDialog(html, 'Create Revised Copy');
}

/**
 * Shows a preview of changes that would be made
 */
function showChangePreview() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  try {
    var changes = detectDocumentChanges();

    if (changes.length === 0) {
      DocumentApp.getUi().alert('No Changes', 'Document is up to date with Arena.', DocumentApp.getUi().ButtonSet.OK);
      return;
    }

    var html = HtmlService.createTemplateFromFile('html/ChangePreview');
    html.changes = changes;

    var htmlOutput = html.evaluate()
      .setWidth(700)
      .setHeight(500)
      .setTitle('Change Preview');

    DocumentApp.getUi().showModalDialog(htmlOutput, 'Change Preview');
  } catch (error) {
    Logger.log('Error showing change preview: ' + error.message);
    DocumentApp.getUi().alert('Error', 'Failed to detect changes: ' + error.message, DocumentApp.getUi().ButtonSet.OK);
  }
}

/**
 * Shows the token mappings management dialog
 */
function showTokenMappings() {
  var html = HtmlService.createHtmlOutputFromFile('html/TokenMappings')
    .setWidth(600)
    .setHeight(500)
    .setTitle('Token Mappings');

  DocumentApp.getUi().showModalDialog(html, 'Token Mappings');
}

/**
 * Clears all caches
 */
function clearAllCaches() {
  try {
    var cacheManager = createCacheManager();
    cacheManager.invalidateArenaCache();

    DocumentApp.getUi().alert(
      'Success',
      'All Arena PLM caches have been cleared.\n\nCategories and fields will be refreshed on next access.',
      DocumentApp.getUi().ButtonSet.OK
    );
  } catch (error) {
    Logger.log('Error clearing caches: ' + error.message);
    DocumentApp.getUi().alert(
      'Error',
      'Failed to clear caches: ' + error.message,
      DocumentApp.getUi().ButtonSet.OK
    );
  }
}

/**
 * Shows the about dialog
 */
function showAboutDialog() {
  var html = HtmlService.createHtmlOutputFromFile('html/AboutDialog')
    .setWidth(400)
    .setHeight(300)
    .setTitle('About Arena PLM for Docs');

  DocumentApp.getUi().showModalDialog(html, 'About');
}

/**
 * Gets the current user's email for display
 * @return {string} User's email address
 */
function getUserEmail() {
  return Session.getActiveUser().getEmail();
}

/**
 * Server-side login function called from LoginDialog.html
 * @param {string} email - User's email
 * @param {string} password - User's password
 * @param {string} workspaceId - Arena workspace ID
 * @return {Object} Login result
 */
function loginUser(email, password, workspaceId) {
  var client = new ArenaAPIClient();
  return client.login(email, password, workspaceId);
}

/**
 * Searches Arena items by keyword
 * @param {string} keyword - Search keyword
 * @return {Array} Array of matching items
 */
function searchArenaItems(keyword) {
  var client = createArenaClient();
  return client.searchItems(keyword);
}

/**
 * Gets the current document name
 * @return {string} Document name
 */
function getCurrentDocumentName() {
  return DocumentApp.getActiveDocument().getName();
}

/**
 * Shows the AI Document Generation Wizard
 */
function showDocumentGenerationWizard() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/DocumentGenerationWizard')
    .setWidth(800)
    .setHeight(700)
    .setTitle('AI Document Generation');

  DocumentApp.getUi().showModalDialog(html, 'AI Document Generation');
}

/**
 * Shows the Autodetect Token Dialog
 */
function showAutodetectDialog() {
  if (!isUserLoggedIn()) {
    DocumentApp.getUi().alert('Please login to Arena PLM first.');
    return;
  }

  var html = HtmlService.createHtmlOutputFromFile('html/AutodetectDialog')
    .setWidth(700)
    .setHeight(600)
    .setTitle('Autodetect Field Tokens');

  DocumentApp.getUi().showModalDialog(html, 'Autodetect Field Tokens');
}

/**
 * Shows the Gemini API Key configuration dialog
 */
function showGeminiApiKeyDialog() {
  var html = HtmlService.createHtmlOutputFromFile('html/GeminiApiKeyDialog')
    .setWidth(600)
    .setHeight(550)
    .setTitle('Configure Gemini API Key');

  DocumentApp.getUi().showModalDialog(html, 'Configure Gemini API Key');
}

/**
 * Checks if user has configured a Gemini API key
 * @return {boolean} True if API key is configured
 */
function hasGeminiApiKey() {
  var userProps = PropertiesService.getUserProperties();
  var apiKey = userProps.getProperty('gemini_api_key');
  return apiKey !== null && apiKey !== '';
}

/**
 * Saves the Gemini API key
 * @param {string} apiKey - The Gemini API key
 * @return {Object} Result object
 */
function saveGeminiApiKey(apiKey) {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return {
        success: false,
        error: 'API key cannot be empty'
      };
    }

    var userProps = PropertiesService.getUserProperties();
    userProps.setProperty('gemini_api_key', apiKey.trim());

    return {
      success: true
    };
  } catch (error) {
    Logger.log('Error saving Gemini API key: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Clears the Gemini API key
 * @return {Object} Result object
 */
function clearGeminiApiKey() {
  try {
    var userProps = PropertiesService.getUserProperties();
    userProps.deleteProperty('gemini_api_key');

    return {
      success: true
    };
  } catch (error) {
    Logger.log('Error clearing Gemini API key: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}
