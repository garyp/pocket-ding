import type { DebugLogEntry, DebugAppState } from '../types';
import { DatabaseService } from './database';

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

      // Get bookmarks with assets
      const bookmarksWithAssets = new Set(assets.map((a: any) => a.bookmark_id));

      return {
        bookmarks: {
          total: bookmarks.length,
          unread: bookmarks.filter(b => b.unread).length,
          archived: bookmarks.filter(b => b.is_archived).length,
          withAssets: bookmarksWithAssets.size
        },
        sync: {
          isInProgress: false, // Will be updated by sync service
          ...(lastSyncTimestamp && { lastSyncAt: lastSyncTimestamp })
        },
        api: {
          ...(settings?.linkding_url && { baseUrl: settings.linkding_url })
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

  static logApiError(url: string, error: Error): void {
    this.log('error', 'api', 'error', `API request failed: ${url}`, { url }, error);
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
}