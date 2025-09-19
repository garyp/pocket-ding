import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncService } from '../../worker/sync-service';
import { DatabaseService } from '../../services/database';
import { createLinkdingAPI } from '../../services/linkding-api';
import type { AppSettings } from '../../types';

// Mock dependencies
vi.mock('../../services/database');
vi.mock('../../services/linkding-api');
vi.mock('../../services/favicon-service');

describe('SyncService Pause/Resume', () => {
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
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should pause sync operation when pauseSync is called', () => {
    syncService.pauseSync();
    expect(syncService.isPaused()).toBe(false); // Should not be paused initially without active sync

    // Start a sync operation (fire and forget)
    void syncService.performSync(mockSettings);

    // Now pause should work
    syncService.pauseSync();
    expect(syncService.isPaused()).toBe(true);
  });

  it('should resume sync operation when resumeSync is called', async () => {
    vi.useRealTimers(); // Use real timers for this async test

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

    // Immediately pause (sync should handle this gracefully)
    syncService.pauseSync();
    const wasPaused = syncService.isPaused();

    // Resume quickly
    syncService.resumeSync();

    // Wait for sync to complete
    const result = await syncPromise;

    // Verify sync completed successfully
    expect(result.success).toBe(true);
    expect(wasPaused).toBe(true); // Should have been paused at some point
    expect(syncService.isPaused()).toBe(false); // Should not be paused after completion
  });

  it('should report paused status in progress callback', async () => {
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

    // Quick pause and resume
    syncService.pauseSync();
    await new Promise(resolve => setTimeout(resolve, 10));
    syncService.resumeSync();

    // Wait for completion
    const result = await syncPromise;
    expect(result.success).toBe(true);
  });

  it('should handle pause/resume during asset sync phase', async () => {
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

    // Quick bookmark phases
    mockAPI.getBookmarks.mockResolvedValue({
      results: [],
      count: 0,
      next: null
    });
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

    // Quick pause/resume during execution
    await new Promise(resolve => setTimeout(resolve, 10));
    syncService.pauseSync();
    syncService.resumeSync();

    // Wait for completion
    const result = await syncPromise;
    expect(result.success).toBe(true);
  });

  it('should cancel properly when paused', async () => {
    vi.useRealTimers(); // Use real timers for this async test

    // Start sync
    const syncPromise = syncService.performSync(mockSettings);

    // Pause
    syncService.pauseSync();
    expect(syncService.isPaused()).toBe(true);

    // Cancel while paused
    syncService.cancelSync();
    expect(syncService.isPaused()).toBe(false); // Should unpause when cancelled

    // Sync should fail with cancellation
    const result = await syncPromise;
    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('cancelled');
  });
});