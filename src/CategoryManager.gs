/**
 * Category Manager
 * Handles category-related operations and field mappings
 */

/**
 * Gets all categories from Arena (with caching)
 * @return {Array} Array of categories
 */
function getArenaCategories() {
  try {
    var cacheManager = createCacheManager();

    // Try to get from cache first
    return cacheManager.getCachedCategories(function() {
      // Cache miss - fetch from API
      Logger.log('Fetching categories from Arena API...');
      var client = createArenaClient();
      return client.getCategories();
    });
  } catch (error) {
    Logger.log('Error getting categories: ' + error.message);
    throw error;
  }
}

/**
 * Gets attributes/fields for a specific category (with caching)
 * @param {string} categoryGuid - Category GUID
 * @return {Object} Object with standard and custom fields
 */
function getCategoryFields(categoryGuid) {
  try {
    Logger.log('getCategoryFields called with GUID: ' + categoryGuid);

    if (!categoryGuid) {
      throw new Error('Category GUID is required');
    }

    var cacheManager = createCacheManager();

    // Try to get from cache first
    return cacheManager.getCachedFields(categoryGuid, function(guid) {
      // Cache miss - fetch from API
      Logger.log('Fetching fields for category ' + guid + ' from Arena API...');
      var client = createArenaClient();

      // Get category name from cached categories list (more efficient)
      var categoryName = 'Unknown Category';
      try {
        var categories = cacheManager.get('arena_categories', 'user');
        if (categories) {
          for (var i = 0; i < categories.length; i++) {
            if (categories[i].guid === guid) {
              categoryName = categories[i].name;
              break;
            }
          }
        }
      } catch (e) {
        Logger.log('Could not get category name from cache, using fallback: ' + e.message);
      }

      // Standard fields available for all categories
      var standardFields = [
        {
          name: 'number',
          displayName: 'Item Number',
          type: 'standard',
          description: 'Arena item number'
        },
        {
          name: 'name',
          displayName: 'Name',
          type: 'standard',
          description: 'Item name'
        },
        {
          name: 'description',
          displayName: 'Description',
          type: 'standard',
          description: 'Item description'
        },
        {
          name: 'revisionNumber',
          displayName: 'Revision',
          type: 'standard',
          description: 'Current revision number'
        },
        {
          name: 'lifecyclePhase',
          displayName: 'Lifecycle Phase',
          type: 'standard',
          description: 'Current lifecycle phase'
        }
      ];

      // Get custom attributes for this category
      var customAttributes = [];
      try {
        customAttributes = client.getCategoryAttributes(guid);
        if (!customAttributes) {
          customAttributes = [];
        }
      } catch (attrError) {
        Logger.log('Error fetching custom attributes for category ' + guid + ': ' + attrError.message);
        // Continue with empty custom attributes rather than failing completely
        customAttributes = [];
      }

      var customFields = customAttributes.map(function(attr) {
        return {
          name: attr.name || attr.Name,
          displayName: attr.name || attr.Name,
          guid: attr.guid || attr.Guid,
          type: 'custom',
          fieldType: attr.fieldType || attr.FieldType,
          description: 'Custom attribute'
        };
      });

      return {
        categoryName: categoryName,
        categoryGuid: guid,
        standardFields: standardFields,
        customFields: customFields
      };
    });
  } catch (error) {
    Logger.log('Error getting category fields: ' + error.message);
    throw error;
  }
}

/**
 * Creates token mappings for a category
 * @param {string} categoryGuid - Category GUID
 * @param {Array} selectedFields - Array of selected field objects
 * @return {Object} Result with success status
 */
function createTokenMappings(categoryGuid, selectedFields) {
  try {
    var client = createArenaClient();
    var category = client.getCategoryByGuid(categoryGuid);

    if (!category) {
      return {
        success: false,
        error: 'Category not found'
      };
    }

    var categoryName = category.name || category.Name;

    // Store mappings in document properties
    var props = PropertiesService.getDocumentProperties();
    var mappings = [];

    for (var i = 0; i < selectedFields.length; i++) {
      var field = selectedFields[i];

      var mapping = {
        categoryName: categoryName,
        categoryGuid: categoryGuid,
        fieldName: field.name,
        fieldDisplayName: field.displayName,
        fieldType: field.type,
        attributeGuid: field.guid || null,
        tokenText: createTokenString(categoryName, field.displayName)
      };

      mappings.push(mapping);
    }

    // Store mappings
    var mappingKey = 'category_mapping_' + categoryGuid;
    props.setProperty(mappingKey, JSON.stringify(mappings));

    return {
      success: true,
      mappings: mappings
    };
  } catch (error) {
    Logger.log('Error creating token mappings: ' + error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Gets all token mappings for the document
 * @return {Array} Array of all token mappings
 */
function getAllTokenMappings() {
  var props = PropertiesService.getDocumentProperties();
  var allProps = props.getProperties();

  var allMappings = [];

  for (var key in allProps) {
    if (key.startsWith('category_mapping_')) {
      try {
        var mappings = JSON.parse(allProps[key]);
        allMappings = allMappings.concat(mappings);
      } catch (error) {
        Logger.log('Error parsing mappings for key ' + key + ': ' + error.message);
      }
    }
  }

  return allMappings;
}

/**
 * Clears all token mappings
 */
function clearAllTokenMappings() {
  var props = PropertiesService.getDocumentProperties();
  var allProps = props.getProperties();

  for (var key in allProps) {
    if (key.startsWith('category_mapping_')) {
      props.deleteProperty(key);
    }
  }
}

/**
 * Gets token mappings for a specific category
 * @param {string} categoryGuid - Category GUID
 * @return {Array} Array of token mappings for the category
 */
function getCategoryTokenMappings(categoryGuid) {
  var props = PropertiesService.getDocumentProperties();
  var mappingKey = 'category_mapping_' + categoryGuid;
  var value = props.getProperty(mappingKey);

  return value ? JSON.parse(value) : [];
}
