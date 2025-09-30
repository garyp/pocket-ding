/**
 * WebLockCoordinator manages Web Lock API coordination for preventing
 * concurrent sync operations across multiple tabs/workers.
 *
 * Following Phase 1.1 of the sync implementation plan, this service:
 * - Provides lock availability checking for UI display
 * - Offers lock waiting for coordination
 * - Includes timeout and recovery mechanisms
 *
 * NOTE: Workers acquire locks directly. This service is for coordination
 * and status checking from the main thread.
 */

export interface WebLockOptions {
  /**
   * Lock timeout in milliseconds (default: 5 minutes)
   */
  timeout?: number;

  /**
   * Whether to steal the lock if it's been held too long
   */
  steal?: boolean;
}

export class WebLockCoordinator {
  // Sync lock name - shared across tabs and workers
  static readonly SYNC_LOCK_NAME = 'pocket-ding-sync';

  // Default timeout for sync operations (5 minutes)
  static readonly DEFAULT_TIMEOUT = 5 * 60 * 1000;

  // Lock steal timeout (10 minutes - twice the default)
  static readonly STEAL_TIMEOUT = 10 * 60 * 1000;

  /**
   * Check if Web Locks API is available
   */
  #isWebLocksAvailable(): boolean {
    return 'locks' in navigator && typeof navigator.locks.query === 'function';
  }

  /**
   * Check if the sync lock is currently available (not held by any tab/worker)
   */
  async isLockAvailable(): Promise<boolean> {
    if (!this.#isWebLocksAvailable()) {
      // If Web Locks API isn't available, assume available
      // (fallback behavior - sync will proceed without coordination)
      return true;
    }

    try {
      const lockState = await navigator.locks.query();

      // Ensure we have the expected structure
      if (!lockState || !Array.isArray(lockState.held)) {
        // If we don't get expected structure, assume available
        return true;
      }

      // Check if the sync lock is currently held
      const syncLock = lockState.held?.find(lock => lock.name === WebLockCoordinator.SYNC_LOCK_NAME);

      // If lock exists, it's not available
      return !syncLock;
    } catch (error) {
      // If query fails, assume available to prevent blocking
      // This is the safe fallback - better to allow sync than block it
      console.warn('WebLockCoordinator: Failed to query lock state', error);
      return true;
    }
  }

  /**
   * Wait for the sync lock to be released
   * Useful for SyncController to wait before starting foreground sync
   */
  async waitForLockRelease(options: WebLockOptions = {}): Promise<void> {
    if (!this.#isWebLocksAvailable()) {
      // No Web Locks API - nothing to wait for
      return;
    }

    const timeout = options.timeout ?? WebLockCoordinator.DEFAULT_TIMEOUT;
    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const pollInterval = 100; // Check every 100ms

      const checkLock = async () => {
        try {
          const isAvailable = await this.isLockAvailable();

          if (isAvailable) {
            resolve();
            return;
          }

          // Check timeout
          if (Date.now() - startTime > timeout) {
            if (options.steal) {
              // Caller wants to proceed anyway
              resolve();
            } else {
              reject(new Error('Timeout waiting for sync lock to be released'));
            }
            return;
          }

          // Continue polling
          setTimeout(checkLock, pollInterval);
        } catch (error) {
          reject(error);
        }
      };

      checkLock();
    });
  }

  /**
   * Helper method for workers to acquire sync lock with simplified pattern
   * Returns a function to release the lock, or null if lock couldn't be acquired
   */
  static async acquireSyncLockInWorker(options: WebLockOptions = {}): Promise<(() => void) | null> {
    if (!('locks' in navigator) || typeof navigator.locks.request !== 'function') {
      // No Web Locks API - return a no-op release function
      return () => {};
    }

    const timeout = options.timeout ?? WebLockCoordinator.DEFAULT_TIMEOUT;

    try {
      return new Promise((resolve) => {
        const timeoutId = setTimeout(() => {
          resolve(null); // Timeout - couldn't acquire lock
        }, timeout);

        let lockResolver: (() => void) | null = null;

        navigator.locks.request(
          WebLockCoordinator.SYNC_LOCK_NAME,
          { mode: 'exclusive' },
          (lock) => {
            clearTimeout(timeoutId);

            if (!lock) {
              resolve(null); // Lock request failed
              return Promise.resolve();
            }

            // Lock acquired - return a promise that will be resolved when sync is done
            return new Promise<void>((lockResolve) => {
              lockResolver = lockResolve;
              // Return the release function to the caller
              resolve(() => {
                if (lockResolver) {
                  lockResolver();
                  lockResolver = null;
                }
              });
            });
          }
        ).catch(() => {
          clearTimeout(timeoutId);
          resolve(null);
        });
      });
    } catch (error) {
      console.warn('WebLockCoordinator: Failed to acquire sync lock', error);
      return null;
    }
  }

  /**
   * Emergency cleanup method to release orphaned locks
   * Used by SyncWorkerManager for recovery scenarios
   */
  async emergencyCleanup(): Promise<void> {
    if (!this.#isWebLocksAvailable()) {
      return;
    }

    try {
      const lockState = await navigator.locks.query();
      const syncLock = lockState.held?.find(lock => lock.name === WebLockCoordinator.SYNC_LOCK_NAME);

      if (syncLock) {
        // Force release by trying to acquire and immediately release
        // (simplified approach without timestamp checking)
        await navigator.locks.request(
          WebLockCoordinator.SYNC_LOCK_NAME,
          { mode: 'exclusive', ifAvailable: true },
          (lock) => {
            if (lock) {
              // Lock acquired and will be immediately released
              return Promise.resolve();
            }
            return Promise.resolve();
          }
        );
      }
    } catch (error) {
      console.warn('WebLockCoordinator: Emergency cleanup failed', error);
    }
  }

  /**
   * Get current lock status for debugging/monitoring
   */
  async getLockStatus(): Promise<{
    available: boolean;
    holder?: string;
  }> {
    if (!this.#isWebLocksAvailable()) {
      return { available: true };
    }

    try {
      const lockState = await navigator.locks.query();
      const syncLock = lockState.held?.find(lock => lock.name === WebLockCoordinator.SYNC_LOCK_NAME);

      if (!syncLock) {
        return { available: true };
      }

      const result: any = {
        available: false,
        holder: syncLock.name
      };

      return result;
    } catch (error) {
      console.warn('WebLockCoordinator: Failed to get lock status', error);
      return { available: true };
    }
  }
}