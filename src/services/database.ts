import Dexie, { type Table } from 'dexie';
import { DebugService } from './debug-service';
import type { LocalBookmark, ReadProgress, AppSettings, LocalAsset } from '../types';

interface SyncMetadata {
  id?: number;
  last_sync_timestamp: string;
  unarchived_offset?: number;
  archived_offset?: number;
  retry_count?: number;
  last_error?: string;
  retry_queue?: string; // JSON string of retry queue items
  is_manual_pause?: boolean;  // Track if last interruption was manual pause
}


export class PocketDingDatabase extends Dexie {
  bookmarks!: Table<LocalBookmark>;
  readProgress!: Table<ReadProgress>;
  settings!: Table<AppSettings>;
  syncMetadata!: Table<SyncMetadata>;
  assets!: Table<LocalAsset>;

  constructor() {
    super('PocketDingDB');
    this.version(1).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at',
      readProgress: '++id, bookmark_id, last_read_at',
      settings: '++id, linkding_url, linkding_token'
    });
    this.version(2).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at',
      readProgress: '++id, bookmark_id, last_read_at',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp'
    });
    this.version(3).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync',
      readProgress: '++id, bookmark_id, last_read_at',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp'
    });
    this.version(4).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync',
      readProgress: '++id, bookmark_id, last_read_at',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp',
      assets: '++id, bookmark_id, asset_type, content_type, display_name, status, date_created, cached_at'
    });
    this.version(5).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync',
      readProgress: '++id, bookmark_id, last_read_at, dark_mode_override',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp',
      assets: '++id, bookmark_id, asset_type, content_type, display_name, status, date_created, cached_at'
    });
    this.version(6).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync',
      readProgress: '++id, bookmark_id, last_read_at, dark_mode_override',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp',
      assets: '++id, bookmark_id, asset_type, content_type, display_name, status, date_created, cached_at',
      syncState: '++id'
    });
    this.version(7).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync, needs_asset_sync',
      readProgress: '++id, bookmark_id, last_read_at, dark_mode_override',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp, unarchived_offset, archived_offset, retry_count, last_error',
      assets: '++id, bookmark_id, asset_type, content_type, display_name, status, date_created, cached_at'
    });

    // Version 8: Migrate boolean sync flags to numeric values for proper indexing
    this.version(8).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at, needs_read_sync, needs_asset_sync',
      readProgress: '++id, bookmark_id, last_read_at, dark_mode_override',
      settings: '++id, linkding_url, linkding_token',
      syncMetadata: '++id, last_sync_timestamp, unarchived_offset, archived_offset, retry_count, last_error, is_manual_pause',
      assets: '++id, bookmark_id, asset_type, content_type, display_name, status, date_created, cached_at'
    }).upgrade(async (trans) => {
      // Convert boolean sync flags to numeric values (0=false, 1=true)
      // This enables proper indexing since IndexedDB doesn't support boolean indexes
      await trans.table('bookmarks').toCollection().modify((bookmark: any) => {
        // Convert needs_read_sync: boolean -> number
        if (typeof bookmark.needs_read_sync === 'boolean') {
          bookmark.needs_read_sync = bookmark.needs_read_sync ? 1 : 0;
        }

        // Convert needs_asset_sync: boolean -> number
        if (typeof bookmark.needs_asset_sync === 'boolean') {
          bookmark.needs_asset_sync = bookmark.needs_asset_sync ? 1 : 0;
        }
      });
    });
  }
}

export const db = new PocketDingDatabase();

// Add error handling for database initialization
db.on('close', () => {
  DebugService.logInfo('database', 'Database connection closed');
});

// Test database connectivity on module load
db.open().catch(error => {
  DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'database', 'Failed to open database on initialization');
});

