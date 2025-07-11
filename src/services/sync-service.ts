import { LinkdingAPI } from './linkding-api';
import { ContentFetcher } from './content-fetcher';
import { DatabaseService } from './database';
import { LocalBookmark, AppSettings } from '../types';

export class SyncService {
  private static isSyncing = false;
  private static syncPromise: Promise<void> | null = null;

  static async syncBookmarks(settings: AppSettings, onProgress?: (current: number, total: number) => void): Promise<void> {
    if (this.isSyncing) {
      return this.syncPromise!;
    }

    this.isSyncing = true;
    this.syncPromise = this.performSync(settings, onProgress);
    
    try {
      await this.syncPromise;
    } finally {
      this.isSyncing = false;
      this.syncPromise = null;
    }
  }

  private static async performSync(settings: AppSettings, onProgress?: (current: number, total: number) => void): Promise<void> {
    const api = new LinkdingAPI(settings.linkding_url, settings.linkding_token);
    
    try {
      console.log('Starting sync...');
      const remoteBookmarks = await api.getAllBookmarks();
      const localBookmarks = await DatabaseService.getAllBookmarks();
      
      // Create a map of local bookmarks for efficient lookup
      const localBookmarksMap = new Map(localBookmarks.map(b => [b.id, b]));
      
      let processed = 0;
      const total = remoteBookmarks.length;
      
      onProgress?.(processed, total);

      for (const remoteBookmark of remoteBookmarks) {
        const localBookmark = localBookmarksMap.get(remoteBookmark.id);
        
        // Check if bookmark needs updating
        const needsUpdate = !localBookmark || 
                           new Date(remoteBookmark.date_modified) > new Date(localBookmark.date_modified);
        
        if (needsUpdate) {
          const bookmarkToSave: LocalBookmark = {
            ...remoteBookmark,
            content: localBookmark?.content,
            readability_content: localBookmark?.readability_content,
            cached_at: localBookmark?.cached_at,
            last_read_at: localBookmark?.last_read_at,
            read_progress: localBookmark?.read_progress,
            reading_mode: localBookmark?.reading_mode,
            is_synced: true
          };

          // If bookmark doesn't have content cached, fetch it
          if (!bookmarkToSave.content) {
            try {
              const { content, readability_content } = await ContentFetcher.fetchBookmarkContent(bookmarkToSave);
              bookmarkToSave.content = content;
              bookmarkToSave.readability_content = readability_content;
              bookmarkToSave.cached_at = new Date().toISOString();
            } catch (error) {
              console.error(`Failed to fetch content for bookmark ${remoteBookmark.id}:`, error);
            }
          }

          await DatabaseService.saveBookmark(bookmarkToSave);
        }

        processed++;
        onProgress?.(processed, total);
      }

      console.log(`Sync completed: ${processed} bookmarks processed`);
    } catch (error) {
      console.error('Sync failed:', error);
      throw error;
    }
  }

  static async backgroundSync(settings: AppSettings): Promise<void> {
    if (!settings.auto_sync) return;
    
    try {
      await this.syncBookmarks(settings);
    } catch (error) {
      console.error('Background sync failed:', error);
    }
  }
}