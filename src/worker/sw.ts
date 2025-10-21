/// <reference lib="webworker" />
/// <reference path="../types/service-worker.d.ts" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { SyncMessages, type SyncMessage } from '../types/sync-messages';
import { DatabaseService } from '../services/database';
import { SyncService } from './sync-service';
import { WebLockCoordinator } from '../services/web-lock-coordinator';
import type { AppSettings, SyncPhase } from '../types';
import { logInfo, logError } from './sw-logger';
import { hasBackgroundSync, hasPeriodicBackgroundSync } from '../utils/pwa-capabilities';

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

// Force network-first for main app JavaScript files to ensure updates
registerRoute(
  ({ url }) => /\/main-[a-zA-Z0-9_-]+\.js$/.test(url.pathname),
  new NetworkFirst({
    cacheName: 'app-js-cache',
    networkTimeoutSeconds: 3,
  })
);

// PWA capability detection (detected once at startup)
const PWA_CAPABILITIES = {
  backgroundSync: hasBackgroundSync(),
  periodicBackgroundSync: hasPeriodicBackgroundSync()
};

// Log capability detection results
logInfo('serviceWorker', 'PWA capabilities detected:', PWA_CAPABILITIES);

// Sync state management (for background sync only)
let syncInProgress = false;
let currentSyncProgress: { current: number; total: number; phase: SyncPhase } | null = null;
let currentSyncService: SyncService | null = null;
let backgroundSyncEnabled = true; // Disabled when app is in foreground
let currentLockRelease: (() => void) | null = null;

// Fallback mechanism state (when Background Sync API is not available)
let fallbackRetryQueue: Array<{ tag: string; timestamp: number; retryCount: number }> = [];
let periodicSyncTimer: number | null = null;

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

      // Initialize fallback mechanisms if needed
      if (!PWA_CAPABILITIES.backgroundSync) {
        await initializeRetryQueue();
        logInfo('serviceWorker', 'Background Sync API not available - initialized fallback retry queue');
      }

      if (!PWA_CAPABILITIES.periodicBackgroundSync) {
        logInfo('serviceWorker', 'Periodic Background Sync API not available - will use timer fallback when visible');
      }

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

// Online/offline event listeners for Background Sync fallback
if (!PWA_CAPABILITIES.backgroundSync) {
  logInfo('serviceWorker', 'Setting up online/offline event listeners for Background Sync fallback');

  self.addEventListener('online', () => {
    logInfo('backgroundSyncFallback', 'Network restored - processing retry queue');
    processRetryQueue().catch(error => {
      logError('backgroundSyncFallback', 'Failed to process retry queue on network restore', error);
    });
  });

  self.addEventListener('offline', () => {
    logInfo('backgroundSyncFallback', 'Network lost - sync operations will be queued for retry');
  });
}

// Service worker will automatically handle fetch events via Workbox


// Retry configuration
const SYNC_RETRY_DELAYS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1m, 5m

/**
 * Background Sync API fallback implementation using online/offline events
 * Used when Background Sync API is not available (Firefox/Safari)
 */

/**
 * Add a sync operation to the fallback retry queue
 */
async function addToRetryQueue(tag: string): Promise<void> {
  if (!PWA_CAPABILITIES.backgroundSync) {
    const queueItem = {
      tag,
      timestamp: Date.now(),
      retryCount: 0
    };

    fallbackRetryQueue.push(queueItem);
    logInfo('backgroundSyncFallback', `Added ${tag} to retry queue, queue size: ${fallbackRetryQueue.length}`);

    // Save retry queue to IndexedDB for persistence
    try {
      await DatabaseService.saveSyncRetryQueue(fallbackRetryQueue);
    } catch (error) {
      logError('backgroundSyncFallback', 'Failed to persist retry queue', error);
    }
  }
}

/**
 * Process the retry queue when network is restored
 */
