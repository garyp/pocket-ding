/// <reference lib="webworker" />

import { SyncService } from './sync-service';
import type {
  SyncWorkerRequestMessage
} from '../types/worker-messages';
import { SyncWorkerResponses } from '../types/worker-messages';
import { WebLockCoordinator } from '../services/web-lock-coordinator';
import { logInfo, logError } from './sw-logger';

declare const self: DedicatedWorkerGlobalScope;

let currentSyncService: SyncService | null = null;
let currentSyncId: string | null = null;
let syncInitializationInProgress = false;
let syncLockReleaser: (() => void) | null = null;

/**
 * Dedicated worker for handling sync operations to keep the service worker responsive
 */
self.addEventListener('message', async (event: MessageEvent<SyncWorkerRequestMessage>) => {
  const { type, payload, id } = event.data;

  logInfo('syncWorker', `Received message: ${type}`, { id });

  switch (type) {
    case 'START_SYNC':
      // Prevent race conditions from multiple START_SYNC messages
      if (currentSyncService || syncInitializationInProgress) {
        const conflictMessage = currentSyncService ? 'Sync already in progress' : 'Sync initialization already in progress';
        self.postMessage(SyncWorkerResponses.error(
          conflictMessage,
          id,
          0,
          true // Client can retry
        ));
        return;
      }

      // Mark initialization as in progress to prevent race conditions
      syncInitializationInProgress = true;

      if (!payload?.settings) {
        syncInitializationInProgress = false; // Reset flag on error
        self.postMessage(SyncWorkerResponses.error(
          'Settings required for sync',
          id,
          0,
          true
        ));
        return;
      }

      currentSyncId = id;

      try {
        // CRITICAL: Acquire Web Lock as first step to prevent concurrent syncs
        logInfo('syncWorker', 'Acquiring sync lock for multi-tab safety', { syncId: id });
        const lockReleaser = await WebLockCoordinator.acquireSyncLockInWorker();

        if (!lockReleaser) {
          syncInitializationInProgress = false; // Reset flag on error
          self.postMessage(SyncWorkerResponses.error(
            'Could not acquire sync lock - another sync is in progress',
            id,
            0,
            true // Recoverable - user can retry
          ));
          return;
        }

        syncLockReleaser = lockReleaser;
        logInfo('syncWorker', 'Sync lock acquired successfully', { syncId: id });

        // Create sync service with progress callback
        currentSyncService = new SyncService((progress) => {
          self.postMessage(SyncWorkerResponses.progress(
            progress.current,
            progress.total,
            progress.phase,
            currentSyncId!
          ));
        });

        logInfo('syncWorker', 'Starting sync operation', {
          fullSync: payload.fullSync,
          linkdingUrl: payload.settings.linkding_url
        });

        // Clear initialization flag once sync service is created and starting
        syncInitializationInProgress = false;

        const result = await currentSyncService.performSync(payload.settings);

        if (result.success) {
          self.postMessage(SyncWorkerResponses.complete(
            result.processed,
            currentSyncId!
          ));
        } else {
          self.postMessage(SyncWorkerResponses.error(
            result.error?.message || 'Unknown sync error',
            currentSyncId!,
            result.processed
          ));
        }
      } catch (error) {
        logError('syncWorker', 'Sync operation failed', error);

        self.postMessage(SyncWorkerResponses.error(
          error instanceof Error ? error.message : 'Unknown error',
          currentSyncId!,
          currentSyncService?.getProcessedCount() || 0,
          true // Sync errors are typically recoverable
        ));
      } finally {
        // CRITICAL: Always release Web Lock on completion, cancellation, or error
        if (syncLockReleaser) {
          logInfo('syncWorker', 'Releasing sync lock', { syncId: currentSyncId });
          syncLockReleaser();
          syncLockReleaser = null;
        }

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

        self.postMessage(SyncWorkerResponses.cancelled(
          currentSyncService.getProcessedCount(),
          id
        ));

        // Release lock on cancellation
        if (syncLockReleaser) {
          logInfo('syncWorker', 'Releasing sync lock after cancellation', { syncId: id });
          syncLockReleaser();
          syncLockReleaser = null;
        }

        currentSyncService = null;
        currentSyncId = null;
      } else {
        self.postMessage(SyncWorkerResponses.error(
          'No matching sync operation to cancel',
          id
        ));
      }
      break;

    default:
      self.postMessage(SyncWorkerResponses.error(
        `Unknown message type: ${type}`,
        id
      ));
  }
});

// Handle worker errors
self.addEventListener('error', (event) => {
  const errorMessage = `Worker error: ${event.message} at ${event.filename}:${event.lineno}`;
  logError('syncWorker', 'Worker error', new Error(errorMessage));

  if (currentSyncId) {
    self.postMessage(SyncWorkerResponses.error(
      errorMessage,
      currentSyncId,
      currentSyncService?.getProcessedCount() || 0,
      false // Indicate this is an unrecoverable error
    ));
  }

  // Clean up current operation and release lock
  if (currentSyncService) {
    currentSyncService.cancelSync();
    currentSyncService = null;
  }

  // Release lock on worker error
  if (syncLockReleaser) {
    logInfo('syncWorker', 'Releasing sync lock after worker error', { syncId: currentSyncId });
    syncLockReleaser();
    syncLockReleaser = null;
  }

  syncInitializationInProgress = false;
  currentSyncId = null;
});

// Handle unhandled promise rejections
self.addEventListener('unhandledrejection', (event) => {
  const errorMessage = `Unhandled promise rejection: ${event.reason}`;
  logError('syncWorker', 'Unhandled promise rejection', event.reason);

  if (currentSyncId) {
    self.postMessage(SyncWorkerResponses.error(
      errorMessage,
      currentSyncId,
      currentSyncService?.getProcessedCount() || 0,
      true // Promise rejections might be recoverable
    ));
  }

  // Clean up current operation for unhandled rejections and release lock
  if (currentSyncService) {
    currentSyncService.cancelSync();
    currentSyncService = null;
  }

  // Release lock on unhandled rejection
  if (syncLockReleaser) {
    logInfo('syncWorker', 'Releasing sync lock after unhandled rejection', { syncId: currentSyncId });
    syncLockReleaser();
    syncLockReleaser = null;
  }

  syncInitializationInProgress = false;
  currentSyncId = null;

  // Prevent the unhandled rejection from propagating
  event.preventDefault();
});

logInfo('syncWorker', 'Sync worker initialized and ready');