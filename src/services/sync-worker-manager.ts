import type { AppSettings, SyncPhase } from '../types';
import type {
  SyncWorkerResponseMessage
} from '../types/worker-messages';
import { SyncWorkerMessages } from '../types/worker-messages';
import { WebLockCoordinator } from './web-lock-coordinator';

export interface SyncWorkerCallbacks {
  onProgress?: (current: number, total: number, phase: SyncPhase) => void;
  onComplete?: (processed: number) => void;
  onError?: (error: string, recoverable: boolean) => void;
  onCancelled?: (processed: number) => void;
}

/**
 * Manages the dedicated sync worker from the main thread.
 * This solves the "Worker is not defined" issue in service workers by moving
 * worker creation and management to the main thread context.
 *
 * Exposes typed callbacks instead of raw message objects to hide message-based
 * communication details from consumers.
 */
export class SyncWorkerManager {
  #worker: Worker | null = null;
  #currentSyncId: string | null = null;
  #callbacks: SyncWorkerCallbacks;
  #creatingWorker: boolean = false;
  #webLockCoordinator: WebLockCoordinator;
  #workerHealthCheckInterval: number | null = null;

  /**
   * Initialize the sync worker manager with typed callbacks
   */
  constructor(callbacks: SyncWorkerCallbacks = {}) {
    this.#callbacks = callbacks;
    this.#webLockCoordinator = new WebLockCoordinator();
  }

  /**
   * Create the dedicated sync worker if it doesn't exist
   */
  async #createWorker(): Promise<Worker> {
    if (this.#worker) {
      return this.#worker;
    }

    // Prevent concurrent creation
    if (this.#creatingWorker) {
      // Wait for existing creation to complete
      while (this.#creatingWorker && !this.#worker) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      return this.#worker!;
    }

    this.#creatingWorker = true;
    try {
      // Create the dedicated sync worker using Vite's worker import syntax
      this.#worker = new Worker(
        new URL('../worker/sync-worker.ts', import.meta.url),
        { type: 'module' }
      );

      // Handle messages from worker and call appropriate callbacks
      this.#worker.addEventListener('message', (event: MessageEvent<SyncWorkerResponseMessage>) => {
        this.#handleWorkerMessage(event.data);
      });

      // Handle worker errors
      this.#worker.addEventListener('error', (error) => {
        console.error('Sync worker error:', error);
        this.#callbacks.onError?.(`Worker error: ${error.message}`, false);
        this.cleanup();
      });

      return this.#worker;
    } finally {
      this.#creatingWorker = false;
    }
  }

  /**
   * Handle messages from the worker and call appropriate callbacks
   */
  #handleWorkerMessage(message: SyncWorkerResponseMessage): void {
    const { type, payload } = message;

    switch (type) {
      case 'SYNC_PROGRESS':
        this.#callbacks.onProgress?.(payload.current, payload.total, payload.phase);
        break;

      case 'SYNC_COMPLETE':
        this.#callbacks.onComplete?.(payload.processed);
        break;

      case 'SYNC_ERROR':
        this.#callbacks.onError?.(payload.error, payload.recoverable || false);
        break;

      case 'SYNC_CANCELLED':
        this.#callbacks.onCancelled?.(payload.processed || 0);
        break;
    }
  }

  /**
   * Start worker health monitoring to detect orphaned syncs
   */
  #startWorkerHealthCheck(): void {
    if (this.#workerHealthCheckInterval !== null) {
      return; // Already monitoring
    }

    // Check worker health every 30 seconds
    this.#workerHealthCheckInterval = setInterval(async () => {
      try {
        // Check if there are zombie locks that need cleanup
        const lockStatus = await this.#webLockCoordinator.getLockStatus();

        if (!lockStatus.available) {
          console.warn('SyncWorkerManager: Detected held sync lock, performing emergency cleanup');
          await this.emergencyLockCleanup();
        }
      } catch (error) {
        console.warn('SyncWorkerManager: Worker health check failed', error);
      }
    }, 30000) as unknown as number;
  }

  /**
   * Stop worker health monitoring
   */
  #stopWorkerHealthCheck(): void {
    if (this.#workerHealthCheckInterval !== null) {
      clearInterval(this.#workerHealthCheckInterval);
      this.#workerHealthCheckInterval = null;
    }
  }

  /**
   * Emergency cleanup for orphaned locks
   */
  async emergencyLockCleanup(): Promise<void> {
    try {
      console.log('SyncWorkerManager: Performing emergency lock cleanup');
      await this.#webLockCoordinator.emergencyCleanup();

      // If we had a worker and sync ID, clean up local state too
      if (this.#worker && this.#currentSyncId) {
        console.log('SyncWorkerManager: Terminating worker during emergency cleanup');
        this.#worker.terminate();
        this.#worker = null;
        this.#currentSyncId = null;
      }
    } catch (error) {
      console.error('SyncWorkerManager: Emergency cleanup failed', error);
    }
  }

  /**
   * Start a sync operation
   */
  async startSync(settings: AppSettings, fullSync = false): Promise<string> {
    const worker = await this.#createWorker();
    this.#currentSyncId = crypto.randomUUID();

    // Start health monitoring when sync begins
    this.#startWorkerHealthCheck();

    worker.postMessage(SyncWorkerMessages.startSync(
      settings,
      fullSync,
      this.#currentSyncId
    ));

    return this.#currentSyncId;
  }

  /**
   * Cancel the current sync operation
   */
  cancelSync(): void {
    if (this.#worker && this.#currentSyncId) {
      this.#worker.postMessage(SyncWorkerMessages.cancelSync(
        this.#currentSyncId
      ));
    }
  }

  /**
   * Cleanup the worker
   */
  cleanup(): void {
    // Stop health monitoring
    this.#stopWorkerHealthCheck();

    if (this.#worker) {
      this.#worker.terminate();
      this.#worker = null;
    }
    this.#currentSyncId = null;
    this.#creatingWorker = false;
  }

  /**
   * Check if sync is currently in progress
   */
  get isSyncing(): boolean {
    return this.#currentSyncId !== null;
  }

  /**
   * Get the current sync ID
   */
  get currentSyncId(): string | null {
    return this.#currentSyncId;
  }
}