/// <reference lib="webworker" />
/// <reference path="../types/service-worker.d.ts" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { SyncMessages, type SyncMessage } from '../types/sync-messages';
import { DatabaseService } from '../services/database';
import { SyncService } from './sync-service';
import type { AppSettings, SyncPhase } from '../types';
import { logInfo, logError } from './sw-logger';

declare const self: ServiceWorkerGlobalScope;

// Workbox precaching
logInfo('serviceWorker', 'Starting Workbox precaching...');
precacheAndRoute(self.__WB_MANIFEST);
logInfo('serviceWorker', 'Workbox precaching configured');

logInfo('serviceWorker', 'Cleaning up outdated caches...');
cleanupOutdatedCaches();

// Handle navigation requests with network first strategy
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'navigations',
      networkTimeoutSeconds: 3
    })
  )
);

// Cache Google Fonts with cache-first strategy
registerRoute(
  ({ url }) => url.origin === 'https://fonts.googleapis.com',
  new CacheFirst({
    cacheName: 'google-fonts-cache',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 10,
        maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
      }) as any,
    ],
  })
);

// Force network-first for main app JavaScript files to ensure updates
registerRoute(
  ({ url }) => /\/main-[a-zA-Z0-9_-]+\.js$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'app-js-cache',
    networkTimeoutSeconds: 3,
  })
);

// Sync state management (for background sync only)
let syncInProgress = false;
let currentSyncProgress: { current: number; total: number; phase: SyncPhase } | null = null;
let currentSyncService: SyncService | null = null;

/**
 * Consolidated keepalive manager for service worker lifecycle
 */
class KeepaliveManager {
  #intervals: Set<number> = new Set();
  #port: MessagePort | null = null;
  #isActive = false;

  /**
   * Start keepalive mechanism to prevent service worker termination
   */
  start(): void {
    if (this.#isActive) {
      logInfo('serviceWorker', 'Keepalive already active');
      return;
    }

    logInfo('serviceWorker', 'Starting keepalive mechanism during sync');
    this.#isActive = true;

    // Strategy 1: Periodic heartbeat logging
    const heartbeatId = setInterval(() => {
      logInfo('serviceWorker', 'Keepalive heartbeat');
    }, 10000) as unknown as number; // 10 second heartbeat
    this.#intervals.add(heartbeatId);

    // Strategy 2: Message channel to keep SW active
    const channel = new MessageChannel();
    this.#port = channel.port1;

    const channelId = setInterval(() => {
      if (this.#port) {
        this.#port.postMessage({ type: 'keepalive' });
      }
    }, 15000) as unknown as number; // 15 second channel keepalive
    this.#intervals.add(channelId);
  }

  /**
   * Stop keepalive mechanism and clean up all resources
   */
  stop(): void {
    if (!this.#isActive) {
      return;
    }

    logInfo('serviceWorker', 'Stopping keepalive mechanism');

    // Clear all intervals
    this.#intervals.forEach(id => clearInterval(id));
    this.#intervals.clear();

    // Close message port
    if (this.#port) {
      this.#port.close();
      this.#port = null;
    }

    this.#isActive = false;
    logInfo('serviceWorker', 'Keepalive mechanism stopped');
  }

  /**
   * Check if keepalive is currently active
   */
  get isActive(): boolean {
    return this.#isActive;
  }

  /**
   * Get the number of active intervals (for testing)
   */
  get activeIntervalCount(): number {
    return this.#intervals.size;
  }
}

// Global keepalive manager instance
const keepaliveManager = new KeepaliveManager();

// Track service worker lifecycle for debugging sync issues
logInfo('serviceWorker', 'Service worker script loaded/reloaded');

// Force service worker update by changing content on each build
const SW_BUILD_VERSION = __APP_VERSION__.buildTimestamp;
logInfo('serviceWorker', `Service worker build version: ${SW_BUILD_VERSION}`);

logInfo('serviceWorker', 'Full version info:', __APP_VERSION__);

// Listen for service worker lifecycle events
self.addEventListener('install', () => {
  logInfo('serviceWorker', `Installing new service worker version: ${SW_BUILD_VERSION}`);
  logInfo('serviceWorker', 'Install event triggered - new service worker installing');

  // Skip waiting to activate immediately
  logInfo('serviceWorker', 'Calling skipWaiting() for immediate activation');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  logInfo('serviceWorker', `Activating service worker version: ${SW_BUILD_VERSION}`);

  // Take control of all clients immediately
  event.waitUntil(
    (async () => {
      logInfo('serviceWorker', 'Claiming all clients...');
      await self.clients.claim();

      // Log all controlled clients
      const clients = await self.clients.matchAll({ type: 'window' });
      logInfo('serviceWorker', `Now controlling ${clients.length} client(s)`);

      // Note: Periodic sync registration is now handled by SyncController
      // based on page visibility to prevent service worker blocking when app is visible

      // Notify clients about the new version
      clients.forEach(client => {
        client.postMessage({
          type: 'SW_ACTIVATED',
          version: __APP_VERSION__,
          timestamp: Date.now()
        });
      });

      logInfo('serviceWorker', 'Service worker activation complete');
    })()
  );
});

