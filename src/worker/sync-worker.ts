/// <reference lib="webworker" />

import { SyncService } from './sync-service';
import type { AppSettings } from '../types';
import { logInfo, logError } from './sw-logger';

declare const self: DedicatedWorkerGlobalScope;

interface SyncWorkerMessage {
  type: 'START_SYNC' | 'CANCEL_SYNC' | 'PAUSE_SYNC' | 'RESUME_SYNC';
  payload?: {
    settings?: AppSettings;
    fullSync?: boolean;
    reason?: string;
  };
  id: string;
}

interface SyncWorkerResponse {
  type: 'SYNC_PROGRESS' | 'SYNC_COMPLETE' | 'SYNC_ERROR' | 'SYNC_CANCELLED' | 'SYNC_PAUSED' | 'SYNC_RESUMED';
  payload: any;
  id: string;
}

let currentSyncService: SyncService | null = null;
let currentSyncId: string | null = null;
let syncInitializationInProgress = false;

/**
 * Dedicated worker for handling sync operations to keep the service worker responsive
 */
self.addEventListener('message', async (event: MessageEvent<SyncWorkerMessage>) => {
  const { type, payload, id } = event.data;

  logInfo('syncWorker', `Received message: ${type}`, { id });

  switch (type) {
    case 'START_SYNC':
      // Prevent race conditions from multiple START_SYNC messages
      if (currentSyncService || syncInitializationInProgress) {
        const conflictMessage = currentSyncService ? 'Sync already in progress' : 'Sync initialization already in progress';
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: {
            error: conflictMessage,
            recoverable: true // Client can retry
          },
          id
        } as SyncWorkerResponse);
        return;
      }

      // Mark initialization as in progress to prevent race conditions
      syncInitializationInProgress = true;

      if (!payload?.settings) {
        syncInitializationInProgress = false; // Reset flag on error
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: {
            error: 'Settings required for sync',
            recoverable: true
          },
          id
        } as SyncWorkerResponse);
        return;
      }

      currentSyncId = id;

      try {
        // Create sync service with progress callback
        currentSyncService = new SyncService((progress) => {
          self.postMessage({
            type: 'SYNC_PROGRESS',
            payload: progress,
            id: currentSyncId!
          } as SyncWorkerResponse);
        });

        logInfo('syncWorker', 'Starting sync operation', {
          fullSync: payload.fullSync,
          linkdingUrl: payload.settings.linkding_url
        });

        // Clear initialization flag once sync service is created and starting
        syncInitializationInProgress = false;

        const result = await currentSyncService.performSync(payload.settings);

        if (result.success) {
          self.postMessage({
            type: 'SYNC_COMPLETE',
            payload: {
              processed: result.processed,
              timestamp: result.timestamp
            },
            id: currentSyncId!
          } as SyncWorkerResponse);
        } else {
          self.postMessage({
            type: 'SYNC_ERROR',
            payload: {
              error: result.error?.message || 'Unknown sync error',
              processed: result.processed
            },
            id: currentSyncId!
          } as SyncWorkerResponse);
        }
      } catch (error) {
        logError('syncWorker', 'Sync operation failed', error);

        self.postMessage({
          type: 'SYNC_ERROR',
          payload: {
            error: error instanceof Error ? error.message : 'Unknown error',
            processed: currentSyncService?.getProcessedCount() || 0,
            recoverable: true // Sync errors are typically recoverable
          },
          id: currentSyncId!
        } as SyncWorkerResponse);
      } finally {
        // Always clean up state, including initialization flag
        syncInitializationInProgress = false;
        currentSyncService = null;
        currentSyncId = null;
      }
      break;

    case 'CANCEL_SYNC':
      if (currentSyncService && currentSyncId === id) {
        logInfo('syncWorker', 'Cancelling sync operation', { id });
        currentSyncService.cancelSync();

        self.postMessage({
          type: 'SYNC_CANCELLED',
          payload: {
            processed: currentSyncService.getProcessedCount()
          },
          id
        } as SyncWorkerResponse);

        currentSyncService = null;
        currentSyncId = null;
      } else {
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { error: 'No matching sync operation to cancel' },
          id
        } as SyncWorkerResponse);
      }
      break;

    case 'PAUSE_SYNC':
      if (currentSyncService && currentSyncId === id) {
        logInfo('syncWorker', 'Pausing sync operation', { id, reason: payload?.reason });
        currentSyncService.pauseSync();

        self.postMessage({
          type: 'SYNC_PAUSED',
          payload: {
            processed: currentSyncService.getProcessedCount(),
            reason: payload?.reason
          },
          id
        } as SyncWorkerResponse);
      } else {
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { error: 'No matching sync operation to pause' },
          id
        } as SyncWorkerResponse);
      }
      break;

    case 'RESUME_SYNC':
      if (currentSyncService && currentSyncId === id && currentSyncService.isPaused()) {
        logInfo('syncWorker', 'Resuming sync operation', { id });
        currentSyncService.resumeSync();

        self.postMessage({
          type: 'SYNC_RESUMED',
          payload: {
            processed: currentSyncService.getProcessedCount()
          },
          id
        } as SyncWorkerResponse);
      } else {
        self.postMessage({
          type: 'SYNC_ERROR',
          payload: { error: 'No matching paused sync operation to resume' },
          id
        } as SyncWorkerResponse);
      }
      break;

    default:
      self.postMessage({
        type: 'SYNC_ERROR',
        payload: { error: `Unknown message type: ${type}` },
        id
      } as SyncWorkerResponse);
  }
});

// Handle worker errors
self.addEventListener('error', (event) => {
  const errorMessage = `Worker error: ${event.message} at ${event.filename}:${event.lineno}`;
  logError('syncWorker', 'Worker error', new Error(errorMessage));

  if (currentSyncId) {
    self.postMessage({
      type: 'SYNC_ERROR',
      payload: {
        error: errorMessage,
        processed: currentSyncService?.getProcessedCount() || 0,
        recoverable: false // Indicate this is an unrecoverable error
      },
      id: currentSyncId
    } as SyncWorkerResponse);
  }

  // Clean up current operation
  if (currentSyncService) {
    currentSyncService.cancelSync();
    currentSyncService = null;
  }
  syncInitializationInProgress = false;
  currentSyncId = null;
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  const errorMessage = `Unhandled promise rejection: ${event.reason}`;
  logError('syncWorker', 'Unhandled promise rejection', event.reason);

  if (currentSyncId) {
    self.postMessage({
      type: 'SYNC_ERROR',
      payload: {
        error: errorMessage,
        processed: currentSyncService?.getProcessedCount() || 0,
        recoverable: true // Promise rejections might be recoverable
      },
      id: currentSyncId
    } as SyncWorkerResponse);
  }

  // Clean up current operation for unhandled rejections
  if (currentSyncService) {
    currentSyncService.cancelSync();
    currentSyncService = null;
  }
  syncInitializationInProgress = false;
  currentSyncId = null;

  // Prevent the unhandled rejection from propagating
  event.preventDefault();
});

logInfo('syncWorker', 'Sync worker initialized and ready');