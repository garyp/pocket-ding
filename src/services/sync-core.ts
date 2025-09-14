import type { AppSettings, LocalAsset, LocalBookmark } from '../types';
import { LinkdingAPIService } from './linkding-api';
import { DatabaseService } from './database';

export interface SyncProgress {
  current: number;
  total: number;
  phase: 'init' | 'bookmarks' | 'assets' | 'read-status' | 'complete';
}

export interface SyncResult {
  success: boolean;
  processed: number;
  error?: Error;
  timestamp: number;
}

export interface SyncCheckpoint {
  lastProcessedId?: number;
  phase: 'bookmarks' | 'assets' | 'read-status';
  timestamp: number;
}

/**
 * Core sync logic that can be used in both main app and service worker contexts
 * This class contains the pure sync logic without UI dependencies
 */
export class SyncCore {
  #onProgress?: (progress: SyncProgress) => void;
  #abortController?: AbortController;
  
  constructor(onProgress?: (progress: SyncProgress) => void) {
    this.#onProgress = onProgress;
  }

  /**
   * Perform a complete sync operation
   */
  async performSync(settings: AppSettings, checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    const startTime = Date.now();
    this.#abortController = new AbortController();
    
    try {
      // Initialize API service
      const api = new LinkdingAPIService(settings.linkding_url, settings.linkding_api_key);
      
      // Get last sync timestamp for incremental sync
      const lastSyncTimestamp = checkpoint ? null : await DatabaseService.getLastSyncTimestamp();
      const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : undefined;
      
      // Phase 1: Sync bookmarks
      if (!checkpoint || checkpoint.phase === 'bookmarks') {
        await this.#syncBookmarks(api, modifiedSince, checkpoint?.lastProcessedId);
      }
      
      // Phase 2: Sync assets for unarchived bookmarks
      if (!checkpoint || checkpoint.phase === 'assets') {
        await this.#syncAssets(api, checkpoint?.lastProcessedId);
      }
      
      // Phase 3: Sync read status back to server
      if (!checkpoint || checkpoint.phase === 'read-status') {
        await this.#syncReadStatus(api);
      }
      
      // Update last sync timestamp and clear checkpoint on success
      if (!checkpoint) {
        await DatabaseService.setLastSyncTimestamp(Date.now().toString());
      }
      await DatabaseService.clearSyncCheckpoint();
      
      const processed = await this.#getProcessedCount();
      this.#reportProgress({ current: processed, total: processed, phase: 'complete' });
      
      return {
        success: true,
        processed,
        timestamp: Date.now()
      };
    } catch (error) {
      console.error('Sync failed:', error);
      return {
        success: false,
        processed: 0,
        error: error instanceof Error ? error : new Error('Unknown sync error'),
        timestamp: Date.now()
      };
    } finally {
      this.#abortController = undefined;
    }
  }
  
  /**
   * Cancel the current sync operation
   */
  cancelSync(): void {
    this.#abortController?.abort();
  }
  
  async #syncBookmarks(api: LinkdingAPIService, modifiedSince?: string, lastProcessedId?: number): Promise<void> {
    const bookmarks = await api.getAllBookmarks();
    
    // Filter bookmarks modified since last sync if applicable
    const bookmarksToSync = modifiedSince 
      ? bookmarks.filter(b => new Date(b.date_modified) > new Date(modifiedSince))
      : bookmarks;
    
    // Resume from checkpoint if provided
    const startIndex = lastProcessedId 
      ? bookmarksToSync.findIndex(b => b.id > lastProcessedId)
      : 0;
    
    const totalBookmarks = bookmarksToSync.length;
    this.#reportProgress({ current: 0, total: totalBookmarks, phase: 'bookmarks' });
    
    for (let i = startIndex; i < bookmarksToSync.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const remoteBookmark = bookmarksToSync[i];
      
      // Save checkpoint periodically (every 10 bookmarks)
      if (i > 0 && i % 10 === 0 && !checkpoint) {
        await DatabaseService.setSyncCheckpoint({
          lastProcessedId: remoteBookmark.id,
          phase: 'bookmarks',
          timestamp: Date.now()
        });
      }
      
      const existingBookmark = await DatabaseService.getBookmark(remoteBookmark.id);
      
      // Preserve local reading state while updating metadata
      const localBookmark: LocalBookmark = {
        ...remoteBookmark,
        reading_progress: existingBookmark?.reading_progress || 0,
        scroll_position: existingBookmark?.scroll_position || 0,
        reading_mode: existingBookmark?.reading_mode || 'original',
        is_read: existingBookmark?.is_read || remoteBookmark.unread === false,
        needs_read_sync: existingBookmark?.needs_read_sync || false,
        dark_mode_override: existingBookmark?.dark_mode_override
      };
      
      await DatabaseService.saveBookmark(localBookmark);
      
      // Clear cached content for archived bookmarks
      if (remoteBookmark.is_archived) {
        const assets = await DatabaseService.getAssetsByBookmarkId(remoteBookmark.id);
        for (const asset of assets) {
          await DatabaseService.clearAssetContent(asset.id);
        }
      }
      
      this.#reportProgress({ current: i + 1, total: totalBookmarks, phase: 'bookmarks' });
    }
    