// Service worker will automatically handle fetch events via Workbox


// Retry configuration
const SYNC_RETRY_DELAYS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1m, 5m

/**
 * Perform background sync directly in the service worker
 */
async function performBackgroundSync(settings: AppSettings, fullSync = false): Promise<void> {
  logInfo('backgroundSync', 'Starting direct sync in service worker');

  try {
    // Create sync service with progress callback
    currentSyncService = new SyncService((progress) => {
      currentSyncProgress = progress;
      // Broadcast progress to clients
      broadcastToClients(SyncMessages.syncProgress(
        progress.current,
        progress.total,
        progress.phase
      ));
    });

    logInfo('backgroundSync', 'Starting sync operation', {
      fullSync,
      linkdingUrl: settings.linkding_url
    });

    const result = await currentSyncService.performSync(settings);

    if (result.success) {
      syncInProgress = false;
      currentSyncProgress = null;
      keepaliveManager.stop();

      await DatabaseService.resetSyncRetryCount();
      await DatabaseService.setLastSyncError(null);

      await broadcastToClients(SyncMessages.syncComplete(
        true,
        result.processed,
        Date.now() - result.timestamp
      ));
      await broadcastToClients(SyncMessages.syncStatus('completed'));

      logInfo('backgroundSync', 'Sync completed successfully', {
        processed: result.processed,
        duration: Date.now() - result.timestamp
      });
    } else {
      throw new Error(result.error?.message || 'Unknown sync error');
    }
  } catch (error) {
    logError('backgroundSync', 'Sync operation failed', error);

    syncInProgress = false;
    currentSyncProgress = null;
    keepaliveManager.stop();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') ||
                           errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');

    // Save error to database
    await DatabaseService.setLastSyncError(errorMessage);

    await broadcastToClients(SyncMessages.syncError(errorMessage, isNetworkError));
    await broadcastToClients(SyncMessages.syncStatus('failed'));

    // Schedule retry for recoverable errors
    if (isNetworkError) {
      const retryCount = await DatabaseService.getSyncRetryCount();
      if (retryCount < SYNC_RETRY_DELAYS.length) {
        const delay = SYNC_RETRY_DELAYS[retryCount];
        await DatabaseService.incrementSyncRetryCount();
        logInfo('scheduleRetry', `Scheduling sync retry in ${delay}ms (attempt ${retryCount + 1})`);
        setTimeout(() => {
          (self.registration as any).sync?.register('sync-bookmarks');
        }, delay);
      }
    }

    throw error; // Re-throw to be handled by caller
  } finally {
    // Always clean up state
    currentSyncService = null;
  }
}


/**
 * Broadcast message to all clients
 */
async function broadcastToClients(message: SyncMessage): Promise<void> {
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(client => {
    client.postMessage(message);
  });
}

/**
 * Get app settings from IndexedDB
 */
async function getSettings(): Promise<AppSettings | null> {
  try {
    return await DatabaseService.getSettings() ?? null;
  } catch (error) {
    logError('getSettings', 'Failed to get settings', error);
    return null;
  }
}

/**
 * Perform sync operation directly in service worker
 */
async function performSync(fullSync = false): Promise<void> {
  if (syncInProgress) {
    logInfo('performSync', 'Sync already in progress');
    return;
  }

  syncInProgress = true;

  try {
    await broadcastToClients(SyncMessages.syncStatus('starting'));

    const settings = await getSettings();
    if (!settings?.linkding_url || !settings?.linkding_token) {
      throw new Error('Linkding settings not configured');
    }

    if (fullSync) {
      // Clear sync timestamp for full sync (also resets pagination offsets)
      await DatabaseService.setLastSyncTimestamp('0');
      await DatabaseService.resetSyncRetryCount();
    }

    // Start keepalive to prevent service worker termination during sync
    keepaliveManager.start();

    await broadcastToClients(SyncMessages.syncStatus('syncing'));

    logInfo('performSync', 'Starting direct sync operation');

    // Perform sync directly in service worker
    await performBackgroundSync(settings, fullSync);

  } catch (error) {
    logError('performSync', 'Failed to perform sync', error);

    syncInProgress = false;
    keepaliveManager.stop();

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    await DatabaseService.setLastSyncError(errorMessage);
    await broadcastToClients(SyncMessages.syncError(errorMessage, false));
    await broadcastToClients(SyncMessages.syncStatus('failed'));
  }
}

/**
 * Handle messages from clients
 */
