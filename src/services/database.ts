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