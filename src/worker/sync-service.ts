import type { AppSettings, LocalAsset, LocalBookmark, SyncPhase } from '../types';
import { createLinkdingAPI, type LinkdingAPI } from '../services/linkding-api';
import { DatabaseService } from '../services/database';
import { FaviconService } from '../services/favicon-service';
import { logInfo, logWarning, logError } from './sw-logger';

export interface SyncProgress {
  current: number;
  total: number;
  phase: SyncPhase;
}

export interface SyncResult {
  success: boolean;
  processed: number;
  error?: Error;
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
   * Perform a complete sync operation using 4 idempotent phases
   */
  async performSync(settings: AppSettings): Promise<SyncResult> {
    this.#abortController = new AbortController();
    this.#processedCount = 0;

    // Add abort signal listener for debugging
    this.#abortController.signal.addEventListener('abort', () => {
      logInfo('sync', 'AbortController signal fired - sync will be cancelled');

      // Log stack trace to see what triggered the abort
      const stack = new Error('Sync abort triggered').stack;
      logInfo('sync', `Abort stack trace: ${stack}`);
    });

    try {
      // Initialize API service
      const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);

      // Get last sync timestamp for incremental sync
      const lastSyncTimestamp = await DatabaseService.getLastSyncTimestamp();
      const syncStartTime = new Date().toISOString();

      logInfo('sync', lastSyncTimestamp ? 'Starting incremental sync' : 'Starting full sync', {
        lastSyncTimestamp,
        syncStartTime
      });

      // Sync will start with first phase (bookmarks) - no initial progress report needed

      // Phase 1: Sync unarchived bookmarks
      const unarchivedProcessed = await this.#syncUnarchivedBookmarks(api, lastSyncTimestamp || undefined);

      // Phase 2: Sync archived bookmarks
      const archivedProcessed = await this.#syncArchivedBookmarks(api, lastSyncTimestamp || undefined);

      // End of bookmark phases: Update timestamp (also resets offsets)
      await DatabaseService.setLastSyncTimestamp(syncStartTime);

      // Phase 3: Sync assets for bookmarks needing asset sync
      await this.#syncBookmarkAssets(api);

      // Phase 4: Sync read status back to Linkding
      await this.#syncReadStatusToLinkding(api);

      // Report completion
      this.#reportProgress({ current: 1, total: 1, phase: 'complete' });

      logInfo('sync', 'Sync completed successfully', {
        processed: this.#processedCount,
        unarchived: unarchivedProcessed,
        archived: archivedProcessed
      });

      return {
        success: true,
        processed: this.#processedCount,
        timestamp: Date.now()
      };
    } catch (error) {
      const errorInstance = error instanceof Error ? error : new Error('Unknown sync error');
      logError('sync', 'Sync failed', errorInstance);

      return {
        success: false,
        processed: this.#processedCount,
        error: errorInstance,
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
    logInfo('sync', 'cancelSync() called - aborting sync operation');
    this.#abortController?.abort();
  }

  /**
   * Shared method for syncing bookmarks with pagination and offset resumption
   */
  async #syncBookmarksWithPagination(
    api: LinkdingAPI,
    bookmarkType: 'unarchived' | 'archived',
    phase: SyncPhase,
    lastSyncTimestamp?: string
  ): Promise<number> {
    const isArchived = bookmarkType === 'archived';
    let offset = isArchived ? await DatabaseService.getArchivedOffset() : await DatabaseService.getUnarchivedOffset();
    let processedCount = 0;
    let totalBookmarksFound = 0;
    const limit = 100; // Page size for pagination

    logInfo('sync', `Starting ${bookmarkType} bookmarks sync`, {
      resumeOffset: offset,
      lastSyncTimestamp
    });

    // Get local bookmarks once for comparison
    const localBookmarks = await DatabaseService.getAllBookmarks();
    const localBookmarksMap = new Map(localBookmarks.map(b => [b.id, b]));

    while (true) {
      if (this.#abortController?.signal.aborted) {
        throw new Error('Sync cancelled');
      }

      try {
        const response = isArchived
          ? await api.getArchivedBookmarks(limit, offset, lastSyncTimestamp)
          : await api.getBookmarks(limit, offset, lastSyncTimestamp);
        const remoteBookmarks = response.results;

        if (remoteBookmarks.length === 0) {
          break; // No more bookmarks to process
        }

        for (const remoteBookmark of remoteBookmarks) {
          if (this.#abortController?.signal.aborted) {
            throw new Error('Sync cancelled');
          }

          const wasProcessed = await this.#processBookmark(remoteBookmark, localBookmarksMap);
          if (wasProcessed) {
            processedCount++;
            this.#processedCount++;
          }

          totalBookmarksFound++;

          // Report progress after each bookmark for smoother progress updates
          this.#reportProgress({
            current: totalBookmarksFound,
            total: response.count || totalBookmarksFound, // Use API's total count if available
            phase
          });
        }

        // Update offset after processing the page
        offset += limit;
        if (isArchived) {
          await DatabaseService.setArchivedOffset(offset);
        } else {
          await DatabaseService.setUnarchivedOffset(offset);
        }

        // Yield control periodically
        await new Promise(resolve => setTimeout(resolve, 0));

        // Check if this was the last page
        if (remoteBookmarks.length < limit || !response.next) {
          break;
        }

      } catch (error) {
        logError('sync', `Failed to sync ${bookmarkType} bookmarks page`, error);
        throw error;
      }
    }

    logInfo('sync', `Completed ${bookmarkType} bookmarks sync`, {
      processedCount,
      totalBookmarksFound,
      finalOffset: offset
    });

    return processedCount;
  }

  /**
   * Shared method for processing individual bookmarks
   */
  async #processBookmark(
    remoteBookmark: any,
    localBookmarksMap: Map<number, LocalBookmark>
  ): Promise<boolean> {
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
        is_synced: true,
        needs_asset_sync: 1 // Mark for asset sync in Phase 3 (1=true, 0=false for indexing)
      } as LocalBookmark;

      await DatabaseService.saveBookmark(bookmarkToSave);
      return true; // Bookmark was processed
    }

    return false; // Bookmark was skipped
  }

  /**
   * Phase 1: Sync unarchived bookmarks with offset resumption
   */
  async #syncUnarchivedBookmarks(api: LinkdingAPI, lastSyncTimestamp?: string): Promise<number> {
    return await this.#syncBookmarksWithPagination(api, 'unarchived', 'bookmarks', lastSyncTimestamp);
  }

  /**
   * Phase 2: Sync archived bookmarks with offset resumption
   */
  async #syncArchivedBookmarks(api: LinkdingAPI, lastSyncTimestamp?: string): Promise<number> {
    return await this.#syncBookmarksWithPagination(api, 'archived', 'archived-bookmarks', lastSyncTimestamp);
  }

  /**
   * Phase 3: Sync assets for bookmarks needing asset sync
   */
  async #syncBookmarkAssets(api: LinkdingAPI): Promise<void> {
    try {
      const bookmarksNeedingAssetSync = await DatabaseService.getBookmarksNeedingAssetSync();

      logInfo('sync', 'Starting asset sync phase', {
        bookmarksCount: bookmarksNeedingAssetSync.length
      });

      if (bookmarksNeedingAssetSync.length === 0) {
        return; // No assets to sync
      }

      let processed = 0;
      for (const bookmark of bookmarksNeedingAssetSync) {
        if (this.#abortController?.signal.aborted) {
          logInfo('sync', 'Asset sync cancelled by abort signal');
          throw new Error('Sync cancelled');
        }

        logInfo('sync', `Starting asset sync for bookmark ${bookmark.id}`, {
          bookmark_id: bookmark.id,
          is_archived: bookmark.is_archived,
          processed: processed + 1,
          total: bookmarksNeedingAssetSync.length
        });

        try {
          if (bookmark.is_archived) {
            // For archived bookmarks: sync metadata but clean up cached content
            await this.#syncArchivedBookmarkAssets(api, bookmark.id, bookmark);
          } else {
            // For unarchived bookmarks: full asset sync with content caching
            await this.#syncUnarchivedBookmarkAssets(api, bookmark.id);
          }

          // For unarchived bookmarks, preload favicon in background
          // Archived bookmarks will load favicons on-demand only
          if (bookmark.favicon_url && !bookmark.is_archived) {
            FaviconService.preloadFavicon(bookmark.id, bookmark.favicon_url);
          }

          // Mark asset sync as completed for this bookmark
          await DatabaseService.markBookmarkAssetSynced(bookmark.id);

          logInfo('sync', `Successfully completed asset sync for bookmark ${bookmark.id}`, {
            bookmark_id: bookmark.id
          });

        } catch (error) {
          logError('sync', `Failed to sync assets for bookmark ${bookmark.id}`, error);
          // Continue with other bookmarks even if one fails
        }

        processed++;

        // Report progress
        this.#reportProgress({
          current: processed,
          total: bookmarksNeedingAssetSync.length,
          phase: 'assets'
        });

        // Yield control periodically
        if (processed % 5 === 0) {
          await new Promise(resolve => setTimeout(resolve, 0));
        }
      }

      logInfo('sync', 'Completed asset sync phase', {
        processedCount: processed
      });

    } catch (error) {
      logError('sync', 'Failed to sync assets', error);

      // Log additional details about the error
      if (error instanceof Error && error.message === 'Sync cancelled') {
        logInfo('sync', 'Asset sync phase was cancelled by user or abort signal');
      } else {
        logError('sync', 'Unexpected error during asset sync phase', error);
      }

      // Don't throw here - we don't want asset sync failures to break the main sync
    }
  }

  /**
   * Phase 4: Sync read status back to Linkding
   */
  async #syncReadStatusToLinkding(api: LinkdingAPI): Promise<void> {
    try {
      const bookmarksNeedingSync = await DatabaseService.getBookmarksNeedingReadSync();

      logInfo('sync', 'Starting read status sync phase', {
        bookmarksCount: bookmarksNeedingSync.length
      });

      if (bookmarksNeedingSync.length === 0) {
        return; // No read status to sync
      }

      let processed = 0;
      for (const bookmark of bookmarksNeedingSync) {
        if (this.#abortController?.signal.aborted) {
          throw new Error('Sync cancelled');
        }

        try {
          await api.markBookmarkAsRead(bookmark.id);
          await DatabaseService.markBookmarkReadSynced(bookmark.id);
          logInfo('sync', `Successfully synced read status for bookmark ${bookmark.id}`, { bookmark_id: bookmark.id });
        } catch (error) {
          logError('sync', `Failed to sync read status for bookmark ${bookmark.id}`, error);
          // Continue with other bookmarks even if one fails
        }

        processed++;

        // Report progress
        this.#reportProgress({
          current: processed,
          total: bookmarksNeedingSync.length,
          phase: 'read-status'
        });
      }

      logInfo('sync', 'Completed read status sync phase', {
        processedCount: processed
      });

    } catch (error) {
      logError('sync', 'Failed to sync read status to Linkding', error);
      // Don't throw here - we don't want read sync failures to break the main sync
    }
  }

  async #syncArchivedBookmarkAssets(api: LinkdingAPI, bookmarkId: number, localBookmark?: LocalBookmark): Promise<void> {
    try {
      // Get remote assets for this bookmark to keep metadata in sync
      const remoteAssets = await api.getBookmarkAssets(bookmarkId);

      // Validate that remoteAssets is an array
      if (!Array.isArray(remoteAssets)) {
        logWarning('sync', `getBookmarkAssets returned non-array for archived bookmark ${bookmarkId}`, { bookmark_id: bookmarkId, response_type: typeof remoteAssets });
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
        logInfo('sync', `Cleaning up cached assets for newly archived bookmark ${bookmarkId}`, { bookmark_id: bookmarkId });
        await DatabaseService.clearAssetContent(String(bookmarkId));
      }

      logInfo('sync', `Synced metadata for ${completedAssets.length} assets for archived bookmark ${bookmarkId}`, { bookmark_id: bookmarkId, asset_count: completedAssets.length });
    } catch (error) {
      logError('sync', `Failed to sync assets for archived bookmark ${bookmarkId}`, error);
      // Don't throw - continue with other bookmarks
    }
  }

  async #syncUnarchivedBookmarkAssets(api: LinkdingAPI, bookmarkId: number): Promise<void> {
    try {
      // Get remote assets for this bookmark
      const remoteAssets = await api.getBookmarkAssets(bookmarkId);

      // Validate that remoteAssets is an array
      if (!Array.isArray(remoteAssets)) {
        logWarning('sync', `getBookmarkAssets returned non-array for bookmark ${bookmarkId}`, { bookmark_id: bookmarkId, response_type: typeof remoteAssets });
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
          logInfo('sync', `Downloaded asset ${remoteAsset.id} for bookmark ${bookmarkId}`, { asset_id: remoteAsset.id, bookmark_id: bookmarkId });
        } catch (error) {
          logError('sync', `Failed to download asset ${remoteAsset.id} for bookmark ${bookmarkId}`, error);
        }
      }

      // Clean up assets that no longer exist remotely
      const remoteAssetIds = new Set(completedAssets.map(a => a.id));
      for (const localAsset of localAssets) {
        if (!remoteAssetIds.has(localAsset.id)) {
          // TODO: Remove this asset from local storage
          logWarning('sync', `Asset ${localAsset.id} no longer exists remotely, should be cleaned up`, { asset_id: localAsset.id, bookmark_id: bookmarkId });
        }
      }
    } catch (error) {
      logError('sync', `Failed to sync assets for bookmark ${bookmarkId}`, error);
      if (error instanceof TypeError && error.message.includes('filter is not a function')) {
        logError('sync', 'Invalid API response format - expected array', new Error('API returned non-array response'));
      }
      // Don't throw - continue with other bookmarks
    }
  }

  #reportProgress(progress: SyncProgress): void {
    if (this.#onProgress) {
      this.#onProgress(progress);
    }
  }
}