self.addEventListener('message', async (event) => {
  const message = event.data as SyncMessage;

  // Handle version requests
  if (message.type === 'REQUEST_VERSION') {
    const port = event.ports[0];
    if (port) {
      port.postMessage({
        type: 'VERSION_INFO',
        version: __APP_VERSION__
      });
    }
    return;
  }
  
  switch (message.type) {
    case 'REQUEST_SYNC':
      if (message.immediate) {
        // For immediate sync, try to perform directly and prevent SW termination
        const syncPromise = performSync(message.fullSync);

        // Use waitUntil to prevent service worker termination
        if ('waitUntil' in event && typeof (event as any).waitUntil === 'function') {
          (event as any).waitUntil(syncPromise);
          logInfo('serviceWorker', 'Using waitUntil to prevent SW termination during sync');
        }

        await syncPromise;
      } else {
        // For background sync, register sync event
        await (self.registration as any).sync?.register('sync-bookmarks');
      }
      break;
      
    case 'CANCEL_SYNC':
      if (currentSyncService && syncInProgress) {
        logInfo('sync', `Received CANCEL_SYNC message: ${message.reason}`);

        currentSyncService.cancelSync();

        syncInProgress = false;
        currentSyncProgress = null;
        keepaliveManager.stop();

        await broadcastToClients(SyncMessages.syncStatus('cancelled'));
      } else {
        logInfo('sync', 'Received CANCEL_SYNC but no sync is currently active');
      }
      break;
      
    case 'REGISTER_PERIODIC_SYNC':
      if ('periodicSync' in self.registration) {
        try {
          if (message.enabled) {
            // Register periodic sync (browser will decide actual frequency)
            await (self.registration as any).periodicSync.register('periodic-sync');
            logInfo('periodicSync', 'Periodic sync registered');
          } else {
            // Unregister periodic sync
            await (self.registration as any).periodicSync.unregister('periodic-sync');
            logInfo('periodicSync', 'Periodic sync unregistered');
          }
        } catch (error) {
          logError('periodicSync', 'Failed to register periodic sync', error);
          await broadcastToClients(SyncMessages.syncError(
            'Periodic sync not available or permission denied',
            false
          ));
        }
      } else {
        await broadcastToClients(SyncMessages.syncError(
          'Periodic sync not supported in this browser',
          false
        ));
      }
      break;
      
    case 'CHECK_SYNC_PERMISSION':
      // Report current sync status first
      if (syncInProgress) {
        await broadcastToClients(SyncMessages.syncStatus('syncing'));
        // Also report current progress if available
        if (currentSyncProgress) {
          await broadcastToClients(SyncMessages.syncProgress(
            currentSyncProgress.current,
            currentSyncProgress.total,
            currentSyncProgress.phase
          ));
        }
      } else {
        // Check if there are bookmarks that still need syncing (interrupted sync recovery)
        try {
          const { DatabaseService } = await import('../services/database');
          const bookmarksNeedingAssetSync = await DatabaseService.getBookmarksNeedingAssetSync();
          const bookmarksNeedingReadSync = await DatabaseService.getBookmarksNeedingReadSync();

          if (bookmarksNeedingAssetSync.length > 0 || bookmarksNeedingReadSync.length > 0) {
            logInfo('sync', `Detected interrupted sync: ${bookmarksNeedingAssetSync.length} bookmarks need asset sync, ${bookmarksNeedingReadSync.length} need read sync`);
            // Don't auto-resume here, let the UI decide
            await broadcastToClients(SyncMessages.syncStatus('interrupted'));
          }
        } catch (error) {
          logError('sync', 'Failed to check for interrupted sync', error);
        }
        // Check if periodic sync is available and permitted
        if ('periodicSync' in self.registration && 'permissions' in self) {
          try {
            const permission = await (self as any).permissions.query({ name: 'periodic-background-sync' });
            await broadcastToClients({
              type: 'SYNC_STATUS',
              status: permission.state === 'granted' ? 'idle' : 'failed',
              timestamp: Date.now()
            });
          } catch {
            // Permission API not available for periodic-background-sync
            await broadcastToClients(SyncMessages.syncStatus('idle'));
          }
        } else {
          await broadcastToClients(SyncMessages.syncStatus('idle'));
        }
      }
      break;
  }
});

/**
 * Handle Background Sync API events
 */
self.addEventListener('sync', (event: any) => {
  if (event.tag === 'sync-bookmarks') {
    event.waitUntil(performSync());
  }
});

/**
 * Handle Periodic Background Sync API events
 */
self.addEventListener('periodicsync', (event: any) => {
  if (event.tag === 'periodic-sync') {
    event.waitUntil(performSync());
  }
});


/**
 * Track user engagement for periodic sync and log important fetch events
 */
self.addEventListener('fetch', (event) => {
  // Log main app file requests to track cache behavior
  const url = event.request.url;
  const isMainApp = url.includes('/main-') && url.endsWith('.js');
  const isServiceWorker = url.endsWith('/sw.js');
  const isManifest = url.endsWith('/manifest.webmanifest');

  if (isMainApp || isServiceWorker || isManifest) {
    logInfo('serviceWorker', `Fetch request for: ${url.split('/').pop()}`);
  }

  // Let Workbox handle the actual fetch
});