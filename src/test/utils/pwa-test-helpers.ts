import { vi } from 'vitest';
/// <reference path="../types.d.ts" />

/**
 * PWA Test Helper Utilities
 *
 * Provides utilities for testing PWA functionality including service workers,
 * cache management, and storage quota scenarios. These helpers integrate with
 * the global PWA mocks set up in test/setup.ts.
 *
 * Focus: Simplify PWA testing scenarios while supporting user-behavior testing
 */

// Type definitions for mock objects
interface MockServiceWorker {
  postMessage: ReturnType<typeof vi.fn>;
  state: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

interface MockServiceWorkerRegistration {
  installing: MockServiceWorker | null;
  waiting: MockServiceWorker | null;
  active: MockServiceWorker | null;
  scope: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
}

interface MockCache {
  match: ReturnType<typeof vi.fn>;
  matchAll: ReturnType<typeof vi.fn>;
  add: ReturnType<typeof vi.fn>;
  addAll: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
}

interface MockCacheStorage {
  open: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
  has: ReturnType<typeof vi.fn>;
  keys: ReturnType<typeof vi.fn>;
  match: ReturnType<typeof vi.fn>;
}

interface MockStorageManager {
  estimate: ReturnType<typeof vi.fn>;
  persist: ReturnType<typeof vi.fn>;
  persisted: ReturnType<typeof vi.fn>;
  getDirectory: ReturnType<typeof vi.fn>;
}

/**
 * Service Worker Helper Functions
 * Utilities for managing service worker test scenarios
 */

/**
 * Create a mock service worker registration with customizable properties
 *
 * @param options - Configuration options for the mock registration
 * @returns Configured mock service worker registration
 */
export function mockServiceWorkerRegistration(options: {
  scope?: string;
  installing?: MockServiceWorker | null;
  waiting?: MockServiceWorker | null;
  active?: MockServiceWorker | null;
} = {}): MockServiceWorkerRegistration {
  const registration = global.mockServiceWorkerRegistration as MockServiceWorkerRegistration;

  if (options.scope) {
    registration.scope = options.scope;
  }

  registration.installing = options.installing ?? null;
  registration.waiting = options.waiting ?? null;
  registration.active = options.active ?? null;

  return registration;
}

/**
 * Simulate a service worker update scenario
 * Sets up the mock registration to simulate an update being available
 */
export function triggerServiceWorkerUpdate(): void {
  const registration = global.mockServiceWorkerRegistration as MockServiceWorkerRegistration;

  // Create a new service worker in waiting state
  const newServiceWorker: MockServiceWorker = {
    postMessage: vi.fn(),
    state: 'installed',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  registration.waiting = newServiceWorker;

  // Simulate the updatefound event
  const updateFoundEvent = new Event('updatefound');
  if (registration.addEventListener.mock) {
    // Find all updatefound listeners and call them
    const calls = registration.addEventListener.mock.calls as Array<[string, Function]>;
    const updateFoundListeners = calls
      .filter(([eventType]) => eventType === 'updatefound')
      .map(([, listener]) => listener);

    updateFoundListeners.forEach(listener => {
      try {
        listener(updateFoundEvent);
      } catch (error) {
        // Ignore listener errors in test scenarios
      }
    });
  }
}

/**
 * Simulate service worker install event
 * Creates a mock service worker and triggers install lifecycle
 */
export function simulateInstallEvent(): void {
  const registration = global.mockServiceWorkerRegistration as MockServiceWorkerRegistration;

  // Create a new service worker in installing state
  const installingServiceWorker: MockServiceWorker = {
    postMessage: vi.fn(),
    state: 'installing',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };

  registration.installing = installingServiceWorker;

  // Simulate state change to installed
  setTimeout(() => {
    installingServiceWorker.state = 'installed';
    registration.waiting = installingServiceWorker;
    registration.installing = null;
  }, 0);
}

/**
 * Cache Helper Functions
 * Utilities for testing cache scenarios
 */

/**
 * Populate cache with mock entries for testing
 *
 * @param cacheName - Name of the cache to populate
 * @param entries - Map of request URLs to response data
 */
export async function populateCache(cacheName: string, entries: Record<string, any>): Promise<void> {
  const cache = global.mockCache as MockCache;
  const cacheStorage = global.mockCacheStorage as MockCacheStorage;

  // Set up cache.match to return mocked responses
  cache.match.mockImplementation((request: Request | string) => {
    const url = typeof request === 'string' ? request : request.url;
    const entry = entries[url];

    if (entry) {
      return Promise.resolve(new Response(JSON.stringify(entry), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }

    return Promise.resolve(undefined);
  });

  // Set up cache.keys to return mocked request objects
  cache.keys.mockResolvedValue(
    Object.keys(entries).map(url => new Request(url))
  );

  // Ensure cacheStorage.open returns this configured cache
  cacheStorage.open.mockImplementation((name: string) => {
    if (name === cacheName) {
      return Promise.resolve(cache);
    }
    return Promise.resolve(cache); // Default to the same cache for simplicity
  });
}

/**
 * Clear all cache entries and reset cache mocks
 *
 * @param cacheName - Optional cache name to clear (clears all if not specified)
 */
export async function clearCache(cacheName?: string): Promise<void> {
  const cache = global.mockCache as MockCache;
  const cacheStorage = global.mockCacheStorage as MockCacheStorage;

  // Reset all cache methods to default empty responses
  cache.match.mockResolvedValue(undefined);
  cache.matchAll.mockResolvedValue([]);
  cache.keys.mockResolvedValue([]);

  if (cacheName) {
    // Simulate cache deletion
    cacheStorage.delete.mockImplementation((name: string) => {
      return Promise.resolve(name === cacheName);
    });

    // Update cache list to exclude deleted cache
    cacheStorage.keys.mockImplementation(() => {
      return Promise.resolve(['v1', 'runtime'].filter(name => name !== cacheName));
    });
  } else {
    // Clear all caches
    cacheStorage.keys.mockResolvedValue([]);
  }
}

/**
 * Simulate cache operation errors for testing error handling
 *
 * @param operation - The cache operation that should fail
 * @param error - The error to throw (defaults to QuotaExceededError)
 */
export function simulateCacheError(
  operation: 'match' | 'put' | 'add' | 'addAll' | 'delete' | 'keys' = 'put',
  error: Error = new DOMException('Storage quota exceeded', 'QuotaExceededError')
): void {
  const cache = global.mockCache as MockCache;

  switch (operation) {
    case 'match':
      cache.match.mockRejectedValue(error);
      break;
    case 'put':
      cache.put.mockRejectedValue(error);
      break;
    case 'add':
      cache.add.mockRejectedValue(error);
      break;
    case 'addAll':
      cache.addAll.mockRejectedValue(error);
      break;
    case 'delete':
      cache.delete.mockRejectedValue(error);
      break;
    case 'keys':
      cache.keys.mockRejectedValue(error);
      break;
    default:
      cache.put.mockRejectedValue(error);
  }
}

/**
 * Storage Helper Functions
 * Utilities for testing storage quota scenarios
 */

/**
 * Set mock storage quota values for testing
 *
 * @param options - Storage quota configuration
 */
export function setStorageQuota(options: {
  usage?: number;
  quota?: number;
  usageDetails?: {
    caches?: number;
    indexedDB?: number;
    serviceWorkerRegistrations?: number;
  };
}): void {
  const storage = global.mockStorageManager as MockStorageManager;

  const currentEstimate = {
    usage: 10 * 1024 * 1024, // 10MB default
    quota: 100 * 1024 * 1024, // 100MB default
    usageDetails: {
      caches: 5 * 1024 * 1024,
      indexedDB: 3 * 1024 * 1024,
      serviceWorkerRegistrations: 1024,
    },
  };

  const newEstimate = {
    usage: options.usage ?? currentEstimate.usage,
    quota: options.quota ?? currentEstimate.quota,
    usageDetails: {
      ...currentEstimate.usageDetails,
      ...options.usageDetails,
    },
  };

  storage.estimate.mockResolvedValue(newEstimate);
}

/**
 * Simulate storage quota exceeded scenario
 * Sets up storage to appear full and cache operations to fail
 */
export function simulateStorageFullError(): void {
  // Set quota to be nearly full
  setStorageQuota({
    usage: 95 * 1024 * 1024, // 95MB used
    quota: 100 * 1024 * 1024, // 100MB total
    usageDetails: {
      caches: 80 * 1024 * 1024, // Most space used by cache
      indexedDB: 14 * 1024 * 1024,
      serviceWorkerRegistrations: 1 * 1024 * 1024,
    },
  });

  // Make cache operations fail with quota exceeded
  simulateCacheError('put', new DOMException('Storage quota exceeded', 'QuotaExceededError'));
  simulateCacheError('add', new DOMException('Storage quota exceeded', 'QuotaExceededError'));
  simulateCacheError('addAll', new DOMException('Storage quota exceeded', 'QuotaExceededError'));
}

/**
 * Get current mock storage usage information
 *
 * @returns Promise resolving to storage estimate
 */
export async function getStorageUsage(): Promise<StorageEstimate> {
  const storage = global.mockStorageManager as MockStorageManager;
  return storage.estimate();
}

/**
 * Reset all PWA test helpers to default state
 * Useful for ensuring clean state between test files
 */
export function resetPWATestState(): void {
  // Reset service worker registration
  const registration = global.mockServiceWorkerRegistration as MockServiceWorkerRegistration;
  registration.installing = null;
  registration.waiting = null;
  registration.active = null;
  registration.scope = '/';

  // Reset cache storage
  clearCache();

  // Reset storage quota to defaults
  setStorageQuota({
    usage: 10 * 1024 * 1024,
    quota: 100 * 1024 * 1024,
    usageDetails: {
      caches: 5 * 1024 * 1024,
      indexedDB: 3 * 1024 * 1024,
      serviceWorkerRegistrations: 1024,
    },
  });

  // Reset storage manager methods
  const storage = global.mockStorageManager as MockStorageManager;
  storage.persist.mockResolvedValue(true);
  storage.persisted.mockResolvedValue(false);
}

/**
 * Main export object with all PWA test helper functions
 * Provides convenient access to all PWA testing utilities
 */
export const PWATestHelpers = {
  // Service Worker helpers
  mockServiceWorkerRegistration,
  triggerServiceWorkerUpdate,
  simulateInstallEvent,

  // Cache helpers
  populateCache,
  clearCache,
  simulateCacheError,

  // Storage helpers
  setStorageQuota,
  simulateStorageFullError,
  getStorageUsage,

  // Utility helpers
  resetPWATestState,
};

export default PWATestHelpers;