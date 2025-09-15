import type { AppSettings, LocalAsset, LocalBookmark } from '../types';
import { createLinkdingAPI, type LinkdingAPI } from '../services/linkding-api';
import { DatabaseService } from '../services/database';
import { logError } from './sw-logger';

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
export class SyncService {
  #onProgress?: (progress: SyncProgress) => void;
  #abortController?: AbortController;
  #processedCount: number = 0;
  
  constructor(onProgress?: (progress: SyncProgress) => void) {
    if (onProgress) {
      this.#onProgress = onProgress;
    }
  }

  /**
   * Perform a complete sync operation
   */
  async performSync(settings: AppSettings, checkpoint?: SyncCheckpoint): Promise<SyncResult> {
    this.#abortController = new AbortController();
    this.#processedCount = 0;
    
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
      await DatabaseService.setLastSyncTimestamp(new Date().toISOString());
      
      // Report completion
      this.#reportProgress({ current: 1, total: 1, phase: 'complete' });
      
      return {
        success: true,
        processed: this.#processedCount,
        timestamp: Date.now()
      };
    } catch (error) {
      return {
        success: false,
        processed: this.#processedCount,
        error: error instanceof Error ? error : new Error('Unknown sync error'),
        timestamp: Date.now()
      };
    } finally {
      (this.#abortController as any) = undefined;
    }
  }
  
  /**
   * Cancel the current sync operation
   */
  cancelSync(): void {
    this.#abortController?.abort();
  }
  
  async #syncBookmarks(api: LinkdingAPI, modifiedSince?: string, lastProcessedId?: number): Promise<void> {
    // Use modifiedSince parameter for incremental sync  
    const remoteBookmarks = await api.getAllBookmarks(modifiedSince);
    
    // Get local bookmarks for comparison
    const localBookmarks = await DatabaseService.getAllBookmarks();
    const localBookmarksMap = new Map(localBookmarks.map(b => [b.id, b]));
    
    // Resume from checkpoint if provided
    const startIndex = lastProcessedId 
      ? remoteBookmarks.findIndex((b: any) => b.id > lastProcessedId)
      : 0;
    
    const total = remoteBookmarks.length - startIndex;
    this.#reportProgress({ current: 0, total, phase: 'bookmarks' });
    
    for (let i = startIndex; i < remoteBookmarks.length; i++) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }
      
      const remoteBookmark = remoteBookmarks[i];
      if (!remoteBookmark) continue;
      
      // Check if bookmark needs updating
      const existingBookmark = localBookmarksMap.get(remoteBookmark.id);
      const needsUpdate = !existingBookmark || 
                         new Date(remoteBookmark.date_modified) > new Date(existingBookmark.date_modified);
      
      if (needsUpdate) {
        // Save checkpoint periodically (every 10 bookmarks)
        if (i > startIndex && (i - startIndex) % 10 === 0) {
          await DatabaseService.setSyncCheckpoint({
            lastProcessedId: remoteBookmark.id,
            phase: 'bookmarks',
            timestamp: Date.now()
          });
        }
        
        // Preserve local reading state when updating
        const localBookmark: LocalBookmark = {
          id: remoteBookmark.id!,
          url: remoteBookmark.url || '',
          title: remoteBookmark.title || '',
          description: remoteBookmark.description || '',
          notes: remoteBookmark.notes || '',
          website_title: remoteBookmark.website_title || '',
          website_description: remoteBookmark.website_description || '',
          web_archive_snapshot_url: remoteBookmark.web_archive_snapshot_url || '',
          favicon_url: remoteBookmark.favicon_url || '',
          preview_image_url: remoteBookmark.preview_image_url || '',
          shared: remoteBookmark.shared ?? false,
          tag_names: remoteBookmark.tag_names || [],
          unread: remoteBookmark.unread ?? false,
          is_archived: remoteBookmark.is_archived ?? false,
          date_added: remoteBookmark.date_added || '',
          date_modified: remoteBookmark.date_modified || '',
          is_synced: true,
          // Preserve local reading state - set to undefined if not present
          ...(existingBookmark?.last_read_at !== undefined && { last_read_at: existingBookmark.last_read_at }),
          ...(existingBookmark?.read_progress !== undefined && { read_progress: existingBookmark.read_progress }),
          ...(existingBookmark?.reading_mode !== undefined && { reading_mode: existingBookmark.reading_mode })
        };
        await DatabaseService.saveBookmark(localBookmark);
        this.#processedCount++;
      }
      
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
      if (!bookmark) continue;
      
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
          // Download and save asset metadata
          const assetData = await api.getBookmarkAssets(bookmark.id);
          if (assetData && assetData.length > 0) {
            const firstAsset = assetData[0];
            if (firstAsset) {
              const asset: LocalAsset = {
                id: firstAsset.id,
                asset_type: firstAsset.asset_type,
                content_type: firstAsset.content_type,
                display_name: firstAsset.display_name,
                file_size: firstAsset.file_size,
                status: firstAsset.status,
                date_created: firstAsset.date_created,
                bookmark_id: bookmark.id,
                cached_at: new Date().toISOString()
              };
              await DatabaseService.saveAsset(asset);
              this.#processedCount++;
            }
          }
        }
      } catch (error) {
        logError('syncAssets', `Failed to sync asset for bookmark ${bookmark.id}`, error);
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
      if (!bookmark) continue;
      
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
        const updatedBookmark = { ...bookmark, needs_read_sync: false };
        await DatabaseService.saveBookmark(updatedBookmark);
      } catch (error) {
        logError('syncReadStatus', `Failed to sync read status for bookmark ${bookmark.id}`, error);
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