    // Clean up deleted bookmarks
    await this.#cleanupDeletedBookmarks(bookmarks.map(b => b.id));
  }
  
  async #syncAssets(api: LinkdingAPIService, lastProcessedId?: number): Promise<void> {
    const unarchivedBookmarks = await DatabaseService.getUnarchivedBookmarks();
    
    // Resume from checkpoint if provided
    const startIndex = lastProcessedId 
      ? unarchivedBookmarks.findIndex(b => b.id > lastProcessedId)
      : 0;
    
    const totalAssets = unarchivedBookmarks.length;
    this.#reportProgress({ current: 0, total: totalAssets, phase: 'assets' });
    
    for (let i = startIndex; i < unarchivedBookmarks.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const bookmark = unarchivedBookmarks[i];
      
      // Save checkpoint periodically (every 5 assets)
      if (i > 0 && i % 5 === 0 && !checkpoint) {
        await DatabaseService.setSyncCheckpoint({
          lastProcessedId: bookmark.id,
          phase: 'assets',
          timestamp: Date.now()
        });
      }
      
      try {
        // Check if asset already exists
        const existingAssets = await DatabaseService.getAssetsByBookmarkId(bookmark.id);
        if (existingAssets.length === 0) {
          // Download and save asset
          const assetData = await api.getBookmarkAsset(bookmark.id);
          if (assetData) {
            const asset: LocalAsset = {
              id: `${bookmark.id}_${Date.now()}`,
              bookmark_id: bookmark.id,
              content: assetData.content,
              content_type: assetData.content_type,
              status: assetData.status,
              status_code: assetData.status_code,
              timestamp: Date.now()
            };
            await DatabaseService.saveAsset(asset);
          }
        }
      } catch (error) {
        console.error(`Failed to sync asset for bookmark ${bookmark.id}:`, error);
        // Continue with other assets
      }
      
      this.#reportProgress({ current: i + 1, total: totalAssets, phase: 'assets' });
    }
  }
  
  async #syncReadStatus(api: LinkdingAPIService): Promise<void> {
    const bookmarksToSync = await DatabaseService.getBookmarksNeedingReadSync();
    
    const total = bookmarksToSync.length;
    this.#reportProgress({ current: 0, total, phase: 'read-status' });
    
    for (let i = 0; i < bookmarksToSync.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const bookmark = bookmarksToSync[i];
      
      // Save checkpoint periodically
      if (i > 0 && i % 10 === 0 && !checkpoint) {
        await DatabaseService.setSyncCheckpoint({
          lastProcessedId: bookmark.id,
          phase: 'read-status',
          timestamp: Date.now()
        });
      }
      
      try {
        await api.markBookmarkAsRead(bookmark.id);
        await DatabaseService.markBookmarkReadSynced(bookmark.id);
      } catch (error) {
        console.error(`Failed to sync read status for bookmark ${bookmark.id}:`, error);
        // Continue with other bookmarks
      }
      
      this.#reportProgress({ current: i + 1, total, phase: 'read-status' });
    }
  }
  
  async #cleanupDeletedBookmarks(remoteBookmarkIds: number[]): Promise<void> {
    const localBookmarks = await DatabaseService.getAllBookmarks();
    const remoteIdSet = new Set(remoteBookmarkIds);
    
    for (const localBookmark of localBookmarks) {
      if (!remoteIdSet.has(localBookmark.id)) {
        // Delete bookmark and its assets
        const assets = await DatabaseService.getAssetsByBookmarkId(localBookmark.id);
        for (const asset of assets) {
          await DatabaseService.deleteAsset(asset.id);
        }
        await DatabaseService.deleteBookmark(localBookmark.id);
      }
    }
  }
  
  async #getProcessedCount(): Promise<number> {
    const bookmarks = await DatabaseService.getAllBookmarks();
    return bookmarks.length;
  }
  
  #reportProgress(progress: SyncProgress): void {
    this.#onProgress?.(progress);
  }
}