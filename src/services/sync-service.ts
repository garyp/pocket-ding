import { createLinkdingAPI, type LinkdingAPI } from './linkding-api';
import { DatabaseService } from './database';
import { FaviconService } from './favicon-service';
import type { LocalBookmark, AppSettings, LocalAsset } from '../types';

export interface SyncEvents {
  'sync-initiated': {};
  'sync-started': { total: number };
  'sync-progress': { current: number; total: number };
  'bookmark-synced': { bookmark: LocalBookmark; current: number; total: number };
  'sync-completed': { processed: number };
  'sync-error': { error: Error };
}

export class SyncService extends EventTarget {
  private static instance: SyncService | null = null;
  private static isSyncing = false;
  private static syncPromise: Promise<void> | null = null;
  private static currentSyncProgress = 0;
  private static currentSyncTotal = 0;
  

  static getInstance(): SyncService {
    if (!this.instance) {
      this.instance = new SyncService();
    }
    return this.instance;
  }


  static isSyncInProgress(): boolean {
    return this.isSyncing;
  }

  static getCurrentSyncProgress(): { current: number; total: number } {
    return {
      current: this.currentSyncProgress,
      total: this.currentSyncTotal
    };
  }

  static async syncBookmarks(settings: AppSettings, onProgress?: (current: number, total: number) => void): Promise<void> {
    if (this.isSyncing) {
      return this.syncPromise!;
    }

    this.isSyncing = true;
    this.currentSyncProgress = 0;
    this.currentSyncTotal = 0;
    
    // Emit immediate sync initiated event for instant UI feedback
    const syncInstance = this.getInstance();
    syncInstance.dispatchEvent(new CustomEvent('sync-initiated', { detail: {} }));
    
    this.syncPromise = this.performSync(settings, onProgress);
    
    try {
      await this.syncPromise;
    } finally {
      this.isSyncing = false;
      this.currentSyncProgress = 0;
      this.currentSyncTotal = 0;
      this.syncPromise = null;
    }
  }

  private static async performSync(settings: AppSettings, onProgress?: (current: number, total: number) => void): Promise<void> {
    const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);
    const syncInstance = this.getInstance();
    
