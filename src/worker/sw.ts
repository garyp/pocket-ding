/// <reference lib="webworker" />
/// <reference path="../types/service-worker.d.ts" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { SyncMessages, type SyncMessage } from '../types/sync-messages';
import { DatabaseService } from '../services/database';
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

// Sync state management
let syncWorker: Worker | null = null;
let syncInProgress = false;
let currentSyncProgress: { current: number; total: number; phase: SyncPhase } | null = null;
let currentSyncId: string | null = null;

// Worker lifecycle management
const WORKER_IDLE_TIMEOUT = 300000; // 5 minutes
let workerIdleTimer: ReturnType<typeof setTimeout> | null = null;

// Service worker keepalive mechanisms
let keepalivePort: MessagePort | null = null;
let keepaliveInterval: number | null = null;

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

      // Check if periodic sync should be registered
      const settings = await getSettings();
      if (settings?.auto_sync && 'periodicSync' in self.registration) {
        try {
          await (self.registration as any).periodicSync.register('periodic-sync');
          logInfo('serviceWorker', 'Registered periodic sync on activation');
        } catch (error) {
          logError('activate', 'Failed to register periodic sync on activation', error);
        }
      }

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

/**
 * Start keepalive mechanism to prevent service worker termination during sync
 */
function startKeepalive() {
  if (keepaliveInterval) return; // Already active

  logInfo('serviceWorker', 'Starting keepalive mechanism during sync');

  // Use multiple keepalive strategies:

  // Strategy 1: Periodic self-messaging
  keepaliveInterval = setInterval(() => {
    logInfo('serviceWorker', 'Keepalive heartbeat');
  }, 10000) as unknown as number; // 10 second heartbeat

  // Strategy 2: Create message channel to keep SW active
  const channel = new MessageChannel();
  keepalivePort = channel.port1;

  // Send periodic messages through the channel
  const channelInterval = setInterval(() => {
    if (keepalivePort) {
      keepalivePort.postMessage({ type: 'keepalive' });
    }
  }, 15000); // 15 second channel keepalive

  // Store channel interval for cleanup
  (keepalivePort as any).intervalId = channelInterval;
}

/**
 * Stop keepalive mechanism when sync completes
 */
function stopKeepalive() {
  if (keepaliveInterval) {
    clearInterval(keepaliveInterval);
    keepaliveInterval = null;
    logInfo('serviceWorker', 'Stopped keepalive heartbeat');
  }

  if (keepalivePort) {
    const intervalId = (keepalivePort as any).intervalId;
    if (intervalId) {
      clearInterval(intervalId);
    }
    keepalivePort.close();
    keepalivePort = null;
    logInfo('serviceWorker', 'Closed keepalive message port');
  }
}

// Retry configuration
const SYNC_RETRY_DELAYS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1m, 5m

/**
 * Schedule cleanup of idle sync worker to conserve resources
 */
function scheduleWorkerCleanup(): void {
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
  }

  workerIdleTimer = setTimeout(() => {
    if (syncWorker && !syncInProgress) {
      logInfo('syncWorker', 'Terminating idle sync worker after 5 minutes of inactivity');
      syncWorker.terminate();
      syncWorker = null;
      workerIdleTimer = null;
    }
  }, WORKER_IDLE_TIMEOUT);
}

/**
 * Cancel any pending worker cleanup
 */
function cancelWorkerCleanup(): void {
  if (workerIdleTimer) {
    clearTimeout(workerIdleTimer);
    workerIdleTimer = null;
  }
}

/**
 * Create and configure the dedicated sync worker
 */
