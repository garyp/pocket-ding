import type { DebugLogEntry, DebugAppState, SyncPhase } from '../types';
import { DatabaseService } from './database';
import type { SyncMessage } from '../types/sync-messages';

export class DebugService {
  private static instance: DebugService | null = null;
  private static logs: DebugLogEntry[] = [];
  private static maxLogEntries = 1000;
  private static isDebugEnabled = false;

  static getInstance(): DebugService {
    if (!this.instance) {
      this.instance = new DebugService();
    }
    return this.instance;
  }

  static async initialize(): Promise<void> {
    try {
      const settings = await DatabaseService.getSettings();
      this.isDebugEnabled = settings?.debug_mode ?? false;
    } catch (error) {
      console.error('Failed to initialize debug service:', error);
    }
  }

  static setDebugMode(enabled: boolean): void {
    this.isDebugEnabled = enabled;
  }

  static isEnabled(): boolean {
    return this.isDebugEnabled;
  }

  static log(
    level: 'info' | 'warn' | 'error',
    category: 'sync' | 'api' | 'database' | 'app',
    operation: string,
    message: string,
    details?: any,
    error?: Error
  ): void {
    if (!this.isDebugEnabled) return;

    const logEntry: DebugLogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      level,
      category,
      operation,
      message,
      details,
      ...(error && { error })
    };

    this.logs.push(logEntry);

    // Trim logs if they exceed max entries
    if (this.logs.length > this.maxLogEntries) {
      this.logs = this.logs.slice(-this.maxLogEntries);
    }