    try {
      console.log('Starting sync...');
      
      // Get last sync timestamp for incremental sync
      const lastSyncTimestamp = await DatabaseService.getLastSyncTimestamp();
      const syncStartTime = new Date().toISOString();
      
      console.log(lastSyncTimestamp ? `Incremental sync since: ${lastSyncTimestamp}` : 'Full sync');
      
      const remoteBookmarks = await api.getAllBookmarks(lastSyncTimestamp || undefined);
      const localBookmarks = await DatabaseService.getAllBookmarks();
      
      // Debug logging for archived bookmarks
      const archivedCount = remoteBookmarks.filter(b => b.is_archived).length;
      console.log(`Remote bookmarks: ${remoteBookmarks.length} total, ${archivedCount} archived`);
      
      // Create a map of local bookmarks for efficient lookup
      const localBookmarksMap = new Map(localBookmarks.map(b => [b.id, b]));
      
      let processed = 0;
      const total = remoteBookmarks.length;
      
      // Update static sync state
      this.currentSyncProgress = processed;
      this.currentSyncTotal = total;
      
      // Emit sync started event
      syncInstance.dispatchEvent(new CustomEvent('sync-started', {
        detail: { total }
      }));
      
      onProgress?.(processed, total);

      for (const remoteBookmark of remoteBookmarks) {
        const localBookmark = localBookmarksMap.get(remoteBookmark.id);
        
        // Check if bookmark needs updating
        const needsUpdate = !localBookmark || 
                           new Date(remoteBookmark.date_modified) > new Date(localBookmark.date_modified);
        
        if (needsUpdate) {
          const bookmarkToSave: LocalBookmark = {
            ...remoteBookmark,
            last_read_at: localBookmark?.last_read_at,
            read_progress: localBookmark?.read_progress,
            reading_mode: localBookmark?.reading_mode,
            is_synced: true
          } as LocalBookmark;

          await DatabaseService.saveBookmark(bookmarkToSave);
          
          // Handle asset management based on archive status
          if (remoteBookmark.is_archived) {
            // For archived bookmarks: sync metadata but clean up cached content
            await this.syncArchivedBookmarkAssets(api, remoteBookmark.id, localBookmark);
          } else {
            // For unarchived bookmarks: full asset sync with content caching
            await this.syncBookmarkAssets(api, remoteBookmark.id);
          }

          // For unarchived bookmarks, preload favicon in background
          // Archived bookmarks will load favicons on-demand only
          if (remoteBookmark.favicon_url && !remoteBookmark.is_archived) {
            FaviconService.preloadFavicon(remoteBookmark.id, remoteBookmark.favicon_url);
          }

          // Emit bookmark synced event
          syncInstance.dispatchEvent(new CustomEvent('bookmark-synced', {
            detail: { bookmark: bookmarkToSave, current: processed + 1, total }
          }));
        }

        processed++;
        
        // Update static sync state
        this.currentSyncProgress = processed;
        
        // Emit progress event
        syncInstance.dispatchEvent(new CustomEvent('sync-progress', {
          detail: { current: processed, total }
        }));
        
        onProgress?.(processed, total);
        
        // Yield control periodically to allow UI updates
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      // Sync read status back to Linkding
      await this.syncReadStatusToLinkding(api);

      // Update last sync timestamp on successful completion
      await DatabaseService.setLastSyncTimestamp(syncStartTime);
      
      // Emit sync completed event
      syncInstance.dispatchEvent(new CustomEvent('sync-completed', {
        detail: { processed }
      }));
      
      console.log(`Sync completed: ${processed} bookmarks processed`);
    } catch (error) {
      console.error('Sync failed:', error);
      
      // Emit sync error event
      syncInstance.dispatchEvent(new CustomEvent('sync-error', {
        detail: { error }
      }));
      
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

  private static async syncArchivedBookmarkAssets(api: LinkdingAPI, bookmarkId: number, localBookmark?: LocalBookmark): Promise<void> {
    try {
      // Get remote assets for this bookmark to keep metadata in sync
      const remoteAssets = await api.getBookmarkAssets(bookmarkId);
      
      // Validate that remoteAssets is an array
      if (!Array.isArray(remoteAssets)) {
        console.warn(`getBookmarkAssets returned non-array for archived bookmark ${bookmarkId}:`, remoteAssets);
        return;
      }
      
      // Filter to only completed assets
      const completedAssets = remoteAssets.filter(asset => asset.status === 'complete');
      
      // Save asset metadata without content (for on-demand fetching later)
      for (const remoteAsset of completedAssets) {
        const localAsset: LocalAsset = {
          ...remoteAsset,
          bookmark_id: bookmarkId
          // content and cached_at are omitted for archived bookmarks
        };
        
        await DatabaseService.saveAsset(localAsset);
      }
      
      // Clean up any previously cached content if bookmark was just archived
      if (localBookmark && !localBookmark.is_archived) {
        console.log(`Cleaning up cached assets for newly archived bookmark ${bookmarkId}`);
        await DatabaseService.clearAssetContent(bookmarkId);
      }
      
      console.log(`Synced metadata for ${completedAssets.length} assets for archived bookmark ${bookmarkId}`);
    } catch (error) {
      console.error(`Failed to sync assets for archived bookmark ${bookmarkId}:`, error);
      // Don't throw - continue with other bookmarks
    }
  }

  private static async syncBookmarkAssets(api: LinkdingAPI, bookmarkId: number): Promise<void> {
    try {
      // Get remote assets for this bookmark
      const remoteAssets = await api.getBookmarkAssets(bookmarkId);
      
      // Validate that remoteAssets is an array
      if (!Array.isArray(remoteAssets)) {
        console.warn(`getBookmarkAssets returned non-array for bookmark ${bookmarkId}:`, remoteAssets);
        return;
      }
      
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
      if (error instanceof TypeError && error.message.includes('filter is not a function')) {
        console.error('This error suggests the API returned a non-array. Check the Linkding server response.');
      }
      // Don't throw - continue with other bookmarks
    }
  }
}