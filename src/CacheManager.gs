/**
 * Cache Manager
 * Provides intelligent caching for Arena PLM data to improve performance
 * Uses CacheService with configurable TTL and automatic invalidation
 */

var CACHE_CONFIG = {
  CATEGORIES: {
    key: 'arena_categories',
    ttl: 3600, // 1 hour in seconds
    type: 'user' // User-specific cache (depends on login session)
  },
  FIELDS: {
    keyPrefix: 'arena_fields_',
    ttl: 1800, // 30 minutes in seconds
    type: 'user' // User-specific cache
  },
  SESSION: {
    key: 'arena_session_valid',
    ttl: 300, // 5 minutes for session validation
    type: 'user'
  }
};

/**
 * Cache Manager Class
 */
var CacheManager = (function() {

  function CacheManager() {
    this.scriptCache = CacheService.getScriptCache();
    this.userCache = CacheService.getUserCache();
    this.documentCache = CacheService.getDocumentCache();
  }

  /**
   * Gets the appropriate cache based on type
   * @private
   */
  CacheManager.prototype._getCache = function(type) {
    switch (type) {
      case 'script':
        return this.scriptCache;
      case 'user':
        return this.userCache;
      case 'document':
        return this.documentCache;
      default:
        return this.userCache;
    }
  };

  /**
   * Gets cached data if available and not expired
   * @param {string} key - Cache key
   * @param {string} type - Cache type (user, script, document)
   * @return {Object|null} Cached data or null if not found/expired
   */
  CacheManager.prototype.get = function(key, type) {
    type = type || 'user';

    try {
      var cache = this._getCache(type);
      var cached = cache.get(key);

      if (!cached) {
        Logger.log('Cache MISS: ' + key);
        return null;
      }

      var data = JSON.parse(cached);

      // Check if expired
      if (data.expiresAt && data.expiresAt < Date.now()) {
        Logger.log('Cache EXPIRED: ' + key);
        cache.remove(key);
        return null;
      }

      Logger.log('Cache HIT: ' + key);
      return data.value;
    } catch (error) {
      Logger.log('Cache error on get: ' + error.message);
      return null;
    }
  };

  /**
   * Stores data in cache with TTL
   * @param {string} key - Cache key
   * @param {Object} value - Data to cache
   * @param {number} ttl - Time to live in seconds
   * @param {string} type - Cache type (user, script, document)
   */
  CacheManager.prototype.set = function(key, value, ttl, type) {
    type = type || 'user';
    ttl = ttl || 3600;

    try {
      var cache = this._getCache(type);
      var data = {
        value: value,
        cachedAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      };

      var serialized = JSON.stringify(data);

      // CacheService has max 100KB per entry
      if (serialized.length > 100000) {
        Logger.log('Cache item too large, skipping: ' + key);
        return false;
      }

      cache.put(key, serialized, ttl);
      Logger.log('Cache SET: ' + key + ' (TTL: ' + ttl + 's)');
      return true;
    } catch (error) {
      Logger.log('Cache error on set: ' + error.message);
      return false;
    }
  };

  /**
   * Removes specific key from cache
   * @param {string} key - Cache key
   * @param {string} type - Cache type
   */
  CacheManager.prototype.remove = function(key, type) {
    type = type || 'user';

    try {
      var cache = this._getCache(type);
      cache.remove(key);
      Logger.log('Cache REMOVED: ' + key);
      return true;
    } catch (error) {
      Logger.log('Cache error on remove: ' + error.message);
      return false;
    }
  };

  /**
   * Clears all cache for a specific type
   * @param {string} type - Cache type to clear
   */
  CacheManager.prototype.clearAll = function(type) {
    type = type || 'user';

    try {
      var cache = this._getCache(type);
      cache.removeAll(['arena_categories', 'arena_session_valid']);

      // Clear all field caches (can't wildcard, so clear common ones)
      for (var i = 0; i < 100; i++) {
        cache.remove('arena_fields_' + i);
      }

      Logger.log('Cache CLEARED: ' + type);
      return true;
    } catch (error) {
      Logger.log('Cache error on clearAll: ' + error.message);
      return false;
    }
  };

  /**
   * Gets categories with caching
   * @param {Function} fetchFunction - Function to call if cache miss
   * @return {Array} Categories array
   */
  CacheManager.prototype.getCachedCategories = function(fetchFunction) {
    var config = CACHE_CONFIG.CATEGORIES;
    var cached = this.get(config.key, config.type);

    if (cached) {
      return cached;
    }

    // Cache miss - fetch fresh data
    var categories = fetchFunction();

    if (categories && categories.length > 0) {
      this.set(config.key, categories, config.ttl, config.type);
    }

    return categories;
  };

  /**
   * Gets category fields with caching
   * @param {string} categoryGuid - Category GUID
   * @param {Function} fetchFunction - Function to call if cache miss
   * @return {Object} Fields object {standardFields: [], customFields: []}
   */
  CacheManager.prototype.getCachedFields = function(categoryGuid, fetchFunction) {
    var config = CACHE_CONFIG.FIELDS;
    var cacheKey = config.keyPrefix + categoryGuid;
    var cached = this.get(cacheKey, config.type);

    if (cached) {
      return cached;
    }

    // Cache miss - fetch fresh data
    var fields = fetchFunction(categoryGuid);

    if (fields) {
      this.set(cacheKey, fields, config.ttl, config.type);
    }

    return fields;
  };

  /**
   * Invalidates category cache (e.g., after logout or refresh)
   */
  CacheManager.prototype.invalidateArenaCache = function() {
    Logger.log('Invalidating all Arena cache...');

    var cache = this._getCache('user');
    var fieldCachesCleared = 0;

    // First, try to get cached categories to know which field caches to clear
    try {
      var categories = this.get(CACHE_CONFIG.CATEGORIES.key, CACHE_CONFIG.CATEGORIES.type);
      if (categories && categories.length > 0) {
        Logger.log('Found ' + categories.length + ' categories in cache, clearing associated field caches');
        for (var i = 0; i < categories.length; i++) {
          var categoryGuid = categories[i].guid;
          if (categoryGuid) {
            var fieldCacheKey = CACHE_CONFIG.FIELDS.keyPrefix + categoryGuid;
            cache.remove(fieldCacheKey);
            fieldCachesCleared++;
            Logger.log('Cleared field cache: ' + fieldCacheKey);
          }
        }
      }
    } catch (e) {
      Logger.log('Could not use categories to clear field caches: ' + e.message);
    }

    // Now clear the main caches
    this.remove(CACHE_CONFIG.CATEGORIES.key, CACHE_CONFIG.CATEGORIES.type);
    this.remove(CACHE_CONFIG.SESSION.key, CACHE_CONFIG.SESSION.type);

    Logger.log('Arena cache invalidated - Cleared ' + fieldCachesCleared + ' field caches');
    return {
      success: true,
      message: 'Cache cleared successfully. Cleared ' + fieldCachesCleared + ' field caches.'
    };
  };

  /**
   * Gets cache statistics for debugging
   */
  CacheManager.prototype.getCacheStats = function() {
    var stats = {
      categories: null,
      fieldCacheCount: 0,
      session: null
    };

    // Check categories cache
    var categoriesData = this.get(CACHE_CONFIG.CATEGORIES.key, CACHE_CONFIG.CATEGORIES.type);
    if (categoriesData) {
      stats.categories = {
        count: categoriesData.length,
        cached: true
      };
    }

    // Check session cache
    var sessionValid = this.get(CACHE_CONFIG.SESSION.key, CACHE_CONFIG.SESSION.type);
    stats.session = sessionValid ? 'valid' : 'expired';

    return stats;
  };

  return CacheManager;
})();

/**
 * Helper function to create cache manager instance
 */
function createCacheManager() {
  return new CacheManager();
}

/**
 * Server function to invalidate cache (called from menu)
 */
function invalidateArenaCache() {
  var cacheManager = createCacheManager();
  return cacheManager.invalidateArenaCache();
}
