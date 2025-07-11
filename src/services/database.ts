import Dexie, { type Table } from 'dexie';
import type { LocalBookmark, ReadProgress, AppSettings } from '../types';

export class LinkdingDatabase extends Dexie {
  bookmarks!: Table<LocalBookmark>;
  readProgress!: Table<ReadProgress>;
  settings!: Table<AppSettings>;

  constructor() {
    super('LinkdingReaderDB');
    this.version(1).stores({
      bookmarks: '++id, url, title, is_archived, unread, date_added, cached_at, last_read_at',
      readProgress: '++id, bookmark_id, last_read_at',
      settings: '++id, linkding_url, linkding_token'
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
    await db.readProgress.put(progress);
  }

  static async getReadProgress(bookmarkId: number): Promise<ReadProgress | undefined> {
    return await db.readProgress.where('bookmark_id').equals(bookmarkId).first();
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
}