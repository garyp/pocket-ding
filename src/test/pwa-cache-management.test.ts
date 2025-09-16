import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
/// <reference path="./types.d.ts" />

/**
 * PWA Cache Boundary Testing - Phase 2
 *
 * Tests cache management, storage quotas, and invalidation scenarios
 * to ensure robust PWA cache behavior under various conditions.
 *
 * Focus areas:
 * - Cache Storage Quotas (approaching limits, quota exceeded, graceful degradation)
 * - Cache Invalidation (manual clearing, stale detection, cache versioning)
 * - Cache Boundary Conditions (large responses, corrupted entries, concurrent access)
 * - Storage Quota Management (navigator.storage.estimate() integration)
 */

describe('PWA Cache Management Tests', () => {
  let mockCacheStorage: any;
  let mockCache: any;
  let mockStorageManager: any;
  let originalNavigator: any;

  beforeEach(() => {
    // Set up comprehensive Cache API mocking
    mockCache = {
      match: vi.fn(),
      matchAll: vi.fn(),
      add: vi.fn(),
      addAll: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      keys: vi.fn(),
    };

    mockCacheStorage = {
      open: vi.fn().mockResolvedValue(mockCache),
      delete: vi.fn(),
      has: vi.fn(),
      keys: vi.fn().mockResolvedValue([]),
      match: vi.fn(),
    };

    mockStorageManager = {
      estimate: vi.fn().mockResolvedValue({
        usage: 50 * 1024 * 1024, // 50MB used
        quota: 100 * 1024 * 1024, // 100MB available
      }),
      persist: vi.fn().mockResolvedValue(true),
      persisted: vi.fn().mockResolvedValue(true),
    };

    // Store originals for restoration
    originalNavigator = (globalThis as any).navigator;

    // Use the global cache mocks from setup.ts instead of redefining
    // Update the global mocks to use our specific test mocks
    const globalCacheStorage = global.mockCacheStorage;
    const globalCache = global.mockCache;

    // Configure the global cache mock with our test-specific implementations
    if (vi.isMockFunction(globalCacheStorage.open)) {
      globalCacheStorage.open.mockImplementation(mockCacheStorage.open);
    }
    if (vi.isMockFunction(globalCacheStorage.delete)) {
      globalCacheStorage.delete.mockImplementation(mockCacheStorage.delete);
    }
    if (vi.isMockFunction(globalCacheStorage.has)) {
      globalCacheStorage.has.mockImplementation(mockCacheStorage.has);
    }
    if (vi.isMockFunction(globalCacheStorage.keys)) {
      globalCacheStorage.keys.mockImplementation(mockCacheStorage.keys);
    }
    if (vi.isMockFunction(globalCacheStorage.match)) {
      globalCacheStorage.match.mockImplementation(mockCacheStorage.match);
    }

    // Configure the global cache with our test-specific implementations
    if (vi.isMockFunction(globalCache.match)) {
      globalCache.match.mockImplementation(mockCache.match);
    }
    if (vi.isMockFunction(globalCache.matchAll)) {
      globalCache.matchAll.mockImplementation(mockCache.matchAll);
    }
    if (vi.isMockFunction(globalCache.add)) {
      globalCache.add.mockImplementation(mockCache.add);
    }
    if (vi.isMockFunction(globalCache.addAll)) {
      globalCache.addAll.mockImplementation(mockCache.addAll);
    }
    if (vi.isMockFunction(globalCache.put)) {
      globalCache.put.mockImplementation(mockCache.put);
    }
    if (vi.isMockFunction(globalCache.delete)) {
      globalCache.delete.mockImplementation(mockCache.delete);
    }
    if (vi.isMockFunction(globalCache.keys)) {
      globalCache.keys.mockImplementation(mockCache.keys);
    }

    Object.defineProperty(globalThis, 'navigator', {
      value: {
        ...globalThis.navigator,
        storage: mockStorageManager,
      },
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    // No need to restore caches as we're using global mocks from setup.ts
    // The setup.ts afterEach handles proper cleanup of PWA mocks

    if (originalNavigator) {
      Object.defineProperty(globalThis, 'navigator', {
        value: originalNavigator,
        writable: true,
        configurable: true,
      });
    }

    vi.clearAllMocks();
  });

  describe('Cache Storage Quotas', () => {
    it('should detect when approaching storage limits', async () => {
      // Simulate approaching storage limit (90% used)
      mockStorageManager.estimate.mockResolvedValue({
        usage: 90 * 1024 * 1024, // 90MB used
        quota: 100 * 1024 * 1024, // 100MB available
      });

      const storageInfo = await navigator.storage.estimate();
      const usagePercentage = (storageInfo.usage! / storageInfo.quota!) * 100;

      expect(usagePercentage).toBeGreaterThan(80);
      expect(usagePercentage).toBeLessThan(95);

      // Verify warning threshold is detected
      const isApproachingLimit = usagePercentage > 80;
      expect(isApproachingLimit).toBe(true);
    });

    it('should handle quota exceeded scenario gracefully', async () => {
      // Simulate quota exceeded error
      const quotaExceededError = new DOMException('QuotaExceededError', 'QuotaExceededError');
      mockCache.put.mockRejectedValue(quotaExceededError);

      // Attempt to cache a large response
      const testRequest = new Request('https://example.com/large-content');
      const testResponse = new Response('Large content data', {
        headers: { 'content-length': '50000000' }, // 50MB
      });

      try {
        await mockCache.put(testRequest, testResponse);
        expect.fail('Should have thrown QuotaExceededError');
      } catch (error) {
        expect(error).toBeInstanceOf(DOMException);
        expect((error as DOMException).name).toBe('QuotaExceededError');
      }

      // Verify graceful degradation behavior
      expect(mockCache.put).toHaveBeenCalledWith(testRequest, testResponse);
    });

    it('should implement LRU cache eviction behavior', async () => {
      // Mock existing cache entries (oldest first)
      const cacheEntries = [
        new Request('https://example.com/old-content-1'),
        new Request('https://example.com/old-content-2'),
        new Request('https://example.com/recent-content'),
      ];

      mockCache.keys.mockResolvedValue(cacheEntries);
      mockCache.delete.mockResolvedValue(true);

      // Simulate LRU eviction when quota is exceeded
      const evictLRUEntries = async (count: number) => {
        const keys = await mockCache.keys();
        const toEvict = keys.slice(0, count);

        for (const request of toEvict) {
          await mockCache.delete(request);
        }

        return toEvict.length;
      };

      const evictedCount = await evictLRUEntries(2);

      expect(evictedCount).toBe(2);
      expect(mockCache.delete).toHaveBeenCalledWith(cacheEntries[0]);
      expect(mockCache.delete).toHaveBeenCalledWith(cacheEntries[1]);
      expect(mockCache.delete).not.toHaveBeenCalledWith(cacheEntries[2]);
    });

    it('should provide accurate storage usage monitoring', async () => {
      // Test different storage usage scenarios
      const scenarios = [
        { usage: 10 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 10% used
        { usage: 50 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 50% used
        { usage: 95 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 95% used
      ];

      for (const scenario of scenarios) {
        mockStorageManager.estimate.mockResolvedValueOnce(scenario);

        const storageInfo = await navigator.storage.estimate();
        const usagePercentage = ((storageInfo.usage || 0) / (storageInfo.quota || 1)) * 100;

        expect(storageInfo.usage).toBe(scenario.usage);
        expect(storageInfo.quota).toBe(scenario.quota);
        expect(usagePercentage).toBeCloseTo((scenario.usage / scenario.quota) * 100, 1);
      }
    });
  });

  describe('Cache Invalidation', () => {
    it('should manually clear cache entries', async () => {
      // Mock cache with test entries
      const testEntries = [
        new Request('https://example.com/page1'),
        new Request('https://example.com/page2'),
        new Request('https://example.com/api/data'),
      ];

      mockCache.keys.mockResolvedValue(testEntries);
      mockCache.delete.mockResolvedValue(true);

      // Clear all cache entries
      const clearCache = async () => {
        const keys = await mockCache.keys();
        const deletePromises = keys.map((request: Request) => mockCache.delete(request));
        await Promise.all(deletePromises);
        return keys.length;
      };

      const clearedCount = await clearCache();

      expect(clearedCount).toBe(3);
      expect(mockCache.delete).toHaveBeenCalledTimes(3);
      testEntries.forEach(entry => {
        expect(mockCache.delete).toHaveBeenCalledWith(entry);
      });
    });

    it('should detect and refresh stale cache entries', async () => {
      const testUrl = 'https://example.com/api/bookmarks';
      const testRequest = new Request(testUrl);

      // Mock stale cached response (1 week old)
      const staleDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const staleResponse = new Response('Stale data', {
        headers: {
          'date': staleDate.toUTCString(),
          'cache-control': 'max-age=86400', // 1 day max age
        },
      });

      mockCache.match.mockResolvedValue(staleResponse);

      // Check if response is stale
      const isResponseStale = (response: Response) => {
        const dateHeader = response.headers.get('date');
        const cacheControl = response.headers.get('cache-control');

        if (!dateHeader || !cacheControl) return true;

        const responseDate = new Date(dateHeader);
        const maxAge = parseInt(cacheControl.match(/max-age=(\d+)/)?.[1] || '0', 10);
        const expiryDate = new Date(responseDate.getTime() + maxAge * 1000);

        return Date.now() > expiryDate.getTime();
      };

      const cachedResponse = await mockCache.match(testRequest);
      const isStale = isResponseStale(cachedResponse);

      expect(isStale).toBe(true);
      expect(mockCache.match).toHaveBeenCalledWith(testRequest);
    });

    it('should handle cache versioning with app updates', async () => {
      const currentVersion = '1.2.0';

      // Mock cache names with version suffixes
      mockCacheStorage.keys.mockResolvedValue([
        `pocket-ding-v${currentVersion}`,
        `pocket-ding-static-v${currentVersion}`,
      ]);

      // Simulate app update requiring cache invalidation
      const invalidateCacheForVersion = async (oldVersion: string) => {
        const cacheNames = await caches.keys();
        const oldCaches = cacheNames.filter(name => name.includes(oldVersion));

        const deletePromises = oldCaches.map(name => caches.delete(name));
        await Promise.all(deletePromises);

        return oldCaches;
      };

      mockCacheStorage.delete.mockResolvedValue(true);
      const deletedCaches = await invalidateCacheForVersion(currentVersion);

      expect(deletedCaches).toHaveLength(2);
      expect(mockCacheStorage.delete).toHaveBeenCalledWith(`pocket-ding-v${currentVersion}`);
      expect(mockCacheStorage.delete).toHaveBeenCalledWith(`pocket-ding-static-v${currentVersion}`);
    });

    it('should validate cache integrity and detect corruption', async () => {
      const testRequest = new Request('https://example.com/data');

      // Mock corrupted response that fails to deserialize
      const corruptedResponse = {
        // Simulate response object with missing required properties
        headers: new Headers(),
        ok: true,
        status: 200,
        // Missing body and other critical Response properties
      };

      mockCache.match.mockResolvedValue(corruptedResponse);

      // Validate cache entry integrity
      const validateCacheEntry = async (request: Request) => {
        try {
          const response = await mockCache.match(request);
          if (!response) return { valid: false, reason: 'not_found' };

          // Check for required Response properties
          const hasRequiredProps =
            response.hasOwnProperty('body') &&
            response.hasOwnProperty('bodyUsed') &&
            response.hasOwnProperty('headers') &&
            response.hasOwnProperty('ok') &&
            response.hasOwnProperty('status');

          if (!hasRequiredProps) {
            return { valid: false, reason: 'corrupted_properties' };
          }

          // Additional integrity checks could be added here
          return { valid: true };
        } catch (error) {
          return { valid: false, reason: 'exception', error };
        }
      };

      const validationResult = await validateCacheEntry(testRequest);

      expect(validationResult.valid).toBe(false);
      expect(validationResult.reason).toBe('corrupted_properties');
    });
  });

  describe('Cache Boundary Conditions', () => {
    it('should handle extremely large cached responses', async () => {
      const testRequest = new Request('https://example.com/huge-data');

      // Create a large response (10MB)
      const largeData = 'x'.repeat(10 * 1024 * 1024);
      const largeResponse = new Response(largeData, {
        headers: { 'content-type': 'text/plain' },
      });

      // Test caching large response
      mockCache.put.mockImplementation(async (_request: Request, response: Response) => {
        const contentLength = (await response.clone().text()).length;

        // Simulate size-based caching decisions
        if (contentLength > 5 * 1024 * 1024) { // > 5MB
          throw new DOMException('Response too large', 'QuotaExceededError');
        }

        return Promise.resolve();
      });

      await expect(mockCache.put(testRequest, largeResponse))
        .rejects.toThrow('Response too large');

      expect(mockCache.put).toHaveBeenCalledWith(testRequest, largeResponse);
    });

    it('should handle concurrent cache access scenarios', async () => {
      const testUrl = 'https://example.com/concurrent-access';
      const testRequest = new Request(testUrl);

      let callCount = 0;
      mockCache.match.mockImplementation(() => {
        callCount++;
        // Return immediately resolved promises to avoid timing issues
        return Promise.resolve(new Response(`Response ${callCount}`));
      });

      // Simulate multiple concurrent cache access operations
      const concurrentOperations = Array.from({ length: 5 }, () =>
        mockCache.match(testRequest)
      );

      const responses = await Promise.all(concurrentOperations);

      expect(responses).toHaveLength(5);
      expect(mockCache.match).toHaveBeenCalledTimes(5);

      // Verify all calls were made with the same request
      responses.forEach(() => {
        expect(mockCache.match).toHaveBeenCalledWith(testRequest);
      });

      // Verify that each response has a unique identifier showing concurrency
      const responseTexts = await Promise.all(responses.map(r => r.text()));
      expect(responseTexts).toEqual([
        'Response 1',
        'Response 2',
        'Response 3',
        'Response 4',
        'Response 5'
      ]);
    });

    it('should recover from cache corruption gracefully', async () => {
      const testRequest = new Request('https://example.com/data');

      // First call returns corrupted data, second call should handle recovery
      mockCache.match
        .mockResolvedValueOnce(null) // Simulate corruption by returning null
        .mockResolvedValueOnce(new Response('Fresh data'));

      mockCache.put.mockResolvedValue(undefined);

      // Recovery function that refetches on corruption
      const getCachedOrFresh = async (request: Request) => {
        let cachedResponse = await mockCache.match(request);

        if (!cachedResponse) {
          // Simulate fetching fresh data
          const freshResponse = new Response('Fresh data from network');
          await mockCache.put(request, freshResponse.clone());
          return freshResponse;
        }

        return cachedResponse;
      };

      const result = await getCachedOrFresh(testRequest);

      expect(result).toBeInstanceOf(Response);
      expect(await result.text()).toBe('Fresh data from network');
      expect(mockCache.put).toHaveBeenCalled();
    });

    it('should handle cache API method failures gracefully', async () => {
      const testRequest = new Request('https://example.com/failing-cache');
      const testResponse = new Response('Test data');

      // Mock various cache operation failures
      mockCache.match.mockRejectedValue(new Error('Cache match failed'));
      mockCache.put.mockRejectedValue(new Error('Cache put failed'));
      mockCache.delete.mockRejectedValue(new Error('Cache delete failed'));

      // Test graceful handling of cache failures
      const safeCache = {
        match: async (request: Request) => {
          try {
            return await mockCache.match(request);
          } catch (error) {
            console.warn('Cache match failed:', error);
            return null;
          }
        },
        put: async (request: Request, response: Response) => {
          try {
            return await mockCache.put(request, response);
          } catch (error) {
            console.warn('Cache put failed:', error);
            return false;
          }
        },
        delete: async (request: Request) => {
          try {
            return await mockCache.delete(request);
          } catch (error) {
            console.warn('Cache delete failed:', error);
            return false;
          }
        }
      };

      // Test that failures are handled without throwing
      const matchResult = await safeCache.match(testRequest);
      const putResult = await safeCache.put(testRequest, testResponse);
      const deleteResult = await safeCache.delete(testRequest);

      expect(matchResult).toBe(null);
      expect(putResult).toBe(false);
      expect(deleteResult).toBe(false);

      // Verify original methods were called
      expect(mockCache.match).toHaveBeenCalledWith(testRequest);
      expect(mockCache.put).toHaveBeenCalledWith(testRequest, testResponse);
      expect(mockCache.delete).toHaveBeenCalledWith(testRequest);
    });
  });

  describe('Storage Quota Management', () => {
    it('should integrate with navigator.storage.estimate()', async () => {
      // Test various storage scenarios
      const testScenarios = [
        {
          name: 'Low usage',
          usage: 10 * 1024 * 1024, // 10MB
          quota: 100 * 1024 * 1024, // 100MB
        },
        {
          name: 'High usage',
          usage: 80 * 1024 * 1024, // 80MB
          quota: 100 * 1024 * 1024, // 100MB
        },
        {
          name: 'Near quota limit',
          usage: 98 * 1024 * 1024, // 98MB
          quota: 100 * 1024 * 1024, // 100MB
        }
      ];

      for (const scenario of testScenarios) {
        mockStorageManager.estimate.mockResolvedValueOnce({
          usage: scenario.usage,
          quota: scenario.quota,
        });

        const estimate = await navigator.storage.estimate();
        const usagePercentage = ((estimate.usage || 0) / (estimate.quota || 1)) * 100;

        expect(estimate.usage).toBe(scenario.usage);
        expect(estimate.quota).toBe(scenario.quota);

        // Test usage categorization
        let category: string;
        if (usagePercentage < 50) {
          category = 'low';
        } else if (usagePercentage < 80) {
          category = 'moderate';
        } else {
          category = 'high';
        }

        expect(category).toMatch(/^(low|moderate|high)$/);
      }
    });

    it('should monitor storage usage changes over time', async () => {
      const usageHistory: Array<{ usage: number; quota: number; timestamp: number }> = [];

      // Simulate storage usage monitoring
      const monitorStorageUsage = async () => {
        const estimate = await navigator.storage.estimate();
        usageHistory.push({
          usage: estimate.usage!,
          quota: estimate.quota!,
          timestamp: Date.now(),
        });
        return estimate;
      };

      // Simulate usage increasing over time
      const usageSequence = [
        { usage: 10 * 1024 * 1024, quota: 100 * 1024 * 1024 },
        { usage: 30 * 1024 * 1024, quota: 100 * 1024 * 1024 },
        { usage: 60 * 1024 * 1024, quota: 100 * 1024 * 1024 },
        { usage: 85 * 1024 * 1024, quota: 100 * 1024 * 1024 },
      ];

      for (const data of usageSequence) {
        mockStorageManager.estimate.mockResolvedValueOnce(data);
        await monitorStorageUsage();
      }

      expect(usageHistory).toHaveLength(4);

      // Verify usage trend
      const usageTrend = usageHistory.map(entry => entry.usage);
      for (let i = 1; i < usageTrend.length; i++) {
        expect(usageTrend[i]!).toBeGreaterThan(usageTrend[i - 1]!);
      }
    });

    it('should provide user notifications for storage conditions', async () => {
      const notifications: Array<{ type: string; message: string; threshold: number }> = [];

      // Storage notification system
      const checkStorageAndNotify = async () => {
        const estimate = await navigator.storage.estimate();
        const usagePercentage = ((estimate.usage || 0) / (estimate.quota || 1)) * 100;

        if (usagePercentage > 90) {
          notifications.push({
            type: 'critical',
            message: 'Storage almost full. Please clear some data.',
            threshold: 90,
          });
        } else if (usagePercentage > 80) {
          notifications.push({
            type: 'warning',
            message: 'Storage usage is high. Consider clearing old content.',
            threshold: 80,
          });
        } else if (usagePercentage > 70) {
          notifications.push({
            type: 'info',
            message: 'Storage usage is moderate. Monitor for cleanup opportunities.',
            threshold: 70,
          });
        }

        return { usagePercentage, notificationCount: notifications.length };
      };

      // Test different storage levels
      const testLevels = [
        { usage: 75 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 75% - info
        { usage: 85 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 85% - warning
        { usage: 95 * 1024 * 1024, quota: 100 * 1024 * 1024 }, // 95% - critical
      ];

      for (const level of testLevels) {
        mockStorageManager.estimate.mockResolvedValueOnce(level);
        await checkStorageAndNotify();
      }

      expect(notifications).toHaveLength(3);
      expect(notifications[0]!.type).toBe('info');
      expect(notifications[1]!.type).toBe('warning');
      expect(notifications[2]!.type).toBe('critical');

      // Verify thresholds are correctly applied
      expect(notifications[0]!.threshold).toBe(70);
      expect(notifications[1]!.threshold).toBe(80);
      expect(notifications[2]!.threshold).toBe(90);
    });

    it('should handle storage persistence requests', async () => {
      // Test storage persistence API integration
      mockStorageManager.persist.mockResolvedValue(true);
      mockStorageManager.persisted.mockResolvedValue(false);

      // Check if storage is already persistent
      const isAlreadyPersistent = await navigator.storage.persisted();
      expect(isAlreadyPersistent).toBe(false);

      // Request persistent storage
      const persistenceGranted = await navigator.storage.persist();
      expect(persistenceGranted).toBe(true);

      // Verify API calls
      expect(mockStorageManager.persisted).toHaveBeenCalled();
      expect(mockStorageManager.persist).toHaveBeenCalled();
    });

    it('should handle storage estimation failures gracefully', async () => {
      // Test storage estimation API failure
      mockStorageManager.estimate.mockRejectedValue(new Error('Storage API not available'));

      const getStorageEstimateWithFallback = async () => {
        try {
          return await navigator.storage.estimate();
        } catch (error) {
          // Fallback to default values when API is unavailable
          return {
            usage: 0,
            quota: 50 * 1024 * 1024, // 50MB default
          };
        }
      };

      const estimate = await getStorageEstimateWithFallback();

      expect(estimate.usage).toBe(0);
      expect(estimate.quota).toBe(50 * 1024 * 1024);
      expect(mockStorageManager.estimate).toHaveBeenCalled();
    });
  });

  describe('Cache Integration Scenarios', () => {
    it('should coordinate cache operations with storage monitoring', async () => {
      // Simulate integrated cache and storage management
      mockStorageManager.estimate.mockResolvedValue({
        usage: 85 * 1024 * 1024, // 85MB used - high usage
        quota: 100 * 1024 * 1024, // 100MB quota
      });

      mockCache.keys.mockResolvedValue([
        new Request('https://example.com/old-1'),
        new Request('https://example.com/old-2'),
        new Request('https://example.com/recent'),
      ]);

      mockCache.delete.mockResolvedValue(true);

      // Integrated cache management function
      const manageCacheWithStorageAwareness = async () => {
        const estimate = await navigator.storage.estimate();
        const usagePercentage = ((estimate.usage || 0) / (estimate.quota || 1)) * 100;

        if (usagePercentage > 80) {
          // High storage usage - evict old cache entries
          const keys = await mockCache.keys();
          const toEvict = Math.min(2, keys.length); // Evict up to 2 entries

          for (let i = 0; i < toEvict; i++) {
            await mockCache.delete(keys[i]);
          }

          return {
            action: 'evicted',
            count: toEvict,
            reason: 'high_storage_usage',
            usagePercentage
          };
        }

        return {
          action: 'none',
          reason: 'storage_usage_acceptable',
          usagePercentage
        };
      };

      const result = await manageCacheWithStorageAwareness();

      expect(result.action).toBe('evicted');
      expect(result.count).toBe(2);
      expect(result.reason).toBe('high_storage_usage');
      expect(result.usagePercentage).toBe(85);
      expect(mockCache.delete).toHaveBeenCalledTimes(2);
    });

    it('should test PWA cache behavior in offline scenarios', async () => {
      // Mock offline cache behavior
      const testRequest = new Request('https://example.com/offline-content');
      const cachedResponse = new Response('Cached offline content', {
        headers: { 'x-cache': 'HIT' }
      });

      mockCache.match.mockResolvedValue(cachedResponse);

      // Simulate service worker cache-first strategy for offline
      const getCachedResponse = async (request: Request) => {
        const cached = await mockCache.match(request);

        if (cached) {
          return {
            response: cached,
            source: 'cache',
            offline: true
          };
        }

        // In real PWA, this would attempt network then fail in offline mode
        throw new Error('Network unavailable and no cached response');
      };

      const result = await getCachedResponse(testRequest);

      expect(result.source).toBe('cache');
      expect(result.offline).toBe(true);
      expect(result.response).toBe(cachedResponse);
      expect(result.response.headers.get('x-cache')).toBe('HIT');
    });
  });
});