/**
 * PWA Capabilities Detection Utility
 *
 * Provides feature detection for Progressive Web App APIs to enable graceful
 * degradation when certain APIs are not available in the browser.
 *
 * This utility focuses on core PWA coordination APIs:
 * - Web Locks API: For multi-tab sync coordination
 * - Background Sync API: For sync when network is restored
 * - Periodic Background Sync API: For scheduled background syncs
 * - Service Worker API: For background processing support
 */

/**
 * Interface representing the availability of PWA APIs in the current browser
 */
export interface PWACapabilities {
  /** Web Locks API support - used for multi-tab coordination */
  webLocks: boolean;
  /** Background Sync API support - used for network restoration sync */
  backgroundSync: boolean;
  /** Periodic Background Sync API support - used for scheduled background syncs */
  periodicBackgroundSync: boolean;
  /** Service Worker API support - foundation for background processing */
  serviceWorker: boolean;
}

/**
 * Detects if the Web Locks API is available in the current browser.
 *
 * The Web Locks API enables coordination between multiple tabs/workers by
 * providing exclusive resource locking. This is critical for preventing
 * multiple simultaneous sync operations.
 *
 * @returns {boolean} True if Web Locks API is supported
 */
export function hasWebLocks(): boolean {
  return 'locks' in navigator && typeof navigator.locks?.request === 'function';
}

/**
 * Detects if the Background Sync API is available in the current browser.
 *
 * Background Sync allows deferring actions until the user has stable network
 * connectivity. When unavailable, apps can fall back to online/offline event
 * listeners with manual retry queues.
 *
 * @returns {boolean} True if Background Sync API is supported
 */
export function hasBackgroundSync(): boolean {
  return (
    'serviceWorker' in navigator &&
    !!navigator.serviceWorker &&
    typeof window !== 'undefined' &&
    'ServiceWorkerRegistration' in window &&
    !!window.ServiceWorkerRegistration &&
    'sync' in window.ServiceWorkerRegistration.prototype
  );
}

/**
 * Detects if the Periodic Background Sync API is available in the current browser.
 *
 * Periodic Background Sync enables apps to run background sync operations at
 * periodic intervals. When unavailable, apps can use timer-based sync when visible.
 *
 * Note: This API has limited browser support and may require user permission.
 *
 * @returns {boolean} True if Periodic Background Sync API is supported
 */
export function hasPeriodicBackgroundSync(): boolean {
  return (
    'serviceWorker' in navigator &&
    !!navigator.serviceWorker &&
    typeof window !== 'undefined' &&
    'ServiceWorkerRegistration' in window &&
    !!window.ServiceWorkerRegistration &&
    'periodicSync' in window.ServiceWorkerRegistration.prototype
  );
}

/**
 * Detects if Service Worker API is available in the current browser.
 *
 * Service Workers are the foundation for background processing, offline
 * capabilities, and push notifications in PWAs. Without Service Worker
 * support, many background features will be unavailable.
 *
 * @returns {boolean} True if Service Worker API is supported
 */
export function hasServiceWorker(): boolean {
  return 'serviceWorker' in navigator && !!navigator.serviceWorker;
}

/**
 * Detects all PWA API capabilities in the current browser environment.
 *
 * This function performs feature detection for all PWA coordination APIs
 * that Pocket Ding uses for background sync and multi-tab coordination.
 * Components can use this information to gracefully degrade functionality
 * when certain APIs are unavailable.
 *
 * @returns {PWACapabilities} Object containing support flags for each API
 *
 * @example
 * ```typescript
 * const capabilities = detectCapabilities();
 * if (capabilities.webLocks) {
 *   // Use Web Locks for multi-tab coordination
 *   await navigator.locks.request('sync-lock', doSync);
 * } else {
 *   // Fall back to alternative coordination method
 *   console.warn('Web Locks API not available - multi-tab sync coordination limited');
 * }
 * ```
 */
export function detectCapabilities(): PWACapabilities {
  return {
    webLocks: hasWebLocks(),
    backgroundSync: hasBackgroundSync(),
    periodicBackgroundSync: hasPeriodicBackgroundSync(),
    serviceWorker: hasServiceWorker()
  };
}