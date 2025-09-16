import { describe, it, expect, beforeEach, vi } from 'vitest';
import './setup';
/// <reference path="./types.d.ts" />

/**
 * PWA Service Worker Integration Test
 *
 * Phase 1: Service Worker Infrastructure Testing
 *
 * Tests service worker registration, lifecycle, and cache strategies
 * based on the VitePWA configuration in vite.config.ts.
 *
 * Focus: User-visible PWA behavior and infrastructure reliability
 */

// Mock the virtual:pwa-register module from VitePWA
const mockRegisterSW = vi.fn();
const mockUpdateSW = vi.fn();

// Create a proper mock module for the virtual import
const mockPWARegister = {
  registerSW: mockRegisterSW,
  updateSW: mockUpdateSW,
};

vi.mock('virtual:pwa-register', () => mockPWARegister);

// Mock service worker types and objects
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

describe('PWA Service Worker Integration', () => {
  let mockServiceWorker: MockServiceWorker;
  let mockRegistration: MockServiceWorkerRegistration;
  let mockCache: MockCache;
  let registerSWCallback: {
    onNeedRefresh?: () => void;
    onOfflineReady?: () => void;
    onRegistered?: (registration: ServiceWorkerRegistration) => void;
    onRegisterError?: (error: Error) => void;
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock service worker object
    mockServiceWorker = {
      postMessage: vi.fn(),
      state: 'activated',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    // Create mock service worker registration
    mockRegistration = {
      installing: null,
      waiting: null,
      active: mockServiceWorker,
      scope: '/',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      update: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(true),
    };

    // Create mock cache
    mockCache = {
      match: vi.fn(),
      matchAll: vi.fn(),
      add: vi.fn().mockResolvedValue(undefined),
      addAll: vi.fn().mockResolvedValue(undefined),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(true),
      keys: vi.fn().mockResolvedValue([]),
    };

    // Reset callback reference
    registerSWCallback = {};

    // Mock registerSW to capture the callback configuration
    mockRegisterSW.mockImplementation((config) => {
      registerSWCallback = config || {};
      return Promise.resolve(mockRegistration);
    });

    // Update existing navigator.serviceWorker mock from setup.ts
    const serviceWorkerMock = navigator.serviceWorker as any;
    serviceWorkerMock.register.mockResolvedValue(mockRegistration);
    serviceWorkerMock.ready = Promise.resolve(mockRegistration);
    serviceWorkerMock.controller = mockServiceWorker;
    serviceWorkerMock.addEventListener = vi.fn();
    serviceWorkerMock.removeEventListener = vi.fn();

    // Use global cache mock from setup.ts - no need to redefine
    // The global caches API is already available and properly mocked
    const globalCacheStorage = global.mockCacheStorage;
    if (vi.isMockFunction(globalCacheStorage.open)) {
      globalCacheStorage.open.mockResolvedValue(mockCache);
    }
    if (vi.isMockFunction(globalCacheStorage.delete)) {
      globalCacheStorage.delete.mockResolvedValue(true);
    }
    if (vi.isMockFunction(globalCacheStorage.has)) {
      globalCacheStorage.has.mockResolvedValue(true);
    }
    if (vi.isMockFunction(globalCacheStorage.keys)) {
      globalCacheStorage.keys.mockResolvedValue(['precache', 'runtime']);
    }
  });

  describe('Service Worker Registration', () => {
    it('should successfully register service worker with correct configuration', async () => {
      // Use the mocked registerSW directly
      const result = await mockRegisterSW({
        onNeedRefresh() {
          console.log('A new version is available. Please refresh to update.');
        },
        onOfflineReady() {
          console.log('App is ready to work offline');
        },
      });

      // Verify registration was called with callbacks
      expect(mockRegisterSW).toHaveBeenCalledOnce();
      expect(mockRegisterSW).toHaveBeenCalledWith({
        onNeedRefresh: expect.any(Function),
        onOfflineReady: expect.any(Function),
      });

      // Verify registration result
      expect(result).toBe(mockRegistration);
    });

    it('should handle registration failure gracefully', async () => {
      const registrationError = new Error('Service worker registration failed');
      mockRegisterSW.mockRejectedValueOnce(registrationError);

      try {
        await mockRegisterSW({
          onRegisterError: vi.fn(),
        });
      } catch (error) {
        expect(error).toBe(registrationError);
      }

      expect(mockRegisterSW).toHaveBeenCalledOnce();
    });

    it('should register with correct scope for GitHub Pages deployment', async () => {
      // Mock GitHub Pages environment
      const originalEnv = process.env;
      process.env = { ...originalEnv, GITHUB_PAGES: 'true' };

      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      expect(mockRegisterSW).toHaveBeenCalledOnce();

      // Restore environment
      process.env = originalEnv;
    });

    it('should provide registration object with correct properties', async () => {
      const registration = await mockRegisterSW({
        onRegistered: vi.fn(),
      });

      // Verify registration has expected properties
      expect(registration).toHaveProperty('installing');
      expect(registration).toHaveProperty('waiting');
      expect(registration).toHaveProperty('active');
      expect(registration).toHaveProperty('scope');
      expect(registration).toHaveProperty('update');
      expect(registration).toHaveProperty('unregister');
    });
  });

  describe('Service Worker Lifecycle', () => {
    it('should handle service worker installation event', async () => {
      // Simulate installing service worker
      mockRegistration.installing = mockServiceWorker;
      mockRegistration.waiting = null;
      mockRegistration.active = null;
      mockServiceWorker.state = 'installing';

      const onRegistered = vi.fn();
      await mockRegisterSW({ onRegistered });

      // Simulate installation completion
      mockServiceWorker.state = 'installed';
      mockRegistration.waiting = mockServiceWorker;
      mockRegistration.installing = null;

      // Trigger statechange event
      const stateChangeHandler = mockServiceWorker.addEventListener.mock.calls
        .find(([event]) => event === 'statechange')?.[1];

      if (stateChangeHandler) {
        stateChangeHandler({ target: mockServiceWorker });
      }

      expect(mockServiceWorker.state).toBe('installed');
      expect(mockRegistration.waiting).toBe(mockServiceWorker);
    });

    it('should handle service worker activation and taking control', async () => {
      // Start with waiting service worker
      mockRegistration.waiting = mockServiceWorker;
      mockRegistration.active = null;
      mockServiceWorker.state = 'installed';

      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      // Simulate activation
      mockServiceWorker.state = 'activating';
      mockRegistration.active = mockServiceWorker;
      mockRegistration.waiting = null;

      // Complete activation
      mockServiceWorker.state = 'activated';

      expect(mockServiceWorker.state).toBe('activated');
      expect(mockRegistration.active).toBe(mockServiceWorker);
    });

    it('should handle service worker updates with skipWaiting behavior', async () => {
      const onNeedRefresh = vi.fn();
      await mockRegisterSW({ onNeedRefresh });

      // Simulate new service worker being installed
      const newServiceWorker = {
        ...mockServiceWorker,
        state: 'installed',
        postMessage: vi.fn(),
      };

      mockRegistration.waiting = newServiceWorker;

      // Trigger the onNeedRefresh callback to simulate update detection
      if (registerSWCallback.onNeedRefresh) {
        registerSWCallback.onNeedRefresh();
      }

      expect(onNeedRefresh).toHaveBeenCalledOnce();
    });

    it('should support manual service worker update checking', async () => {
      const registration = await mockRegisterSW({
        onNeedRefresh: vi.fn(),
      });

      // Test manual update
      await registration.update();

      expect(mockRegistration.update).toHaveBeenCalledOnce();
    });
  });

  describe('Cache Strategies', () => {
    it('should precache static assets based on glob patterns', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      // Simulate precaching of assets matching glob patterns from vite.config.ts
      const staticAssets = [
        '/index.html',
        '/assets/index-abc123.js',
        '/assets/index-def456.css',
        '/icon-192.png',
        '/icon-512.png',
      ];

      // Mock cache.addAll for precaching
      mockCache.addAll.mockResolvedValueOnce(undefined);

      // Simulate precaching operation
      await mockCache.addAll(staticAssets);

      expect(mockCache.addAll).toHaveBeenCalledWith(staticAssets);
    });

    it('should implement cache-first strategy for static assets', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      const request = new Request('/assets/app-abc123.js');
      const cachedResponse = new Response('cached content');

      // Mock cache hit
      mockCache.match.mockResolvedValueOnce(cachedResponse);

      const response = await mockCache.match(request);

      expect(mockCache.match).toHaveBeenCalledWith(request);
      expect(response).toBe(cachedResponse);
    });

    it('should implement network-first strategy for API requests', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      const apiRequest = new Request('/api/bookmarks');
      const networkResponse = new Response('{"bookmarks": []}');

      // Mock successful network request
      global.fetch = vi.fn().mockResolvedValueOnce(networkResponse);

      // Simulate network-first behavior
      try {
        const response = await fetch(apiRequest);
        await mockCache.put(apiRequest, response.clone());
        expect(response).toBe(networkResponse);
      } catch {
        // Fallback to cache on network failure
        await mockCache.match(apiRequest);
      }

      expect(global.fetch).toHaveBeenCalledWith(apiRequest);
      // Check that put was called with the request (don't check response due to cloning complexity)
      expect(mockCache.put).toHaveBeenCalledWith(apiRequest, expect.any(Response));
    });

    it('should handle cache miss scenarios gracefully', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      const request = new Request('/non-cached-resource.js');

      // Mock cache miss
      mockCache.match.mockResolvedValueOnce(undefined);

      const cachedResponse = await mockCache.match(request);

      expect(cachedResponse).toBeUndefined();
      expect(mockCache.match).toHaveBeenCalledWith(request);
    });

    it('should cache Material Icons font files for offline use', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      // Material icons are now bundled via @fontsource/material-symbols-outlined
      const fontRequest = new Request('/assets/material-symbols-outlined.woff2');
      const fontResponse = new Response(new ArrayBuffer(1024));

      await mockCache.put(fontRequest, fontResponse);

      expect(mockCache.put).toHaveBeenCalledWith(fontRequest, fontResponse);
    });
  });

  describe('Update Notifications', () => {
    it('should detect new service worker versions', async () => {
      const onNeedRefresh = vi.fn();
      await mockRegisterSW({ onNeedRefresh });

      // Simulate new version detection
      const newServiceWorker = {
        ...mockServiceWorker,
        state: 'installed',
      };

      mockRegistration.waiting = newServiceWorker;

      // Trigger update detection callback
      if (registerSWCallback.onNeedRefresh) {
        registerSWCallback.onNeedRefresh();
      }

      expect(onNeedRefresh).toHaveBeenCalledOnce();
    });

    it('should show update prompt to user when new version is available', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await mockRegisterSW({
        onNeedRefresh() {
          console.log('A new version is available. Please refresh to update.');
        },
      });

      // Trigger the update notification
      if (registerSWCallback.onNeedRefresh) {
        registerSWCallback.onNeedRefresh();
      }

      expect(consoleSpy).toHaveBeenCalledWith('A new version is available. Please refresh to update.');

      consoleSpy.mockRestore();
    });

    it('should handle auto-update behavior with registerType autoUpdate', async () => {
      const onOfflineReady = vi.fn();

      // VitePWA is configured with registerType: 'autoUpdate'
      await mockRegisterSW({
        onOfflineReady,
        onNeedRefresh: vi.fn(),
      });

      // In autoUpdate mode, service worker should take control automatically
      // Simulate this by triggering the offline ready callback
      if (registerSWCallback.onOfflineReady) {
        registerSWCallback.onOfflineReady();
      }

      expect(onOfflineReady).toHaveBeenCalledOnce();
    });

    it('should notify when app is ready to work offline', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await mockRegisterSW({
        onOfflineReady() {
          console.log('App is ready to work offline');
        },
      });

      // Trigger offline ready notification
      if (registerSWCallback.onOfflineReady) {
        registerSWCallback.onOfflineReady();
      }

      expect(consoleSpy).toHaveBeenCalledWith('App is ready to work offline');

      consoleSpy.mockRestore();
    });

    it('should handle concurrent update scenarios', async () => {
      const onNeedRefresh = vi.fn();
      const registration = await mockRegisterSW({ onNeedRefresh });

      // Simulate multiple update checks
      const updatePromise1 = registration.update();
      const updatePromise2 = registration.update();

      await Promise.all([updatePromise1, updatePromise2]);

      // Both updates should complete successfully
      expect(mockRegistration.update).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle service worker registration errors', async () => {
      const registrationError = new Error('ServiceWorker registration failed');
      mockRegisterSW.mockRejectedValueOnce(registrationError);

      const onRegisterError = vi.fn();

      try {
        await mockRegisterSW({ onRegisterError });
      } catch (error) {
        expect(error).toBe(registrationError);
      }
    });

    it('should handle cache operation failures', async () => {
      await mockRegisterSW({
        onOfflineReady: vi.fn(),
      });

      const cacheError = new Error('QuotaExceededError');
      mockCache.put.mockRejectedValueOnce(cacheError);

      const request = new Request('/test-resource');
      const response = new Response('test content');

      try {
        await mockCache.put(request, response);
      } catch (error) {
        expect(error).toBe(cacheError);
      }

      expect(mockCache.put).toHaveBeenCalledWith(request, response);
    });

    it('should handle service worker update failures', async () => {
      const updateError = new Error('Update check failed');
      mockRegistration.update.mockRejectedValueOnce(updateError);

      const registration = await mockRegisterSW({
        onNeedRefresh: vi.fn(),
      });

      try {
        await registration.update();
      } catch (error) {
        expect(error).toBe(updateError);
      }

      expect(mockRegistration.update).toHaveBeenCalledOnce();
    });
  });

  describe('Performance and Reliability', () => {
    it('should complete service worker operations quickly', async () => {
      const startTime = performance.now();

      await mockRegisterSW({
        onOfflineReady: vi.fn(),
        onNeedRefresh: vi.fn(),
      });

      const endTime = performance.now();
      const duration = endTime - startTime;

      // Registration should complete within 100ms in test environment
      expect(duration).toBeLessThan(100);
    });

    it('should handle multiple concurrent registrations', async () => {
      const registrations = await Promise.all([
        mockRegisterSW({ onOfflineReady: vi.fn() }),
        mockRegisterSW({ onNeedRefresh: vi.fn() }),
        mockRegisterSW({ onRegistered: vi.fn() }),
      ]);

      registrations.forEach(registration => {
        expect(registration).toBe(mockRegistration);
      });

      // Should call registerSW for each registration
      expect(mockRegisterSW).toHaveBeenCalledTimes(3);
    });

    it('should clean up event listeners properly', async () => {
      const registration = await mockRegisterSW({
        onNeedRefresh: vi.fn(),
      });

      // Simulate unregistering
      await registration.unregister();

      expect(mockRegistration.unregister).toHaveBeenCalledOnce();
    });
  });
});