async function processRetryQueue(): Promise<void> {
  if (fallbackRetryQueue.length === 0 || !backgroundSyncEnabled) {
    return;
  }

  logInfo('backgroundSyncFallback', `Processing retry queue with ${fallbackRetryQueue.length} items`);

  // Process each item in the queue
  const itemsToProcess = [...fallbackRetryQueue];
  fallbackRetryQueue = [];

  for (const item of itemsToProcess) {
    try {
      if (item.tag === 'sync-bookmarks') {
        await performSync();
        logInfo('backgroundSyncFallback', `Successfully processed ${item.tag} from retry queue`);
      }
    } catch (error) {
      logError('backgroundSyncFallback', `Failed to process ${item.tag} from retry queue`, error);

      // Re-add to queue if under retry limit
      if (item.retryCount < SYNC_RETRY_DELAYS.length - 1) {
        const delayMs = SYNC_RETRY_DELAYS[item.retryCount];
        item.retryCount++;

        // Schedule retry after delay
        setTimeout(() => {
          fallbackRetryQueue.push(item);
          logInfo('backgroundSyncFallback', `Re-queued ${item.tag} for retry ${item.retryCount} after ${delayMs}ms`);
        }, delayMs);
      } else {
        logInfo('backgroundSyncFallback', `Max retries exceeded for ${item.tag}, dropping from queue`);
      }
    }
  }

  // Update persisted queue
  try {
    await DatabaseService.saveSyncRetryQueue(fallbackRetryQueue);
  } catch (error) {
    logError('backgroundSyncFallback', 'Failed to update persisted retry queue', error);
  }
}

/**
 * Initialize fallback retry queue from IndexedDB on startup
 */
async function initializeRetryQueue(): Promise<void> {
  try {
    const persistedQueue = await DatabaseService.getSyncRetryQueue();
    if (persistedQueue && Array.isArray(persistedQueue)) {
      fallbackRetryQueue = persistedQueue;
      logInfo('backgroundSyncFallback', `Restored retry queue with ${fallbackRetryQueue.length} items from IndexedDB`);
    }
  } catch (error) {
    logError('backgroundSyncFallback', 'Failed to restore retry queue from IndexedDB', error);
    fallbackRetryQueue = [];
  }
}

/**
 * Periodic Sync API fallback implementation using setInterval
 * Used when Periodic Background Sync API is not available (Firefox/Safari)
 */

/**
 * Start periodic sync timer when app is visible (fallback for Periodic Background Sync)
 */
async function startPeriodicSyncFallback(): Promise<void> {
  if (PWA_CAPABILITIES.periodicBackgroundSync || periodicSyncTimer !== null) {
    return; // Native API available or timer already running
  }

  // Use default sync interval (30 minutes) for periodic sync fallback
  try {
    const intervalMinutes = 30; // Default 30 minute interval
    const intervalMs = intervalMinutes * 60 * 1000;

    periodicSyncTimer = setInterval(() => {
      if (backgroundSyncEnabled) {
        logInfo('periodicSyncFallback', `Triggering periodic sync (fallback timer, ${intervalMinutes} min interval)`);
        performSync().catch(error => {
          logError('periodicSyncFallback', 'Periodic sync fallback failed', error);
        });
      }
    }, intervalMs) as unknown as number;

    logInfo('periodicSyncFallback', `Started periodic sync fallback timer (${intervalMinutes} min interval)`);
  } catch (error) {
    logError('periodicSyncFallback', 'Failed to start periodic sync fallback', error);
  }
}

/**
 * Stop periodic sync timer (used when app goes to background or native API is available)
 */
function stopPeriodicSyncFallback(): void {
  if (periodicSyncTimer !== null) {
    clearInterval(periodicSyncTimer);
    periodicSyncTimer = null;
    logInfo('periodicSyncFallback', 'Stopped periodic sync fallback timer');
  }
}

/**
 * Perform background sync directly in the service worker with Web Lock coordination
 */
