import Dexie, { type Table } from 'dexie';
import type { LocalBookmark, ReadProgress, AppSettings, LocalAsset } from '../types';

interface SyncMetadata {
  id?: number;
  last_sync_timestamp: string;
}

export class LinkdingDatabase extends Dexie {
  bookmarks!: Table<LocalBookmark>;
  readProgress!: Table<ReadProgress>;
  settings!: Table<AppSettings>;
  syncMetadata!: Table<SyncMetadata>;
  assets!: Table<LocalAsset>;

  constructor() {
    super('LinkdingReaderDB');
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
  }
}

export const db = new LinkdingDatabase();

export class DatabaseService {
  static async saveBookmark(bookmark: LocalBookmark): Promise<void> {
    await db.bookmarks.put(bookmark);
  }

  static async getBookmark(id: number): Promise<LocalBookmark | undefined> {
    return await db.bookmarks.get(id);
  }

  static async getAllBookmarks(): Promise<LocalBookmark[]> {
    return await db.bookmarks.orderBy('date_added').reverse().toArray();
  }

  static async getUnreadBookmarks(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('unread').equals(1).toArray();
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
      console.warn('Failed to find anchor bookmark page, falling back to page', fallbackPage);
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
    await db.readProgress.put(progress);
  }

  static async getReadProgress(bookmarkId: number): Promise<ReadProgress | undefined> {
    const results = await db.readProgress
      .where('bookmark_id').equals(bookmarkId)
      .toArray();
    
    if (results.length === 0) return undefined;
    
    // Sort by last_read_at descending to get the most recent
    return results.sort((a, b) => new Date(b.last_read_at).getTime() - new Date(a.last_read_at).getTime())[0];
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
    await db.syncMetadata.add({ last_sync_timestamp: timestamp });
  }

  static async markBookmarkAsRead(bookmarkId: number): Promise<void> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      bookmark.unread = false;
      bookmark.needs_read_sync = true;
      await db.bookmarks.put(bookmark);
    }
  }

  static async getBookmarksNeedingReadSync(): Promise<LocalBookmark[]> {
    return await db.bookmarks.where('needs_read_sync').equals(1).toArray();
  }

  static async markBookmarkReadSynced(bookmarkId: number): Promise<void> {
    const bookmark = await db.bookmarks.get(bookmarkId);
    if (bookmark) {
      bookmark.needs_read_sync = false;
      await db.bookmarks.put(bookmark);
    }
  }

  static async saveAsset(asset: LocalAsset): Promise<void> {
    await db.assets.put(asset);
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

  static async clearAssetContent(bookmarkId: number): Promise<void> {
    const assets = await this.getAssetsByBookmarkId(bookmarkId);
    for (const asset of assets) {
      // Clear content but keep metadata
      delete asset.content;
      delete asset.cached_at;
      await this.saveAsset(asset);
    }
  }
}