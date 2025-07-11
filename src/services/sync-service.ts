import { LinkdingAPI } from './linkding-api';
import { ContentFetcher } from './content-fetcher';
import { DatabaseService } from './database';
import type { LocalBookmark, AppSettings, LocalAsset } from '../types';

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
      
      // Get last sync timestamp for incremental sync
      const lastSyncTimestamp = await DatabaseService.getLastSyncTimestamp();
      const syncStartTime = new Date().toISOString();
      
      console.log(lastSyncTimestamp ? `Incremental sync since: ${lastSyncTimestamp}` : 'Full sync');
      
      const remoteBookmarks = await api.getAllBookmarks(lastSyncTimestamp || undefined);
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
          } as LocalBookmark;

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
          
          // Sync assets for this bookmark
          await this.syncBookmarkAssets(api, remoteBookmark.id);
        }

        processed++;
        onProgress?.(processed, total);
      }

      // Sync read status back to Linkding
      await this.syncReadStatusToLinkding(api);

      // Update last sync timestamp on successful completion
      await DatabaseService.setLastSyncTimestamp(syncStartTime);
      
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

  static async fullSync(settings: AppSettings, onProgress?: (current: number, total: number) => void): Promise<void> {
    // Clear last sync timestamp to force full sync
    await DatabaseService.setLastSyncTimestamp('');
    await this.syncBookmarks(settings, onProgress);
  }

  private static async syncReadStatusToLinkding(api: LinkdingAPI): Promise<void> {
    try {
      const bookmarksNeedingSync = await DatabaseService.getBookmarksNeedingReadSync();
      
      for (const bookmark of bookmarksNeedingSync) {
        try {
          console.log(`Syncing read status for bookmark ${bookmark.id} to Linkding`);
          await api.markBookmarkAsRead(bookmark.id);
          await DatabaseService.markBookmarkReadSynced(bookmark.id);
          console.log(`Successfully synced read status for bookmark ${bookmark.id}`);
        } catch (error) {
          console.error(`Failed to sync read status for bookmark ${bookmark.id}:`, error);
          // Continue with other bookmarks even if one fails
        }
      }
      
      if (bookmarksNeedingSync.length > 0) {
        console.log(`Synced read status for ${bookmarksNeedingSync.length} bookmarks`);
      }
    } catch (error) {
      console.error('Failed to sync read status to Linkding:', error);
      // Don't throw here - we don't want read sync failures to break the main sync
    }
  }

  private static async syncBookmarkAssets(api: LinkdingAPI, bookmarkId: number): Promise<void> {
    try {
      // Get remote assets for this bookmark
      const remoteAssets = await api.getBookmarkAssets(bookmarkId);
      
      // Filter to only completed assets
      const completedAssets = remoteAssets.filter(asset => asset.status === 'complete');
      
      // Get existing local assets
      const localAssets = await DatabaseService.getAssetsByBookmarkId(bookmarkId);
      
      // Sync each completed asset
      for (const remoteAsset of completedAssets) {
        const existingAsset = localAssets.find(a => a.id === remoteAsset.id);
        
        // Skip if asset already exists and is cached
        if (existingAsset?.content && existingAsset.cached_at) {
          continue;
        }
        
        try {
          // Download asset content
          const content = await api.downloadAsset(bookmarkId, remoteAsset.id);
          
          const localAsset: LocalAsset = {
            ...remoteAsset,
            bookmark_id: bookmarkId,
            content,
            cached_at: new Date().toISOString()
          };
          
          await DatabaseService.saveAsset(localAsset);
          console.log(`Downloaded asset ${remoteAsset.id} for bookmark ${bookmarkId}`);
        } catch (error) {
          console.error(`Failed to download asset ${remoteAsset.id} for bookmark ${bookmarkId}:`, error);
        }
      }
      
      // Clean up assets that no longer exist remotely
      const remoteAssetIds = new Set(completedAssets.map(a => a.id));
      for (const localAsset of localAssets) {
        if (!remoteAssetIds.has(localAsset.id)) {
          // TODO: Remove this asset from local storage
          console.log(`Asset ${localAsset.id} no longer exists remotely, should be cleaned up`);
        }
      }
    } catch (error) {
      console.error(`Failed to sync assets for bookmark ${bookmarkId}:`, error);
      // Don't throw - continue with other bookmarks
    }
  }
}