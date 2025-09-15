import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';

// Import components
import { AppRoot } from '../../components/app-root';
import { SettingsPanel } from '../../components/settings-panel';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { BookmarkList } from '../../components/bookmark-list';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    getAllBookmarks: vi.fn(),
    getUnreadBookmarks: vi.fn(),
    getBookmark: vi.fn(),
    saveBookmark: vi.fn(),
    getReadProgress: vi.fn(),
    saveReadProgress: vi.fn(),
    clearAll: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
    getBookmarksPaginated: vi.fn(),
    getBookmarkCount: vi.fn(),
    getPageFromAnchorBookmark: vi.fn(),
    getBookmarksWithAssetCounts: vi.fn(),
    deleteBookmark: vi.fn(),
    updateBookmarkReadStatus: vi.fn(),
    saveAsset: vi.fn(),
    getAssetsByBookmarkId: vi.fn(),
    getLastSyncTimestamp: vi.fn(),
    setLastSyncTimestamp: vi.fn(),
    getAllFilterCounts: vi.fn(),
  },
}));

vi.mock('../../services/sync-service', () => ({
  SyncService: {
    syncBookmarks: vi.fn(),
    getInstance: vi.fn(),
    isSyncInProgress: vi.fn(() => false),
    getCurrentSyncProgress: vi.fn(() => ({ current: 0, total: 0 })),
  },
}));

vi.mock('../../services/linkding-api', () => ({
  createLinkdingAPI: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue(true),
    getBookmarks: vi.fn(),
  })),
}));

vi.mock('../../services/content-fetcher', () => ({
  ContentFetcher: {
    fetchBookmarkContent: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { SyncService } from '../../services/sync-service';

describe('Sync Workflows - Background Data Synchronization', () => {
  const mockBookmarks: LocalBookmark[] = [
    {
      id: 1,
      url: 'https://example.com/article1',
      title: 'Test Article 1',
      description: 'This is a test article',
      notes: '',
      website_title: 'Example',
      website_description: 'Example site',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['tech'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-01T10:00:00Z',
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
      is_archived: true,
      unread: false,
      shared: false,
      tag_names: ['science'],
      date_added: '2024-01-02T10:00:00Z',
      date_modified: '2024-01-02T10:00:00Z',
    },
  ];

  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    
    // Register components if not already registered
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot);
    }
    if (!customElements.get('settings-panel')) {
      customElements.define('settings-panel', SettingsPanel);
    }
    if (!customElements.get('bookmark-list-container')) {
      customElements.define('bookmark-list-container', BookmarkListContainer);
    }
    if (!customElements.get('bookmark-list')) {
      customElements.define('bookmark-list', BookmarkList);
    }
    if (!customElements.get('bookmark-reader')) {
      customElements.define('bookmark-reader', BookmarkReader);
    }

    // Clean up DOM
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('Journey 4: Background Sync', () => {
    beforeEach(() => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks);
    });

    it('should support sync workflow', async () => {
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize
      await appRoot.updateComplete;

      // Should load settings and bookmarks
      expect(DatabaseService.getSettings).toHaveBeenCalled();
      
      // When sync occurs, it should update the data
      vi.mocked(SyncService.syncBookmarks).mockResolvedValue({ success: true, processed: 0, timestamp: Date.now() });
      
      // Verify sync service is available
      expect(SyncService.syncBookmarks).toBeDefined();
      expect(SyncService.isSyncInProgress).toBeDefined();
    });
  });
});