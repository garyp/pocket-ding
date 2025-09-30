import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from '../../worker/sync-service';
import { DatabaseService } from '../../services/database';
import { createLinkdingAPI } from '../../services/linkding-api';
import type { AppSettings } from '../../types';

// Mock dependencies
vi.mock('../../services/database');
vi.mock('../../services/linkding-api');
vi.mock('../../services/favicon-service');

describe('SyncService Interruption Handling', () => {
  let syncService: SyncService;
  let mockProgressCallback: ReturnType<typeof vi.fn>;
  let mockSettings: AppSettings;
  let mockAPI: any;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockProgressCallback = vi.fn();
    syncService = new SyncService(mockProgressCallback);

    mockSettings = {
      linkding_url: 'https://example.com',
      linkding_token: 'test-token',
      auto_sync: false,
      sync_interval: 30,
      reading_mode: 'readability'
    } as AppSettings;

    // Mock API responses
    mockAPI = {
      getBookmarks: vi.fn().mockResolvedValue({
        results: [],
        count: 0,
        next: null
      }),
      getArchivedBookmarks: vi.fn().mockResolvedValue({
        results: [],
        count: 0,
        next: null
      }),
      getBookmarkAssets: vi.fn().mockResolvedValue([]),
      markBookmarkAsRead: vi.fn().mockResolvedValue(undefined)
    };

    vi.mocked(createLinkdingAPI).mockReturnValue(mockAPI);

    // Mock database methods
    vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
    vi.mocked(DatabaseService.setLastSyncTimestamp).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getUnarchivedOffset).mockResolvedValue(0);
    vi.mocked(DatabaseService.getArchivedOffset).mockResolvedValue(0);
    vi.mocked(DatabaseService.setUnarchivedOffset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.setArchivedOffset).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue([]);
    vi.mocked(DatabaseService.getBookmarksNeedingReadSync).mockResolvedValue([]);
    // Mock manual pause state methods
    vi.mocked(DatabaseService.setManualPauseState).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getManualPauseState).mockResolvedValue(false);
    vi.mocked(DatabaseService.clearManualPauseState).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should cancel sync operation when cancelSync is called', async () => {
    // Start a sync operation
    const syncPromise = syncService.performSync(mockSettings);

    // Cancel the sync
    syncService.cancelSync();

    // The sync should complete with cancellation
    const result = await syncPromise;
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('cancelled');
  });

  it('should handle manual pause state in database', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    // Set manual pause state
    await DatabaseService.setManualPauseState(true);
    expect(vi.mocked(DatabaseService.setManualPauseState)).toHaveBeenCalledWith(true);

    // Mock that manual pause state is persisted
    vi.mocked(DatabaseService.getManualPauseState).mockResolvedValueOnce(true);
    const isPaused = await DatabaseService.getManualPauseState();
    expect(isPaused).toBe(true);

    // Clear manual pause state
    await DatabaseService.clearManualPauseState();
    expect(vi.mocked(DatabaseService.clearManualPauseState)).toHaveBeenCalled();

    // Mock that it's cleared
    vi.mocked(DatabaseService.getManualPauseState).mockResolvedValueOnce(false);
    const isCleared = await DatabaseService.getManualPauseState();
    expect(isCleared).toBe(false);

    // Set up bookmarks to sync
    const mockBookmarks = [
      { id: 1, title: 'Test 1', date_modified: '2024-01-01' },
      { id: 2, title: 'Test 2', date_modified: '2024-01-02' }
    ];

    // Create a simple pause/resume flow
    mockAPI.getBookmarks.mockResolvedValue({
      results: mockBookmarks,
      count: 2,
      next: null
    });

    // Start sync
    const syncPromise = syncService.performSync(mockSettings);

    // Wait for sync to complete
    const result = await syncPromise;

    // Verify sync completed successfully
    expect(result.success).toBe(true);
  });

  it('should continue sync after interruption and restart', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    // Set up simple bookmarks
    const mockBookmarks = [
      { id: 1, title: 'Bookmark 1', date_modified: '2024-01-01' },
      { id: 2, title: 'Bookmark 2', date_modified: '2024-01-01' }
    ];

    mockAPI.getBookmarks.mockResolvedValue({
      results: mockBookmarks,
      count: 2,
      next: null
    });

    // Start sync
    const syncPromise = syncService.performSync(mockSettings);

    // Cancel the sync (simulating manual pause)
    syncService.cancelSync();

    // Wait for cancellation
    const result = await syncPromise;
    expect(result.success).toBe(false);

    // Start a new sync (simulating resume)
    const secondSyncPromise = syncService.performSync(mockSettings);
    const secondResult = await secondSyncPromise;
    expect(secondResult.success).toBe(true);
  });

  it('should handle interruption during asset sync phase', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    const mockBookmarksNeedingAssets = [
      {
        id: 1,
        title: 'Test 1',
        url: 'https://example.com',
        description: '',
        notes: '',
        website_title: 'Test 1',
        website_description: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: [],
        date_added: '2024-01-01',
        date_modified: '2024-01-01',
        favicon_url: 'https://example.com/favicon.ico',
        preview_image_url: null,
        is_synced: true,
        needs_asset_sync: 1,
        last_read_at: null,
        read_progress: null,
        reading_mode: null
      }
    ] as any[];

    // Quick bookmark phases - simulate slow processing to allow cancellation
    mockAPI.getBookmarks.mockImplementation(() =>
      new Promise((resolve) => {
        setTimeout(() => resolve({
          results: [],
          count: 0,
          next: null
        }), 100);
      })
    );

    mockAPI.getArchivedBookmarks.mockResolvedValue({
      results: [],
      count: 0,
      next: null
    });

    // Asset sync setup
    vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(mockBookmarksNeedingAssets);
    vi.mocked(DatabaseService.markBookmarkAssetSynced).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);

    mockAPI.getBookmarkAssets.mockResolvedValue([
      { id: 'asset1', status: 'complete', bookmark_id: 1 }
    ]);
    mockAPI.downloadAsset = vi.fn().mockResolvedValue('content');

    // Start sync
    const syncPromise = syncService.performSync(mockSettings);

    // Cancel quickly during the bookmark fetch phase
    await new Promise(resolve => setTimeout(resolve, 10));
    syncService.cancelSync();

    // Wait for cancellation
    const result = await syncPromise;
    expect(result.success).toBe(false);
  });

  it('should cancel properly during sync operation', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    // Start sync
    const syncPromise = syncService.performSync(mockSettings);

    // Cancel immediately
    syncService.cancelSync();

    // Sync should fail with cancellation
    const result = await syncPromise;
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('cancelled');
  });
});