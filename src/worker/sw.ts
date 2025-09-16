/// <reference lib="webworker" />
/// <reference path="../types/service-worker.d.ts" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { SyncService } from './sync-service';
import { SyncMessages, type SyncMessage } from '../types/sync-messages';
import { DatabaseService } from '../services/database';
import type { AppSettings, SyncPhase } from '../types';
import { logInfo, logError } from './sw-logger';

declare const self: ServiceWorkerGlobalScope;

// Workbox precaching
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// Handle navigation requests
registerRoute(
  new NavigationRoute(
    new NetworkFirst({
      cacheName: 'navigations'
    })
  )
);

// Sync state management
let currentSyncService: SyncService | null = null;
let syncInProgress = false;
let currentSyncProgress: { current: number; total: number; phase: SyncPhase } | null = null;

// Retry configuration
const SYNC_RETRY_DELAYS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1m, 5m


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
 * Perform sync operation with progress reporting
 */
async function performSync(fullSync = false): Promise<void> {
  if (syncInProgress) {
    logInfo('performSync', 'Sync already in progress');
    return;
  }
  
  syncInProgress = true;
  const startTime = Date.now();
  
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
    
    // Create sync service with progress callback
    currentSyncService = new SyncService(async (progress) => {
      currentSyncProgress = progress;
      await broadcastToClients(SyncMessages.syncProgress(
        progress.current,
        progress.total,
        progress.phase
      ));
    });
    
    await broadcastToClients(SyncMessages.syncStatus('syncing'));
    
    const result = await currentSyncService.performSync(settings);

    if (result.success) {
      await DatabaseService.resetSyncRetryCount();
      await DatabaseService.setLastSyncError(null);
      
      await broadcastToClients(SyncMessages.syncComplete(
        true,
        result.processed,
        Date.now() - startTime
      ));
      await broadcastToClients(SyncMessages.syncStatus('completed'));
    } else {
      throw result.error || new Error('Sync failed');
    }
  } catch (error) {
    logError('performSync', 'Sync error', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') ||
                           errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');
    
    // Save error to database
    await DatabaseService.setLastSyncError(errorMessage);
    
    // For network errors, we'll rely on automatic retry rather than checkpoints
    
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
  } finally {
    syncInProgress = false;
    currentSyncService = null;
    currentSyncProgress = null;
  }
}

/**
 * Handle messages from clients
 */
self.addEventListener('message', async (event) => {
  const message = event.data as SyncMessage;
  
  switch (message.type) {
    case 'REQUEST_SYNC':
      if (message.immediate) {
        // For immediate sync, try to perform directly
        await performSync(message.fullSync);
      } else {
        // For background sync, register sync event
        await (self.registration as any).sync?.register('sync-bookmarks');
      }
      break;
      
    case 'CANCEL_SYNC':
      if (currentSyncService) {
        currentSyncService.cancelSync();
        await broadcastToClients(SyncMessages.syncStatus('cancelled'));
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
 * Handle service worker activation
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Clean up old caches
      await self.clients.claim();
      
      // Check if periodic sync should be registered
      const settings = await getSettings();
      if (settings?.auto_sync && 'periodicSync' in self.registration) {
        try {
          await (self.registration as any).periodicSync.register('periodic-sync');
        } catch (error) {
          logError('activate', 'Failed to register periodic sync on activation', error);
        }
      }
    })()
  );
});

/**
 * Track user engagement for periodic sync
 */
self.addEventListener('fetch', (_event) => {
  // Browser automatically tracks engagement, but we can add custom logic here if needed
  // For now, just let Workbox handle the fetch
});