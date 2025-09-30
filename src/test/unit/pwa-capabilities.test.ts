import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  detectCapabilities,
  hasWebLocks,
  hasBackgroundSync,
  hasPeriodicBackgroundSync,
  hasServiceWorker,
  type PWACapabilities
} from '../../utils/pwa-capabilities';

describe('PWA Capabilities Detection', () => {
  let originalNavigator: Navigator;
  let originalServiceWorkerRegistration: typeof ServiceWorkerRegistration;

  beforeEach(() => {
    // Store original globals
    originalNavigator = global.navigator;
    originalServiceWorkerRegistration = global.ServiceWorkerRegistration;

    // Mock navigator object with mutable properties
    global.navigator = {} as any;

    // Mock ServiceWorkerRegistration prototype
    global.ServiceWorkerRegistration = {} as any;
  });

  afterEach(() => {
    // Restore original globals
    global.navigator = originalNavigator;
    global.ServiceWorkerRegistration = originalServiceWorkerRegistration;
  });

  describe('hasWebLocks', () => {
    it('should return true when Web Locks API is available', () => {
      (global.navigator as any).locks = {
        request: vi.fn()
      };

      expect(hasWebLocks()).toBe(true);
    });

    it('should return false when Web Locks API is not available', () => {
      (global.navigator as any).locks = undefined;

      expect(hasWebLocks()).toBe(false);
    });

    it('should return false when locks exists but request method is missing', () => {
      (global.navigator as any).locks = {};

      expect(hasWebLocks()).toBe(false);
    });

    it('should return false when locks.request is not a function', () => {
      (global.navigator as any).locks = {
        request: 'not-a-function'
      };

      expect(hasWebLocks()).toBe(false);
    });
  });

  describe('hasServiceWorker', () => {
    it('should return true when Service Worker API is available', () => {
      (global.navigator as any).serviceWorker = {};

      expect(hasServiceWorker()).toBe(true);
    });

    it('should return false when Service Worker API is not available', () => {
      (global.navigator as any).serviceWorker = undefined;

      expect(hasServiceWorker()).toBe(false);
    });

    it('should return false when serviceWorker property does not exist', () => {
      // Don't set serviceWorker property at all
      expect(hasServiceWorker()).toBe(false);
    });

    it('should return false when serviceWorker is null', () => {
      (global.navigator as any).serviceWorker = null;

      expect(hasServiceWorker()).toBe(false);
    });
  });

  describe('hasBackgroundSync', () => {
    it('should return true when Background Sync API is available', () => {
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {
        sync: {}
      } as any;

      expect(hasBackgroundSync()).toBe(true);
    });

    it('should return false when Service Worker is not available', () => {
      (global.navigator as any).serviceWorker = undefined;
      global.ServiceWorkerRegistration.prototype = {
        sync: {}
      } as any;

      expect(hasBackgroundSync()).toBe(false);
    });

    it('should return false when sync property is missing from ServiceWorkerRegistration', () => {
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {} as any;

      expect(hasBackgroundSync()).toBe(false);
    });

    it('should return false when both Service Worker and sync are missing', () => {
      (global.navigator as any).serviceWorker = undefined;
      global.ServiceWorkerRegistration.prototype = {} as any;

      expect(hasBackgroundSync()).toBe(false);
    });
  });

  describe('hasPeriodicBackgroundSync', () => {
    it('should return true when Periodic Background Sync API is available', () => {
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {
        periodicSync: {}
      } as any;

      expect(hasPeriodicBackgroundSync()).toBe(true);
    });

    it('should return false when Service Worker is not available', () => {
      (global.navigator as any).serviceWorker = undefined;
      global.ServiceWorkerRegistration.prototype = {
        periodicSync: {}
      } as any;

      expect(hasPeriodicBackgroundSync()).toBe(false);
    });

    it('should return false when periodicSync property is missing from ServiceWorkerRegistration', () => {
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {} as any;

      expect(hasPeriodicBackgroundSync()).toBe(false);
    });

    it('should return false when both Service Worker and periodicSync are missing', () => {
      (global.navigator as any).serviceWorker = undefined;
      global.ServiceWorkerRegistration.prototype = {} as any;

      expect(hasPeriodicBackgroundSync()).toBe(false);
    });
  });

  describe('detectCapabilities', () => {
    it('should return all capabilities as true when all APIs are available', () => {
      // Set up all APIs as available
      (global.navigator as any).locks = {
        request: vi.fn()
      };
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {
        sync: {},
        periodicSync: {}
      } as any;

      const capabilities = detectCapabilities();

      expect(capabilities).toEqual({
        webLocks: true,
        backgroundSync: true,
        periodicBackgroundSync: true,
        serviceWorker: true
      } as PWACapabilities);
    });

    it('should return all capabilities as false when no APIs are available', () => {
      // Don't set up any APIs
      const capabilities = detectCapabilities();

      expect(capabilities).toEqual({
        webLocks: false,
        backgroundSync: false,
        periodicBackgroundSync: false,
        serviceWorker: false
      } as PWACapabilities);
    });

    it('should return mixed capabilities based on API availability', () => {
      // Set up only some APIs
      (global.navigator as any).locks = {
        request: vi.fn()
      };
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {
        sync: {}
        // periodicSync is missing
      } as any;

      const capabilities = detectCapabilities();

      expect(capabilities).toEqual({
        webLocks: true,
        backgroundSync: true,
        periodicBackgroundSync: false,
        serviceWorker: true
      } as PWACapabilities);
    });

    it('should detect Service Worker independently from sync APIs', () => {
      // Service Worker available but sync APIs not available
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {} as any;

      const capabilities = detectCapabilities();

      expect(capabilities).toEqual({
        webLocks: false,
        backgroundSync: false,
        periodicBackgroundSync: false,
        serviceWorker: true
      } as PWACapabilities);
    });

    it('should be consistent with individual detection functions', () => {
      // Set up a mixed scenario
      (global.navigator as any).locks = {
        request: vi.fn()
      };
      (global.navigator as any).serviceWorker = {};
      global.ServiceWorkerRegistration.prototype = {
        periodicSync: {}
        // sync is missing
      } as any;

      const capabilities = detectCapabilities();

      // Verify that detectCapabilities matches individual function results
      expect(capabilities.webLocks).toBe(hasWebLocks());
      expect(capabilities.backgroundSync).toBe(hasBackgroundSync());
      expect(capabilities.periodicBackgroundSync).toBe(hasPeriodicBackgroundSync());
      expect(capabilities.serviceWorker).toBe(hasServiceWorker());
    });
  });
});