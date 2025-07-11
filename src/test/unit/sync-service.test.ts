import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { AppSettings, LinkdingBookmark, LocalBookmark } from '../../types';

// Mock dependencies
vi.mock('../../services/linkding-api', () => ({
  LinkdingAPI: vi.fn().mockImplementation(() => ({
    getAllBookmarks: vi.fn(),
  })),
}));

vi.mock('../../services/database', () => ({
  DatabaseService: {
    getAllBookmarks: vi.fn(),
    saveBookmark: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    setLastSyncTimestamp: vi.fn(),
  },
}));

vi.mock('../../services/content-fetcher', () => ({
  ContentFetcher: {
    fetchBookmarkContent: vi.fn(),
  },
}));

// Import after mocking
import { SyncService } from '../../services/sync-service';
import { LinkdingAPI } from '../../services/linkding-api';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';

describe('SyncService', () => {
  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  const mockRemoteBookmarks: LinkdingBookmark[] = [
    {
      id: 1,
      url: 'https://example.com/article1',
      title: 'Test Article 1',
      description: 'Test description',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['test'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-02T10:00:00Z',
    },
    {
      id: 2,
      url: 'https://example.com/article2',
      title: 'Test Article 2',
      description: 'Another test article',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: false,
      shared: false,
      tag_names: ['design'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-03T10:00:00Z',
    },
  ];

  const mockLocalBookmarks: LocalBookmark[] = [
    {
      ...mockRemoteBookmarks[0],
      content: '<html>cached content</html>',
      readability_content: 'cleaned content',
      cached_at: '2024-01-01T11:00:00Z',
      last_read_at: '2024-01-01T12:00:00Z',
      read_progress: 50,
      reading_mode: 'readability',
      is_synced: true,
      date_modified: '2024-01-01T10:00:00Z', // Older than remote
    } as LocalBookmark,
  ];

  let mockApi: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup API mock
    mockApi = {
      getAllBookmarks: vi.fn(),
    };
    (LinkdingAPI as any).mockImplementation(() => mockApi);

    // Setup database mocks
    (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockLocalBookmarks);
    (DatabaseService.saveBookmark as any).mockResolvedValue(undefined);
    (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);
    (DatabaseService.setLastSyncTimestamp as any).mockResolvedValue(undefined);

    // Setup content fetcher mock
    (ContentFetcher.fetchBookmarkContent as any).mockResolvedValue({
      content: '<html>fetched content</html>',
      readability_content: 'processed content',
    });
  });

  describe('syncBookmarks', () => {
    it('should perform full sync when no last sync timestamp exists', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

      const progressCallback = vi.fn();
      await SyncService.syncBookmarks(mockSettings, progressCallback);

      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(undefined);
      expect(progressCallback).toHaveBeenCalledWith(0, 2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
    });

    it('should perform incremental sync when last sync timestamp exists', async () => {
      const lastSyncTimestamp = '2024-01-01T10:00:00Z';
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(lastSyncTimestamp);

      await SyncService.syncBookmarks(mockSettings);

      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(lastSyncTimestamp);
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalled();
    });

    it('should update bookmarks that are newer than local versions', async () => {
      mockApi.getAllBookmarks.mockResolvedValue([mockRemoteBookmarks[0]]);
      
      await SyncService.syncBookmarks(mockSettings);

      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          date_modified: '2024-01-02T10:00:00Z',
          content: '<html>cached content</html>', // Preserves existing content
          last_read_at: '2024-01-01T12:00:00Z', // Preserves reading progress
          read_progress: 50,
          is_synced: true,
        })
      );
    });

    it('should skip bookmarks that are not newer than local versions', async () => {
      const olderRemoteBookmark = {
        ...mockRemoteBookmarks[0],
        date_modified: '2023-12-31T10:00:00Z', // Older than local
      };
      
      mockApi.getAllBookmarks.mockResolvedValue([olderRemoteBookmark]);
      
      await SyncService.syncBookmarks(mockSettings);

      // Should not save since remote is older
      expect(DatabaseService.saveBookmark).not.toHaveBeenCalled();
    });

    it('should fetch content for new bookmarks without cached content', async () => {
      const newBookmark = {
        ...mockRemoteBookmarks[1],
        id: 3, // New bookmark not in local storage
      };
      
      mockApi.getAllBookmarks.mockResolvedValue([newBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]); // No local bookmarks

      await SyncService.syncBookmarks(mockSettings);

      expect(ContentFetcher.fetchBookmarkContent).toHaveBeenCalledWith(
        expect.objectContaining({ id: 3 })
      );
      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 3,
          content: '<html>fetched content</html>',
          readability_content: 'processed content',
          cached_at: expect.any(String),
        })
      );
    });

    it('should handle content fetching errors gracefully', async () => {
      const newBookmark = mockRemoteBookmarks[1];
      mockApi.getAllBookmarks.mockResolvedValue([newBookmark]);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
      
      (ContentFetcher.fetchBookmarkContent as any).mockRejectedValue(
        new Error('Network error')
      );

      // Should not throw
      await expect(SyncService.syncBookmarks(mockSettings)).resolves.not.toThrow();
      
      // Should still save bookmark without content
      expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 2,
          content: undefined,
          readability_content: undefined,
        })
      );
    });

    it('should set sync timestamp only on successful completion', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);

      await SyncService.syncBookmarks(mockSettings);

      const setTimestampCall = (DatabaseService.setLastSyncTimestamp as any).mock.calls[0];
      expect(setTimestampCall[0]).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      expect(new Date(setTimestampCall[0])).toBeInstanceOf(Date);
    });

    it('should not set sync timestamp if sync fails', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('API error'));

      await expect(SyncService.syncBookmarks(mockSettings)).rejects.toThrow('API error');
      expect(DatabaseService.setLastSyncTimestamp).not.toHaveBeenCalled();
    });

    it('should prevent concurrent syncs', async () => {
      mockApi.getAllBookmarks.mockImplementation(() => 
        new Promise(resolve => setTimeout(() => resolve(mockRemoteBookmarks), 100))
      );

      const sync1 = SyncService.syncBookmarks(mockSettings);
      const sync2 = SyncService.syncBookmarks(mockSettings);

      await Promise.all([sync1, sync2]);

      // API should only be called once
      expect(mockApi.getAllBookmarks).toHaveBeenCalledTimes(1);
    });
  });

  describe('fullSync', () => {
    it('should clear sync timestamp and perform full sync', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);

      await SyncService.fullSync(mockSettings);

      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalledWith('');
      expect(mockApi.getAllBookmarks).toHaveBeenCalledWith(undefined);
    });

    it('should call progress callback during full sync', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      const progressCallback = vi.fn();

      await SyncService.fullSync(mockSettings, progressCallback);

      expect(progressCallback).toHaveBeenCalledWith(0, 2);
      expect(progressCallback).toHaveBeenCalledWith(1, 2);
      expect(progressCallback).toHaveBeenCalledWith(2, 2);
    });
  });

  describe('backgroundSync', () => {
    it('should sync when auto_sync is enabled', async () => {
      mockApi.getAllBookmarks.mockResolvedValue(mockRemoteBookmarks);
      const settingsWithAutoSync = { ...mockSettings, auto_sync: true };

      await SyncService.backgroundSync(settingsWithAutoSync);

      expect(mockApi.getAllBookmarks).toHaveBeenCalled();
    });

    it('should not sync when auto_sync is disabled', async () => {
      const settingsWithoutAutoSync = { ...mockSettings, auto_sync: false };

      await SyncService.backgroundSync(settingsWithoutAutoSync);

      expect(mockApi.getAllBookmarks).not.toHaveBeenCalled();
    });

    it('should handle sync errors gracefully', async () => {
      mockApi.getAllBookmarks.mockRejectedValue(new Error('Network error'));
      const settingsWithAutoSync = { ...mockSettings, auto_sync: true };

      // Should not throw
      await expect(SyncService.backgroundSync(settingsWithAutoSync)).resolves.not.toThrow();
    });
  });
});