    // Also log to console with appropriate level
    const consoleMessage = `[DEBUG] ${category.toUpperCase()} ${operation}: ${message}`;
    switch (level) {
      case 'error':
        if (error) {
          console.error(consoleMessage, { details, error });
        } else {
          console.error(consoleMessage, details);
        }
        break;
      case 'warn':
        console.warn(consoleMessage, details);
        break;
      case 'info':
      default:
        console.log(consoleMessage, details);
        break;
    }
  }

  static getLogs(): DebugLogEntry[] {
    return [...this.logs].reverse(); // Return newest first
  }

  static clearLogs(): void {
    this.logs = [];
  }

  static async getAppState(): Promise<DebugAppState> {
    try {
      const bookmarks = await DatabaseService.getAllBookmarks();
      const assets = await DatabaseService.getAllAssets();
      const settings = await DatabaseService.getSettings();
      const lastSyncTimestamp = await DatabaseService.getLastSyncTimestamp();
      const lastSyncError = await DatabaseService.getLastSyncError();
      const syncRetryCount = await DatabaseService.getSyncRetryCount();
      const unarchivedOffset = await DatabaseService.getUnarchivedOffset();
      const archivedOffset = await DatabaseService.getArchivedOffset();

      // Calculate storage usage if supported
      let storageInfo = {};
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        try {
          const estimate = await navigator.storage.estimate();
          storageInfo = {
            sizeEstimate: estimate.usage,
            quotaUsed: estimate.usage,
            quotaAvailable: estimate.quota
          };
        } catch (error) {
          // Storage estimate not available
        }
      }

      // Get bookmarks with assets and sync-related counts
      const bookmarksWithAssets = new Set(assets.map((a: any) => a.bookmark_id));
      const bookmarksNeedingAssetSync = bookmarks.filter(b => b.needs_asset_sync === 1).length;
      const bookmarksNeedingReadSync = bookmarks.filter(b => b.needs_read_sync === 1).length;

      // Get service worker information
      const serviceWorkerInfo = await this.getServiceWorkerInfo();

      return {
        bookmarks: {
          total: bookmarks.length,
          unread: bookmarks.filter(b => b.unread).length,
          archived: bookmarks.filter(b => b.is_archived).length,
          withAssets: bookmarksWithAssets.size
        },
        sync: {
          isInProgress: false, // Will be updated by sync service
          ...(lastSyncTimestamp && { lastSyncAt: lastSyncTimestamp }),
          ...(lastSyncError && { lastSyncError }),
          retryCount: syncRetryCount,
          unarchivedOffset,
          archivedOffset,
          bookmarksNeedingAssetSync,
          bookmarksNeedingReadSync,
          serviceWorker: serviceWorkerInfo
        },
        api: {
          ...(settings?.linkding_url && { baseUrl: settings.linkding_url }),
          isConnected: settings?.linkding_url && settings?.linkding_token ? true : false
        },
        storage: storageInfo
      };
    } catch (error) {
      this.log('error', 'app', 'getAppState', 'Failed to get app state', undefined, error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  // Convenience methods for common logging scenarios
  static logSyncStart(total: number): void {
    this.log('info', 'sync', 'start', `Starting sync of ${total} bookmarks`, { total });
  }

  static logSyncProgress(current: number, total: number): void {
    this.log('info', 'sync', 'progress', `Sync progress: ${current}/${total}`, { current, total });
  }

  static logSyncComplete(processed: number): void {
    this.log('info', 'sync', 'complete', `Sync completed successfully`, { processed });
  }

  static logSyncError(error: Error, context?: any): void {
    this.log('error', 'sync', 'error', 'Sync failed', context, error);
  }

  static logApiRequest(url: string, method: string): void {
    this.log('info', 'api', 'request', `${method} ${url}`, { url, method });
  }

  static logApiResponse(url: string, status: number, statusText?: string): void {
    this.log('info', 'api', 'response', `${status} ${statusText || ''} for ${url}`, { url, status, statusText });
  }

  static logApiError(error: Error, context?: any): void {
    this.log('error', 'api', 'error', 'API request failed', context, error);
  }

  static logApiSuccess(message: string, context?: any): void {
    this.log('info', 'api', 'success', message, context);
  }

  static logDatabaseOperation(operation: string, table: string, details?: any): void {
    this.log('info', 'database', operation, `${operation} on ${table}`, { table, ...details });
  }

  static logDatabaseError(operation: string, table: string, error: Error): void {
    this.log('error', 'database', operation, `${operation} failed on ${table}`, { table }, error);
  }

  static logAppEvent(event: string, details?: any): void {
    this.log('info', 'app', event, `App event: ${event}`, details);
  }

  // Generic logging methods for convenience
  static logError(error: Error, category: 'sync' | 'api' | 'database' | 'app', message: string, context?: any): void {
    this.log('error', category, 'error', message, context, error);
  }

  static logWarning(category: 'sync' | 'api' | 'database' | 'app', message: string, context?: any): void {
    this.log('warn', category, 'warning', message, context);
  }

  static logInfo(category: 'sync' | 'api' | 'database' | 'app', message: string, context?: any): void {
    this.log('info', category, 'info', message, context);
  }

  // Service Worker related methods
  static async getServiceWorkerInfo(): Promise<any> {
    const info: any = {
      supported: 'serviceWorker' in navigator,
      registered: false,
      active: false,
      periodicSyncSupported: false,
      backgroundSyncSupported: false,
      permissionState: 'unknown'
    };

    if (!info.supported) {
      return info;
    }

    try {
      const registration = await navigator.serviceWorker.getRegistration();
      if (registration) {
        info.registered = true;
        info.active = !!registration.active;
        info.scope = registration.scope;
        info.updateViaCache = registration.updateViaCache;

        // Check for Background Sync API support
        info.backgroundSyncSupported = 'sync' in registration;

        // Check for Periodic Background Sync API support
        info.periodicSyncSupported = 'periodicSync' in registration;

        if (info.periodicSyncSupported && 'permissions' in navigator) {
          try {
            const permission = await navigator.permissions.query({
              name: 'periodic-background-sync' as PermissionName
            } as PermissionDescriptor);
            info.permissionState = permission.state;
          } catch {
            // Permission query failed - periodic sync might not be supported
            info.permissionState = 'unsupported';
          }
        }

        // Get registered sync tags if available
        if (info.backgroundSyncSupported) {
          try {
            const syncTags = await (registration as any).sync?.getTags();
            info.syncTags = syncTags || [];
          } catch {
            // getTags not supported or failed
          }
        }

        if (info.periodicSyncSupported) {
          try {
            const periodicTags = await (registration as any).periodicSync?.getTags();
            info.periodicTags = periodicTags || [];
          } catch {
            // getTags not supported or failed
          }
        }
      }
    } catch (error) {
      this.log('error', 'app', 'getServiceWorkerInfo', 'Failed to get service worker info', undefined, error instanceof Error ? error : new Error(String(error)));
    }

    return info;
  }

  // Sync specific logging methods with enhanced details
  static logSyncPhaseStart(phase: SyncPhase, details?: any): void {
    this.log('info', 'sync', 'phase-start', `Starting sync phase: ${phase}`, { phase, ...details });
  }

  static logSyncPhaseComplete(phase: SyncPhase, details?: any): void {
    this.log('info', 'sync', 'phase-complete', `Completed sync phase: ${phase}`, { phase, ...details });
  }

  static logServiceWorkerMessage(message: SyncMessage): void {
    this.log('info', 'sync', 'sw-message', `Service worker message: ${message.type}`, { message });
  }

  static logSyncRetry(retryCount: number, delay: number, reason?: string): void {
    this.log('warn', 'sync', 'retry', `Sync retry scheduled (attempt ${retryCount})`, {
      retryCount,
      delay,
      reason
    });
  }

  static logPeriodicSyncEvent(details?: any): void {
    this.log('info', 'sync', 'periodic-sync', 'Periodic sync event triggered', details);
  }

  static logBackgroundSyncEvent(details?: any): void {
    this.log('info', 'sync', 'background-sync', 'Background sync event triggered', details);
  }
}