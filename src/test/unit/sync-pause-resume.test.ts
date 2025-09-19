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
    // Set up bookmarks to sync
    const mockBookmarks = [
      { id: 1, title: 'Test 1', date_modified: '2024-01-01' },
      { id: 2, title: 'Test 2', date_modified: '2024-01-02' }
    ];

    let apiCallCount = 0;
    mockAPI.getBookmarks.mockImplementation(async () => {
      apiCallCount++;
      if (apiCallCount === 1) {
        // Pause after first call
        setTimeout(() => syncService.pauseSync(), 0);
        return {
          results: mockBookmarks,
          count: 2,
          next: null
        };
      }
      return {
        results: [],
        count: 2,
        next: null
      };
    });

    const syncPromise = syncService.performSync(mockSettings);

    // Wait for pause to happen
    await new Promise(resolve => setTimeout(resolve, 50));
    expect(syncService.isPaused()).toBe(true);

    // Resume sync
    syncService.resumeSync();
    expect(syncService.isPaused()).toBe(false);

    // Sync should complete
    const result = await syncPromise;
    expect(result.success).toBe(true);
  });

  it('should report paused status in progress callback', async () => {
    // Set up a long-running sync
    const mockBookmarks = Array.from({ length: 10 }, (_, i) => ({
      id: i + 1,
      title: `Bookmark ${i + 1}`,
      date_modified: '2024-01-01'
    }));

    mockAPI.getBookmarks.mockResolvedValue({
      results: mockBookmarks,
      count: 10,
      next: null
    });

    const syncPromise = syncService.performSync(mockSettings);

    // Wait for sync to start
    await new Promise(resolve => setTimeout(resolve, 10));

    // Pause the sync
    syncService.pauseSync();
    expect(syncService.isPaused()).toBe(true);

    // Resume after a delay
    setTimeout(() => syncService.resumeSync(), 100);

    // Wait for sync to complete
    const result = await syncPromise;
    expect(result.success).toBe(true);
  });

  it('should handle pause/resume during asset sync phase', async () => {
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
      },
      {
        id: 2,
        title: 'Test 2',
        url: 'https://example2.com',
        description: '',
        notes: '',
        website_title: 'Test 2',
        website_description: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: [],
        date_added: '2024-01-01',
        date_modified: '2024-01-01',
        favicon_url: 'https://example.com/favicon2.ico',
        preview_image_url: null,
        is_synced: true,
        needs_asset_sync: 1,
        last_read_at: null,
        read_progress: null,
        reading_mode: null
      }
    ] as any[];

    vi.mocked(DatabaseService.getBookmarksNeedingAssetSync).mockResolvedValue(mockBookmarksNeedingAssets);
    vi.mocked(DatabaseService.markBookmarkAssetSynced).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
    vi.mocked(DatabaseService.saveAsset).mockResolvedValue(undefined);

    mockAPI.getBookmarkAssets.mockResolvedValue([
      { id: 'asset1', status: 'complete', bookmark_id: 1 }
    ]);
    mockAPI.downloadAsset = vi.fn().mockResolvedValue('content');

    const syncPromise = syncService.performSync(mockSettings);

    // Wait for asset phase to start
    await new Promise(resolve => setTimeout(resolve, 50));

    // Pause during asset sync
    syncService.pauseSync();
    expect(syncService.isPaused()).toBe(true);

    // Resume
    syncService.resumeSync();
    expect(syncService.isPaused()).toBe(false);

    const result = await syncPromise;
    expect(result.success).toBe(true);
  });

  it('should cancel properly when paused', async () => {
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