function createSyncWorker(): Worker {
  // Import the sync worker using Vite's worker import syntax
  const worker = new Worker(
    new URL('./sync-worker.ts', import.meta.url),
    { type: 'module' }
  );

  worker.addEventListener('message', async (event) => {
    const { type, payload, id } = event.data;

    logInfo('serviceWorker', `Received message from sync worker: ${type}`, { id });

    switch (type) {
      case 'SYNC_PROGRESS':
        currentSyncProgress = payload;
        await broadcastToClients(SyncMessages.syncProgress(
          payload.current,
          payload.total,
          payload.phase
        ));
        break;

      case 'SYNC_COMPLETE':
        syncInProgress = false;
        currentSyncId = null;
        currentSyncProgress = null;
        stopKeepalive();

        await DatabaseService.resetSyncRetryCount();
        await DatabaseService.setLastSyncError(null);

        await broadcastToClients(SyncMessages.syncComplete(
          true,
          payload.processed,
          Date.now() - payload.timestamp
        ));
        await broadcastToClients(SyncMessages.syncStatus('completed'));

        // Schedule worker cleanup after successful completion
        scheduleWorkerCleanup();
        break;

      case 'SYNC_ERROR':
        syncInProgress = false;
        currentSyncId = null;
        currentSyncProgress = null;
        stopKeepalive();

        const errorMessage = payload.error || 'Unknown sync error';
        const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') ||
                               errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');
        const isRecoverable = payload.recoverable !== false; // Default to true if not specified

        // Save error to database
        await DatabaseService.setLastSyncError(errorMessage);

        await broadcastToClients(SyncMessages.syncError(errorMessage, isNetworkError));
        await broadcastToClients(SyncMessages.syncStatus('failed'));

        // Terminate worker for unrecoverable errors
        if (!isRecoverable && syncWorker) {
          logInfo('syncWorker', 'Terminating sync worker due to unrecoverable error');
          syncWorker.terminate();
          syncWorker = null;
        }

        // Schedule retry for recoverable errors
        if (isRecoverable && (isNetworkError || payload.recoverable === true)) {
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

        // Schedule worker cleanup after error (unless it was already terminated)
        if (syncWorker) {
          scheduleWorkerCleanup();
        }
        break;

      case 'SYNC_CANCELLED':
        syncInProgress = false;
        currentSyncId = null;
        currentSyncProgress = null;
        stopKeepalive();

        await broadcastToClients(SyncMessages.syncStatus('cancelled'));

        // Schedule worker cleanup after cancellation
        scheduleWorkerCleanup();
        break;
    }
  });

  worker.addEventListener('error', (error) => {
    logError('syncWorker', 'Sync worker error', error);
    syncInProgress = false;
    currentSyncId = null;
    stopKeepalive();

    // Terminate and recreate worker on next sync to prevent stuck states
    if (syncWorker) {
      syncWorker.terminate();
      syncWorker = null;
      logInfo('syncWorker', 'Terminated sync worker due to error, will recreate on next sync');
    }
  });

  return worker;
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
 * Perform sync operation using dedicated worker
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

    // Cancel any pending worker cleanup since we're about to use it
    cancelWorkerCleanup();

    // Start keepalive to prevent service worker termination during sync coordination
    startKeepalive();

    // Create sync worker if it doesn't exist
    if (!syncWorker) {
      syncWorker = createSyncWorker();
    }

    // Generate unique sync ID for this operation
    currentSyncId = crypto.randomUUID();

    await broadcastToClients(SyncMessages.syncStatus('syncing'));

    // Start sync operation in dedicated worker
    syncWorker.postMessage({
      type: 'START_SYNC',
      payload: {
        settings,
        fullSync
      },
      id: currentSyncId
    });

    logInfo('performSync', `Sync operation delegated to worker with ID: ${currentSyncId}`);

    // The worker will handle the sync and report back via message events
    // Error handling, progress updates, and completion are handled in createSyncWorker()

  } catch (error) {
    logError('performSync', 'Failed to start sync', error);

    syncInProgress = false;
    currentSyncId = null;
    stopKeepalive();

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
      if (syncWorker && currentSyncId) {
        logInfo('sync', `Received CANCEL_SYNC message: ${message.reason}`);

        syncWorker.postMessage({
          type: 'CANCEL_SYNC',
          payload: { reason: message.reason },
          id: currentSyncId
        });
      } else {
        logInfo('sync', 'Received CANCEL_SYNC but no sync is currently active');
      }
      break;

    case 'PAUSE_SYNC':
      // Handle pause as cancellation with manual pause flag
      if (syncWorker && currentSyncId) {
        logInfo('sync', `Received PAUSE_SYNC message: ${message.reason || 'User requested pause'}`);
        // Set manual pause flag in database
        await DatabaseService.setManualPauseState(true);
        // Cancel the sync
        syncWorker.postMessage({
          type: 'CANCEL_SYNC',
          payload: { reason: message.reason || 'User requested pause' },
          id: currentSyncId
        });
        await broadcastToClients(SyncMessages.syncStatus('paused'));
      } else {
        logInfo('sync', 'Received PAUSE_SYNC but no sync is currently active');
      }
      break;

    case 'RESUME_SYNC':
      // Handle resume as clearing manual pause flag and starting new sync
      logInfo('sync', 'Received RESUME_SYNC message');
      const wasManuallyPaused = await DatabaseService.getManualPauseState();
      if (wasManuallyPaused) {
        await DatabaseService.clearManualPauseState();
        // Start a new sync
        await performSync(false);
      } else {
        logInfo('sync', 'Received RESUME_SYNC but sync was not manually paused');
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
        // Check if sync was manually paused
        const isManuallyPaused = await DatabaseService.getManualPauseState();
        if (isManuallyPaused) {
          logInfo('sync', 'Sync is manually paused');
          await broadcastToClients(SyncMessages.syncStatus('paused'));
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