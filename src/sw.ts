/// <reference lib="webworker" />
/// <reference path="./types/service-worker.d.ts" />
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst } from 'workbox-strategies';
import { SyncCore, type SyncCheckpoint } from './services/sync-service';
import { SyncMessages, type SyncMessage, type ServiceWorkerLogMessage } from './types/sync-messages';
import { DatabaseService } from './services/database';
import type { AppSettings } from './types';

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
let currentSyncCore: SyncCore | null = null;
let syncInProgress = false;
// let lastSyncTimestamp = 0; // Currently unused

// Retry configuration
const SYNC_RETRY_DELAYS = [5000, 15000, 60000, 300000]; // 5s, 15s, 1m, 5m

/**
 * Service Worker logging helper
 * Since service workers can't directly use DebugService, we send log messages to clients
 */
const swLog = {
  info: (operation: string, message: string, details?: any) => {
    // Log to console for debugging
    console.log(`[SW] ${operation}: ${message}`, details);
    // Send to clients for DebugService
    const logMessage: ServiceWorkerLogMessage = {
      type: 'SW_LOG',
      level: 'info',
      operation,
      message,
      details
    };
    broadcastToClients(logMessage).catch(() => {});
  },
  
  error: (operation: string, message: string, error?: any) => {
    // Log to console for debugging
    console.error(`[SW] ${operation}: ${message}`, error);
    // Send to clients for DebugService
    const logMessage: ServiceWorkerLogMessage = {
      type: 'SW_LOG',
      level: 'error',
      operation,
      message,
      error: error?.message || error
    };
    broadcastToClients(logMessage).catch(() => {});
  },
  
  warn: (operation: string, message: string, details?: any) => {
    // Log to console for debugging
    console.warn(`[SW] ${operation}: ${message}`, details);
    // Send to clients for DebugService
    const logMessage: ServiceWorkerLogMessage = {
      type: 'SW_LOG',
      level: 'warn',
      operation,
      message,
      details
    };
    broadcastToClients(logMessage).catch(() => {});
  }
};

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
    swLog.error('getSettings', 'Failed to get settings', error);
    return null;
  }
}

/**
 * Perform sync operation with progress reporting
 */
async function performSync(fullSync = false): Promise<void> {
  if (syncInProgress) {
    swLog.info('performSync', 'Sync already in progress');
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
    
    // Load checkpoint from database if not a full sync
    let syncCheckpoint: SyncCheckpoint | undefined = undefined;
    if (!fullSync) {
      const checkpoint = await DatabaseService.getSyncCheckpoint();
      syncCheckpoint = checkpoint as SyncCheckpoint | undefined;
    } else {
      // Clear checkpoint and sync timestamp for full sync
      await DatabaseService.clearSyncCheckpoint();
      await DatabaseService.setLastSyncTimestamp('0');
      await DatabaseService.resetSyncRetryCount();
    }
    
    // Create sync core with progress callback
    currentSyncCore = new SyncCore(async (progress) => {
      await broadcastToClients(SyncMessages.syncProgress(
        progress.current,
        progress.total,
        progress.phase
      ));
    });
    
    await broadcastToClients(SyncMessages.syncStatus('syncing'));
    
    const result = await currentSyncCore.performSync(settings, syncCheckpoint ?? undefined);
    
    if (result.success) {
      // lastSyncTimestamp = result.timestamp; // Currently unused
      await DatabaseService.clearSyncCheckpoint();
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
    swLog.error('performSync', 'Sync error', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const isNetworkError = errorMessage.includes('fetch') || errorMessage.includes('network') || 
                           errorMessage.includes('Failed to fetch') || errorMessage.includes('NetworkError');
    const isCancelled = errorMessage.includes('cancelled');
    
    // Save error to database
    await DatabaseService.setLastSyncError(errorMessage);
    
    // Save checkpoint if sync was interrupted (not cancelled)
    if (!isCancelled && currentSyncCore) {
      // The sync core should have saved its own checkpoint during progress
      // We just need to ensure retry count is updated
    }
    
    await broadcastToClients(SyncMessages.syncError(errorMessage, isNetworkError));
    await broadcastToClients(SyncMessages.syncStatus('failed'));
    
    // Schedule retry for recoverable errors
    if (isNetworkError) {
      const retryCount = await DatabaseService.getSyncRetryCount();
      if (retryCount < SYNC_RETRY_DELAYS.length) {
        const delay = SYNC_RETRY_DELAYS[retryCount];
        await DatabaseService.incrementSyncRetryCount();
        swLog.info('scheduleRetry', `Scheduling sync retry in ${delay}ms (attempt ${retryCount + 1})`);
        setTimeout(() => {
          (self.registration as any).sync?.register('sync-bookmarks');
        }, delay);
      }
    }
  } finally {
    syncInProgress = false;
    currentSyncCore = null;
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
      if (currentSyncCore) {
        currentSyncCore.cancelSync();
        await broadcastToClients(SyncMessages.syncStatus('cancelled'));
      }
      break;
      
    case 'REGISTER_PERIODIC_SYNC':
      if ('periodicSync' in self.registration) {
        try {
          if (message.enabled) {
            // Register periodic sync with minimum interval (browser will decide actual frequency)
            await (self.registration as any).periodicSync.register('periodic-sync', {
              minInterval: message.minInterval || 12 * 60 * 60 * 1000 // 12 hours default
            });
            swLog.info('periodicSync', 'Periodic sync registered');
          } else {
            // Unregister periodic sync
            await (self.registration as any).periodicSync.unregister('periodic-sync');
            swLog.info('periodicSync', 'Periodic sync unregistered');
          }
        } catch (error) {
          swLog.error('periodicSync', 'Failed to register periodic sync', error);
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
          await (self.registration as any).periodicSync.register('periodic-sync', {
            minInterval: settings.sync_interval || 12 * 60 * 60 * 1000
          });
        } catch (error) {
          swLog.error('activate', 'Failed to register periodic sync on activation', error);
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