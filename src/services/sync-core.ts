import type { AppSettings, LocalAsset, LocalBookmark } from '../types';
import { createLinkdingAPI, type LinkdingAPI } from './linkding-api';
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
    this.#onProgress = onProgress ?? undefined;
  }

  /**
   * Perform a complete sync operation
   */
  async performSync(settings: AppSettings, checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    this.#abortController = new AbortController();
    
    try {
      // Initialize API service
      const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);
      
      // Get last sync timestamp for incremental sync
      const lastSyncTimestamp = checkpoint ? null : await DatabaseService.getLastSyncTimestamp();
      const modifiedSince = lastSyncTimestamp ? new Date(lastSyncTimestamp).toISOString() : undefined;
      
      // Report initial progress
      this.#reportProgress({ current: 0, total: 1, phase: 'init' });
      
      // Sync based on checkpoint phase
      if (!checkpoint || checkpoint.phase === 'bookmarks') {
        await this.#syncBookmarks(api, modifiedSince, checkpoint?.lastProcessedId);
        if (checkpoint) {
          await DatabaseService.clearSyncCheckpoint();
        }
      }
      
      if (!checkpoint || checkpoint.phase === 'assets') {
        await this.#syncAssets(api, checkpoint?.lastProcessedId);
        if (checkpoint) {
          await DatabaseService.clearSyncCheckpoint();
        }
      }
      
      if (!checkpoint || checkpoint.phase === 'read-status') {
        await this.#syncReadStatus(api);
        if (checkpoint) {
          await DatabaseService.clearSyncCheckpoint();
        }
      }
      
      // Update last sync timestamp
      await DatabaseService.setLastSyncTimestamp(Date.now());
      
      // Report completion
      this.#reportProgress({ current: 1, total: 1, phase: 'complete' });
      
      return {
        success: true,
        processed: 0, // TODO: Track actual count
        timestamp: Date.now()
      };
    } catch (error) {
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
  
  async #syncBookmarks(api: LinkdingAPI, modifiedSince?: string, lastProcessedId?: number): Promise<void> {
    const bookmarks = await api.getAllBookmarks();
    
    // Filter bookmarks modified since last sync if applicable
    const bookmarksToSync = modifiedSince 
      ? bookmarks.filter((b: any) => new Date(b.date_modified) > new Date(modifiedSince))
      : bookmarks;
    
    // Resume from checkpoint if provided
    const startIndex = lastProcessedId 
      ? bookmarksToSync.findIndex((b: any) => b.id > lastProcessedId)
      : 0;
    
    const total = bookmarksToSync.length - startIndex;
    this.#reportProgress({ current: 0, total, phase: 'bookmarks' });
    
    for (let i = startIndex; i < bookmarksToSync.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const bookmark = bookmarksToSync[i];
      
      // Save checkpoint periodically (every 10 bookmarks)
      if (i > startIndex && (i - startIndex) % 10 === 0) {
        await DatabaseService.setSyncCheckpoint({
          lastProcessedId: bookmark.id,
          phase: 'bookmarks',
          timestamp: Date.now()
        });
      }
      
      // Convert to LocalBookmark and save
      const localBookmark: LocalBookmark = {
        ...bookmark,
        is_synced: true
      };
      await DatabaseService.saveBookmark(localBookmark);
      
      this.#reportProgress({ 
        current: i - startIndex + 1, 
        total, 
        phase: 'bookmarks' 
      });
    }
  }
  
  async #syncAssets(api: LinkdingAPI, lastProcessedId?: number): Promise<void> {
    // Get all bookmarks that need asset sync
    const bookmarks = await DatabaseService.getAllBookmarks();
    
    // Resume from checkpoint if provided
    const startIndex = lastProcessedId 
      ? bookmarks.findIndex((b: LocalBookmark) => b.id > lastProcessedId)
      : 0;
    
    const bookmarksToProcess = bookmarks.slice(startIndex);
    const totalAssets = bookmarksToProcess.length;
    
    this.#reportProgress({ current: 0, total: totalAssets, phase: 'assets' });
    
    for (let i = 0; i < bookmarksToProcess.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const bookmark = bookmarksToProcess[i];
      
      // Save checkpoint periodically (every 5 assets)
      if (i > 0 && i % 5 === 0) {
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
  
  async #syncReadStatus(api: LinkdingAPI): Promise<void> {
    const bookmarksToSync = await DatabaseService.getBookmarksNeedingReadSync();
    
    const total = bookmarksToSync.length;
    this.#reportProgress({ current: 0, total, phase: 'read-status' });
    
    for (let i = 0; i < bookmarksToSync.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const bookmark = bookmarksToSync[i];
      
      // Save checkpoint periodically
      if (i > 0 && i % 10 === 0) {
        await DatabaseService.setSyncCheckpoint({
          lastProcessedId: bookmark.id,
          phase: 'read-status',
          timestamp: Date.now()
        });
      }
      
      try {
        // Mark as read on Linkding
        await api.markBookmarkAsRead(bookmark.id);
        
        // Update local bookmark
        await DatabaseService.updateBookmark(bookmark.id, {
          needs_read_sync: false
        });
      } catch (error) {
        console.error(`Failed to sync read status for bookmark ${bookmark.id}:`, error);
        // Continue with other bookmarks
      }
      
      this.#reportProgress({ current: i + 1, total, phase: 'read-status' });
    }
  }
  
  #reportProgress(progress: SyncProgress): void {
    if (this.#onProgress) {
      this.#onProgress(progress);
    }
  }
}