async function performBackgroundSync(settings: AppSettings, fullSync = false): Promise<void> {
  logInfo('backgroundSync', 'Starting direct sync in service worker');

  // Check if background sync is currently disabled (app in foreground)
  if (!backgroundSyncEnabled) {
    logInfo('backgroundSync', 'Background sync disabled - app is in foreground');
    await broadcastToClients(SyncMessages.syncStatus('cancelled'));
    return;
  }

  let lockRelease: (() => void) | null = null;

  try {
    // Acquire Web Lock before starting sync to prevent conflicts
    logInfo('backgroundSync', 'Acquiring Web Lock for sync operation');
    lockRelease = await WebLockCoordinator.acquireSyncLockInWorker({
      timeout: WebLockCoordinator.DEFAULT_TIMEOUT
    });

    if (!lockRelease) {
      logInfo('backgroundSync', 'Could not acquire Web Lock - another sync is already in progress');
      await broadcastToClients(SyncMessages.syncError(
        'Sync already in progress in another tab',
        false
      ));
      return;
    }

    currentLockRelease = lockRelease;
    logInfo('backgroundSync', 'Web Lock acquired successfully');

    // Check again if background sync is still enabled (could have changed while waiting for lock)
    if (!backgroundSyncEnabled) {
      logInfo('backgroundSync', 'Background sync disabled while waiting for lock - app went to foreground');
      await broadcastToClients(SyncMessages.syncStatus('cancelled'));
      return;
    }

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

    // Schedule retry for recoverable errors (only if background sync still enabled)
    if (isNetworkError && backgroundSyncEnabled) {
      const retryCount = await DatabaseService.getSyncRetryCount();
      if (retryCount < SYNC_RETRY_DELAYS.length) {
        const delay = SYNC_RETRY_DELAYS[retryCount];
        await DatabaseService.incrementSyncRetryCount();
        logInfo('scheduleRetry', `Scheduling sync retry in ${delay}ms (attempt ${retryCount + 1})`);

        setTimeout(() => {
          if (backgroundSyncEnabled) {
            if (PWA_CAPABILITIES.backgroundSync) {
              // Use native Background Sync API
              (self.registration as any).sync?.register('sync-bookmarks');
            } else {
              // Use fallback retry queue
              addToRetryQueue('sync-bookmarks');
            }
          }
        }, delay);
      }
    }

    throw error; // Re-throw to be handled by caller
  } finally {
    // Always clean up state
    currentSyncService = null;

    // Release Web Lock
    if (lockRelease) {
      logInfo('backgroundSync', 'Releasing Web Lock');
      lockRelease();
      currentLockRelease = null;
    }
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
 * Perform sync operation directly in service worker with coordination
 */
async function performSync(fullSync = false): Promise<void> {
  if (syncInProgress) {
    logInfo('performSync', 'Sync already in progress');
    return;
  }

  // Check if background sync is enabled (could be disabled if app is in foreground)
  if (!backgroundSyncEnabled) {
    logInfo('performSync', 'Background sync is disabled - app is in foreground');
    await broadcastToClients(SyncMessages.syncStatus('cancelled'));
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

    // Perform sync directly in service worker with Web Lock coordination
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
        // For background sync, register sync event or use fallback
        if (PWA_CAPABILITIES.backgroundSync) {
          // Use native Background Sync API
          await (self.registration as any).sync?.register('sync-bookmarks');
        } else {
          // Use fallback retry queue
          await addToRetryQueue('sync-bookmarks');
        }
      }
      break;

    case 'CANCEL_SYNC':
      if (currentSyncService && syncInProgress) {
        logInfo('sync', `Received CANCEL_SYNC message: ${message.reason}`);

        currentSyncService.cancelSync();

        syncInProgress = false;
        currentSyncProgress = null;
        keepaliveManager.stop();

        // Release Web Lock if held
        if (currentLockRelease) {
          logInfo('sync', 'Releasing Web Lock after cancellation');
          currentLockRelease();
          currentLockRelease = null;
        }

        await broadcastToClients(SyncMessages.syncStatus('cancelled'));
      } else {
        logInfo('sync', 'Received CANCEL_SYNC but no sync is currently active');
      }
      break;

    case 'APP_FOREGROUND':
      logInfo('visibility', 'App became foreground - disabling background sync');
      backgroundSyncEnabled = false;

      // Stop periodic sync fallback timer if running
      if (!PWA_CAPABILITIES.periodicBackgroundSync) {
        stopPeriodicSyncFallback();
      }

      // Cancel any in-progress background sync
      if (currentSyncService && syncInProgress) {
        logInfo('visibility', 'Cancelling in-progress background sync due to app foreground');

        try {
          currentSyncService.cancelSync();
          syncInProgress = false;
          currentSyncProgress = null;
          keepaliveManager.stop();

          // Release Web Lock if held
          if (currentLockRelease) {
            logInfo('visibility', 'Releasing Web Lock after foreground transition');
            currentLockRelease();
            currentLockRelease = null;
          }

          await broadcastToClients(SyncMessages.syncStatus('cancelled'));
        } catch (error) {
          logError('visibility', 'Error cancelling background sync during foreground transition', error);
        }
      }

      // Notify all clients that service worker is now focusing on PWA duties
      await broadcastToClients({
        type: 'SW_LOG',
        level: 'info',
        operation: 'visibility',
        message: 'Background sync disabled - focusing on PWA duties',
        timestamp: Date.now()
      } as any);
      break;

    case 'APP_BACKGROUND':
      logInfo('visibility', 'App became background - re-enabling background sync');
      backgroundSyncEnabled = true;

      // Start periodic sync fallback timer if needed
      if (!PWA_CAPABILITIES.periodicBackgroundSync) {
        await startPeriodicSyncFallback();
      }

      // Notify all clients that service worker can now handle background sync
      await broadcastToClients({
        type: 'SW_LOG',
        level: 'info',
        operation: 'visibility',
        message: 'Background sync re-enabled',
        timestamp: Date.now()
      } as any);
      break;
      
    case 'REGISTER_PERIODIC_SYNC':
      if (PWA_CAPABILITIES.periodicBackgroundSync) {
        try {
          // Register periodic sync (browser will decide actual frequency)
          // Browser handles duplicate registrations of the same tag gracefully
          await (self.registration as any).periodicSync.register('periodic-sync');
          logInfo('periodicSync', 'Periodic sync registered');
        } catch (error) {
          logError('periodicSync', 'Failed to register periodic sync', error);
          await broadcastToClients(SyncMessages.syncError(
            'Periodic sync not available or permission denied',
            false
          ));
        }
      } else {
        // Use fallback timer-based approach
        logInfo('periodicSync', 'Periodic Background Sync API not available - using timer fallback');
        // startPeriodicSyncFallback handles duplicate calls internally
        await startPeriodicSyncFallback();
      }
      break;

    case 'UNREGISTER_PERIODIC_SYNC':
      if (PWA_CAPABILITIES.periodicBackgroundSync) {
        try {
          // Unregister periodic sync
          await (self.registration as any).periodicSync.unregister('periodic-sync');
          logInfo('periodicSync', 'Periodic sync unregistered');
          // Also stop fallback timer if it's running
          stopPeriodicSyncFallback();
        } catch (error) {
          logError('periodicSync', 'Failed to unregister periodic sync', error);
        }
      } else {
        // Stop fallback timer-based approach
        logInfo('periodicSync', 'Stopping periodic sync fallback timer');
        stopPeriodicSyncFallback();
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
 * Handle Background Sync API events with Web Lock coordination
 * Only register if Background Sync API is supported
 */
if (PWA_CAPABILITIES.backgroundSync) {
  self.addEventListener('sync', (event: any) => {
    if (event.tag === 'sync-bookmarks') {
      logInfo('backgroundSync', 'Background sync event triggered');

      // Wrap the sync operation to ensure proper error handling and lock coordination
      const syncPromise = (async () => {
        try {
          await performSync();
        } catch (error) {
          logError('backgroundSync', 'Background sync event failed', error);

          // Ensure cleanup on error
          syncInProgress = false;
          currentSyncProgress = null;
          keepaliveManager.stop();

          if (currentLockRelease) {
            logInfo('backgroundSync', 'Releasing Web Lock after sync event error');
            currentLockRelease();
            currentLockRelease = null;
          }

          // Don't re-throw to prevent endless retries
        }
      })();

      event.waitUntil(syncPromise);
    }
  });
}

/**
 * Handle Periodic Background Sync API events with Web Lock coordination
 * Only register if Periodic Background Sync API is supported
 */
if (PWA_CAPABILITIES.periodicBackgroundSync) {
  self.addEventListener('periodicsync', (event: any) => {
    if (event.tag === 'periodic-sync') {
      logInfo('periodicSync', 'Periodic sync event triggered');

      // Wrap the sync operation to ensure proper error handling and lock coordination
      const syncPromise = (async () => {
        try {
          await performSync();
        } catch (error) {
          logError('periodicSync', 'Periodic sync event failed', error);

          // Ensure cleanup on error
          syncInProgress = false;
          currentSyncProgress = null;
          keepaliveManager.stop();

          if (currentLockRelease) {
            logInfo('periodicSync', 'Releasing Web Lock after periodic sync error');
            currentLockRelease();
            currentLockRelease = null;
          }

          // Don't re-throw to prevent endless retries
        }
      })();

      event.waitUntil(syncPromise);
    }
  });
}


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