export class DatabaseService {
  /**
   * Check if the database is healthy and accessible
   */
  static async checkDatabaseHealth(): Promise<{ healthy: boolean; error?: string; version?: number }> {
    try {
      // Try to open the database and do a simple operation
      const isOpen = db.isOpen();
      if (!isOpen) {
        await db.open();
      }

      // Test a simple read operation
      await db.bookmarks.count();

      return {
        healthy: true,
        version: db.verno
      };
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'database', 'Database health check failed');
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown database error'
      };
    }
  }

  static async saveBookmark(bookmark: LocalBookmark): Promise<void> {
    await db.bookmarks.put(bookmark);
  }

  static async getBookmark(id: number): Promise<LocalBookmark | undefined> {
    try {
      const bookmark = await db.bookmarks.get(id);
      DebugService.logInfo('database', `getBookmark(${id}): found=${!!bookmark}, title="${bookmark?.title || 'N/A'}"`);
      return bookmark;
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'database', `Failed to retrieve bookmark ${id}`);
      throw new Error(`Failed to retrieve bookmark ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async getAllBookmarks(): Promise<LocalBookmark[]> {
    return await db.bookmarks.orderBy('date_added').reverse().toArray();
  }

  static async getUnreadBookmarks(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('unread').equals(1).toArray();
  }

  static async getUnarchivedBookmarks(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('is_archived').equals(0).toArray();
  }

  static async deleteBookmark(id: number): Promise<void> {
    await db.bookmarks.delete(id);
  }

  static async getBookmarksPaginated(filter: 'all' | 'unread' | 'archived', page: number, pageSize: number): Promise<LocalBookmark[]> {
    const offset = (page - 1) * pageSize;
    const query = this.buildFilteredQuery(filter);
    
    return await query
      .offset(offset)
      .limit(pageSize)
      .toArray();
  }

  static async getBookmarkCount(filter: 'all' | 'unread' | 'archived'): Promise<number> {
    const query = this.buildFilteredQuery(filter);
    return await query.count();
  }

  /**
   * Get all filter counts
   */
  static async getAllFilterCounts(): Promise<{ all: number; unread: number; archived: number }> {
    const allQuery = this.buildFilteredQuery('all');
    const unreadQuery = this.buildFilteredQuery('unread');
    const archivedQuery = this.buildFilteredQuery('archived');
    
    const [all, unread, archived] = await Promise.all([
      allQuery.count(),
      unreadQuery.count(),
      archivedQuery.count()
    ]);
    
    return { all, unread, archived };
  }

  static async findBookmarkPage(bookmarkId: number, filter: 'all' | 'unread' | 'archived', pageSize: number): Promise<number> {
    const query = this.buildFilteredQuery(filter);
    const bookmarks = await query.toArray();
    
    const index = bookmarks.findIndex(bookmark => bookmark.id === bookmarkId);
    
    if (index === -1) {
      return 1; // Default to first page if bookmark not found
    }
    
    return Math.floor(index / pageSize) + 1;
  }

  static async getPageFromAnchorBookmark(anchorBookmarkId: number | undefined, filter: 'all' | 'unread' | 'archived', pageSize: number, fallbackPage: number = 1): Promise<number> {
    if (!anchorBookmarkId) {
      return fallbackPage;
    }
    
    try {
      return await this.findBookmarkPage(anchorBookmarkId, filter, pageSize);
    } catch (error) {
      DebugService.logWarning('database', 'Failed to find anchor bookmark page, falling back to page ' + fallbackPage, { anchor_bookmark_id: anchorBookmarkId, fallback_page: fallbackPage, filter, page_size: pageSize });
      return fallbackPage;
    }
  }

  private static buildFilteredQuery(filter: 'all' | 'unread' | 'archived') {
    if (filter === 'unread') {
      return db.bookmarks
        .orderBy('date_added')
        .reverse()
        .filter((bookmark: any) => bookmark.unread && !bookmark.is_archived);
    } else if (filter === 'archived') {
      return db.bookmarks
        .orderBy('date_added')
        .reverse()
        .filter((bookmark: any) => bookmark.is_archived);
    } else {
      // 'all' filter shows only unarchived bookmarks
      return db.bookmarks
        .orderBy('date_added')
        .reverse()
        .filter((bookmark: any) => !bookmark.is_archived);
    }
  }

  static async getBookmarksWithAssetCounts(bookmarkIds: number[]): Promise<Map<number, boolean>> {
    const assetCounts = new Map<number, boolean>();
    
    for (const bookmarkId of bookmarkIds) {
      const assets = await db.assets
        .where('bookmark_id').equals(bookmarkId)
        .and(asset => asset.status === 'complete')
        .count();
      assetCounts.set(bookmarkId, assets > 0);
    }
    
    return assetCounts;
  }

  static async saveReadProgress(progress: ReadProgress): Promise<void> {
    // Check if a record already exists for this bookmark
    const existing = await db.readProgress
      .where('bookmark_id').equals(progress.bookmark_id)
      .first();
    
    if (existing) {
      // Update existing record by preserving the id
      const existingWithId = existing as any;
      await db.readProgress.put({ ...progress, id: existingWithId.id } as any);
    } else {
      // Create new record
      await db.readProgress.put(progress);
    }
  }

  static async getReadProgress(bookmarkId: number): Promise<ReadProgress | undefined> {
    return await db.readProgress
      .where('bookmark_id').equals(bookmarkId)
      .first();
  }

  static async getAllReadProgress(): Promise<ReadProgress[]> {
    return await db.readProgress.toArray();
  }

  static async saveSettings(settings: AppSettings): Promise<void> {
    await db.settings.clear();
    await db.settings.add(settings);
  }

  static async getSettings(): Promise<AppSettings | undefined> {
    return await db.settings.toCollection().first();
  }

  static async clearAll(): Promise<void> {
    await db.bookmarks.clear();
    await db.readProgress.clear();
  }

  static async getLastSyncTimestamp(): Promise<string | null> {
    const metadata = await db.syncMetadata.toCollection().first();
    const timestamp = metadata?.last_sync_timestamp;
    return timestamp && timestamp.trim() !== '' ? timestamp : null;
  }

  static async setLastSyncTimestamp(timestamp: string): Promise<void> {
    await db.syncMetadata.clear();
    await db.syncMetadata.add({
      last_sync_timestamp: timestamp,
      unarchived_offset: 0,
      archived_offset: 0
    });
  }

  static async markBookmarkAsRead(bookmarkId: number): Promise<void> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      bookmark.unread = false;
      bookmark.needs_read_sync = 1; // 1=true for indexing compatibility
      await db.bookmarks.put(bookmark);
    }
  }

  static async getBookmarksNeedingReadSync(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('needs_read_sync').equals(1).toArray();
  }

  static async markBookmarkReadSynced(bookmarkId: number): Promise<void> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      bookmark.needs_read_sync = 0; // 0=false for indexing compatibility
      await db.bookmarks.put(bookmark);
    }
  }

  static async getBookmarksNeedingAssetSync(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('needs_asset_sync').equals(1).toArray();
  }

  static async markBookmarkAssetSynced(bookmarkId: number): Promise<void> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      bookmark.needs_asset_sync = 0; // 0=false for indexing compatibility
      await db.bookmarks.put(bookmark);
    }
  }

  static async saveAsset(asset: LocalAsset): Promise<void> {
    await db.assets.put(asset);
  }

  static async getAllAssets(): Promise<LocalAsset[]> {
    return await db.assets.toArray();
  }

  static async getAssetsByBookmarkId(bookmarkId: number): Promise<LocalAsset[]> {
    return await db.assets.where('bookmark_id').equals(bookmarkId).toArray();
  }

  static async getCompletedAssetsByBookmarkId(bookmarkId: number): Promise<LocalAsset[]> {
    return await db.assets
      .where('bookmark_id').equals(bookmarkId)
      .and(asset => asset.status === 'complete')
      .toArray();
  }

  static async getAsset(id: number): Promise<LocalAsset | undefined> {
    return await db.assets.get(id);
  }

  static async deleteAssetsByBookmarkId(bookmarkId: number): Promise<void> {
    await db.assets.where('bookmark_id').equals(bookmarkId).delete();
  }

  static async clearAssetContent(assetId: string): Promise<void> {
    const asset = await db.assets.get(assetId);
    if (asset) {
      // Clear content but keep metadata
      delete asset.content;
      await db.assets.put(asset);
    }
  }

  static async deleteAsset(id: string): Promise<void> {
    await db.assets.delete(id);
  }

  // Sync State Management (using SyncMetadata)

  static async getSyncRetryCount(): Promise<number> {
    const metadata = await db.syncMetadata.toCollection().first();
    return metadata?.retry_count || 0;
  }

  static async incrementSyncRetryCount(): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    const currentCount = metadata?.retry_count || 0;
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { retry_count: currentCount + 1 });
    } else {
      await db.syncMetadata.add({
        last_sync_timestamp: '',
        retry_count: 1
      });
    }
  }

  static async resetSyncRetryCount(): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { retry_count: 0 });
    }
  }

  static async setLastSyncError(error: string | null): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      if (error) {
        await db.syncMetadata.update(metadata.id!, { last_error: error });
      } else {
        await db.syncMetadata.update(metadata.id!, { last_error: undefined } as any);
      }
    } else {
      if (error) {
        await db.syncMetadata.add({
          last_sync_timestamp: '',
          last_error: error
        });
      } else {
        await db.syncMetadata.add({ last_sync_timestamp: '' });
      }
    }
  }

  static async getLastSyncError(): Promise<string | null> {
    const metadata = await db.syncMetadata.toCollection().first();
    return metadata?.last_error || null;
  }

  // New pagination offset methods
  static async getUnarchivedOffset(): Promise<number> {
    const metadata = await db.syncMetadata.toCollection().first();
    return metadata?.unarchived_offset || 0;
  }

  static async setUnarchivedOffset(offset: number): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { unarchived_offset: offset });
    } else {
      await db.syncMetadata.add({
        last_sync_timestamp: '',
        unarchived_offset: offset
      });
    }
  }

  static async getArchivedOffset(): Promise<number> {
    const metadata = await db.syncMetadata.toCollection().first();
    return metadata?.archived_offset || 0;
  }

  static async setArchivedOffset(offset: number): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { archived_offset: offset });
    } else {
      await db.syncMetadata.add({
        last_sync_timestamp: '',
        archived_offset: offset
      });
    }
  }

  // Retry queue methods for Background Sync fallback
  static async saveSyncRetryQueue(queue: Array<{ tag: string; timestamp: number; retryCount: number }>): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { retry_queue: JSON.stringify(queue) });
    } else {
      await db.syncMetadata.add({
        last_sync_timestamp: '',
        retry_queue: JSON.stringify(queue)
      });
    }
  }

  static async getSyncRetryQueue(): Promise<Array<{ tag: string; timestamp: number; retryCount: number }> | null> {
    const metadata = await db.syncMetadata.toCollection().first();
    const queueData = metadata?.retry_queue;
    if (!queueData) {
      return null;
    }

    try {
      return JSON.parse(queueData);
    } catch (error) {
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'database', 'Failed to parse retry queue data');
      return null;
    }
  }

  // Manual pause state management
  static async setManualPauseState(isManualPause: boolean): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { is_manual_pause: isManualPause });
    } else {
      await db.syncMetadata.add({
        last_sync_timestamp: '',
        is_manual_pause: isManualPause
      });
    }
  }

  static async getManualPauseState(): Promise<boolean> {
    const metadata = await db.syncMetadata.toCollection().first();
    return metadata?.is_manual_pause || false;
  }

  static async clearManualPauseState(): Promise<void> {
    const metadata = await db.syncMetadata.toCollection().first();
    if (metadata) {
      await db.syncMetadata.update(metadata.id!, { is_manual_pause: undefined } as any);
    }
  }

}