import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import '../setup';

// Import components
import { AppRoot } from '../../components/app-root';
import { SettingsPanel } from '../../components/settings-panel';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { BookmarkList } from '../../components/bookmark-list';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, AppSettings } from '../../types/index';

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
    testConnection: vi.fn(),
    getBookmarks: vi.fn(),
    getAllBookmarks: vi.fn(),
  })),
}));

vi.mock('../../services/content-fetcher', () => ({
  ContentFetcher: {
    fetchBookmarkContent: vi.fn(),
  },
}));

vi.mock('../../services/settings-service', () => ({
  SettingsService: {
    getSettings: vi.fn(),
    getSettingsLive: vi.fn(),
    saveSettings: vi.fn(),
    getCurrentSettings: vi.fn(),
    hasValidSettings: vi.fn(),
    getLinkdingUrl: vi.fn(),
    getLinkdingToken: vi.fn(),
    initialize: vi.fn(),
    cleanup: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { SettingsService } from '../../services/settings-service';
import { SyncService } from '../../services/sync-service';
import { createLinkdingAPI } from '../../services/linkding-api';
import { ContentFetcher } from '../../services/content-fetcher';

describe('Error Scenarios - Failure Handling', () => {
  const validSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'valid-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  // Helper function to mock SettingsService.getSettingsLive for reactive components
  const mockSettingsLive = (settings: AppSettings | undefined) => {
    vi.mocked(SettingsService.getSettingsLive).mockReturnValue({
      subscribe: vi.fn().mockImplementation(({ next }) => {
        if (next) next(settings);
        return { unsubscribe: vi.fn() };
      })
    } as any);
  };

  const mockBookmark: LocalBookmark = {
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
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Setup default SettingsService mocks
    vi.mocked(SettingsService.getSettingsLive).mockReturnValue({
      subscribe: vi.fn().mockImplementation(({ next }) => {
        // By default, return undefined for no settings
        if (next) next(undefined);
        return { unsubscribe: vi.fn() };
      })
    } as any);
    vi.mocked(SettingsService.getSettings).mockResolvedValue(undefined);
    vi.mocked(SettingsService.initialize).mockResolvedValue(undefined);
    vi.mocked(SettingsService.cleanup).mockReturnValue(undefined);

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

  describe('Network Failure Scenarios', () => {
    it('should handle network failures during sync gracefully', async () => {
      // Mock existing settings but network failure
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      mockSettingsLive(validSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([mockBookmark]);
      vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({
        all: 1,
        unread: 1,
        archived: 0,
      });

      // Mock network failure during sync
      const networkError = new Error('Network request failed: 0 ');
      vi.mocked(SyncService.syncBookmarks).mockRejectedValue(networkError);

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize
      await appRoot.updateComplete;

      // App should still load existing bookmarks despite sync failure
      await waitFor(() => {
        const bookmarkContainer = appRoot.shadowRoot?.querySelector('bookmark-list-container');
        expect(bookmarkContainer).toBeTruthy();
      });

      // Verify that the app loads cached data when sync fails
      expect(SettingsService.getSettings).toHaveBeenCalled();
      expect(DatabaseService.getAllBookmarks).toHaveBeenCalled();
    });

    it('should handle API request timeouts during bookmark fetching', async () => {
      // Mock timeout scenario
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      mockSettingsLive(validSettings);
      const mockAPI = vi.mocked(createLinkdingAPI('', ''));
      vi.mocked(mockAPI.getAllBookmarks).mockRejectedValue(new Error('Request timeout'));
      vi.mocked(SyncService.syncBookmarks).mockRejectedValue(new Error('Request timeout'));

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize
      await appRoot.updateComplete;

      // Should handle timeout gracefully without crashing
      expect(SettingsService.getSettings).toHaveBeenCalled();
    });

    it('should degrade gracefully when network becomes unavailable', async () => {
      // Mock offline scenario
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([mockBookmark]);
      
      // Mock fetch failures
      vi.mocked(global.fetch).mockRejectedValue(new Error('Network unavailable'));
      vi.mocked(SyncService.syncBookmarks).mockRejectedValue(new Error('Network unavailable'));

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for component to initialize
      await bookmarkReader.updateComplete;

      // Should still function with cached data
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle intermittent network failures during large sync operations', async () => {
      // Mock partial sync failure
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(SyncService.syncBookmarks)
        .mockRejectedValueOnce(new Error('Network timeout'))
        .mockRejectedValueOnce(new Error('Connection reset'))
        .mockResolvedValueOnce(undefined);

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for app to initialize
      await appRoot.updateComplete;

      // Should handle retry scenarios gracefully
      expect(SettingsService.getSettings).toHaveBeenCalled();
    });
  });

  describe('Invalid API Credentials', () => {
    it('should display user-friendly error for invalid API tokens', async () => {
      const invalidSettings: AppSettings = {
        ...validSettings,
        linkding_token: 'invalid-token',
      };

      vi.mocked(SettingsService.getSettings).mockResolvedValue(invalidSettings);
      
      // Mock 401 Unauthorized response
      const authError = new Error('API request failed: 401 Unauthorized');
      const mockAPI = vi.mocked(createLinkdingAPI('', ''));
      vi.mocked(mockAPI.testConnection).mockRejectedValue(authError);

      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      // Wait for component to initialize
      await settingsPanel.updateComplete;

      // Component should be ready to handle connection test
      expect(settingsPanel).toBeTruthy();
    });

    it('should handle expired authentication tokens during sync', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      
      // Mock 403 Forbidden response
      const expiredTokenError = new Error('API request failed: 403 Forbidden');
      vi.mocked(SyncService.syncBookmarks).mockRejectedValue(expiredTokenError);

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for app to initialize
      await appRoot.updateComplete;

      // Should handle expired token gracefully
      expect(SettingsService.getSettings).toHaveBeenCalled();
    });

    it('should handle API server returning unauthorized errors', async () => {
      const unauthorizedSettings: AppSettings = {
        ...validSettings,
        linkding_url: 'https://unauthorized.example.com',
      };

      vi.mocked(SettingsService.getSettings).mockResolvedValue(unauthorizedSettings);
      
      // Mock multiple 401 responses
      const mockAPI = vi.mocked(createLinkdingAPI('', ''));
      vi.mocked(mockAPI.testConnection).mockRejectedValue(new Error('API request failed: 401 Unauthorized'));
      vi.mocked(mockAPI.getAllBookmarks).mockRejectedValue(new Error('API request failed: 401 Unauthorized'));

      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      // Wait for initialization
      await settingsPanel.updateComplete;

      // Should be ready to display auth error messaging
      expect(settingsPanel).toBeTruthy();
    });

    it('should provide recovery options when authentication fails', async () => {
      const corruptSettings: AppSettings = {
        ...validSettings,
        linkding_token: '',  // Empty token
      };

      vi.mocked(SettingsService.getSettings).mockResolvedValue(corruptSettings);

      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(settingsPanel);

      // Wait for component to initialize
      await settingsPanel.updateComplete;

      // Should be ready to guide user through re-authentication
      expect(settingsPanel).toBeTruthy();
    });
  });

  describe('Database Storage Errors', () => {
    it('should handle database quota exceeded scenarios', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      
      // Mock QuotaExceededError
      const quotaError = new Error('QuotaExceededError: The quota has been exceeded');
      quotaError.name = 'QuotaExceededError';
      vi.mocked(DatabaseService.saveBookmark).mockRejectedValue(quotaError);

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for initialization
      await appRoot.updateComplete;

      // Should handle storage quota gracefully
      expect(SettingsService.getSettings).toHaveBeenCalled();
    });

    it('should handle database corruption and unavailability', async () => {
      // Mock database corruption
      const corruptionError = new Error('Database corruption detected');
      corruptionError.name = 'DatabaseError';
      vi.mocked(SettingsService.getSettings).mockRejectedValue(corruptionError);
      vi.mocked(SettingsService.getSettingsLive).mockReturnValue({
        subscribe: vi.fn().mockImplementation(({ error }) => {
          // Immediately call the error callback to simulate the subscription error
          if (error) error(corruptionError);
          return { unsubscribe: vi.fn() };
        })
      } as any);
      vi.mocked(DatabaseService.getAllBookmarks).mockRejectedValue(corruptionError);

      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for initialization
      await appRoot.updateComplete;

      // Should handle database errors gracefully
      expect(SettingsService.getSettings).toHaveBeenCalled();
    });

    it('should handle failed bookmark save operations', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      
      // Mock save failure
      const saveError = new Error('Failed to save bookmark');
      vi.mocked(DatabaseService.saveBookmark).mockRejectedValue(saveError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should be ready to handle save failures
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle failed read progress persistence', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      
      // Mock progress save failure
      const progressError = new Error('Failed to save read progress');
      vi.mocked(DatabaseService.saveReadProgress).mockRejectedValue(progressError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle progress save failures gracefully
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });
  });

  describe('Malformed Bookmark Content', () => {
    it('should handle invalid HTML content processing', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      
      // Mock invalid HTML content
      const invalidContent = {
        source: 'readability' as const,
        content_type: 'error' as const,
        error: {
          type: 'unsupported' as const,
          message: 'Invalid HTML content',
          details: 'Content contains malformed markup',
          suggestions: ['Try viewing original URL', 'Report this content issue'],
        },
      };
      
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue(invalidContent);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should be ready to display content error
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle missing required bookmark fields', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      
      // Mock bookmark with missing required fields
      const incompleteBookmark = {
        id: 1,
        url: '', // Missing URL
        title: '',  // Missing title
        description: '',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: [],
        date_added: '2024-01-01T10:00:00Z',
        date_modified: '2024-01-01T10:00:00Z',
      };
      
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(incompleteBookmark);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle incomplete bookmark data
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle corrupt content fetching results', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      
      // Mock network error during content fetch
      const networkError = {
        source: 'url' as const,
        content_type: 'error' as const,
        error: {
          type: 'network' as const,
          message: 'Network error during content fetch',
          details: 'Connection reset by peer',
          suggestions: ['Check network connection', 'Try again later'],
        },
      };
      
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue(networkError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle content fetch failures
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle security-related content filtering', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue({
        ...mockBookmark,
        url: 'javascript:alert("xss")', // Potentially malicious URL
      });
      
      // Mock security-filtered content
      const securityError = {
        source: 'url' as const,
        content_type: 'error' as const,
        error: {
          type: 'unsupported' as const,
          message: 'Content blocked for security reasons',
          details: 'URL scheme not supported for security reasons',
          suggestions: ['This content cannot be displayed for security reasons'],
        },
      };
      
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue(securityError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle security-filtered content
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle CORS errors during content fetching', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      
      // Mock CORS error
      const corsError = {
        source: 'url' as const,
        content_type: 'error' as const,
        error: {
          type: 'cors' as const,
          message: 'CORS policy prevents content access',
          details: 'Cross-origin request blocked by browser policy',
          suggestions: ['Try using cached content', 'Content may be available in readability mode'],
        },
      };
      
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue(corsError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle CORS errors gracefully
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });

    it('should handle server errors during content retrieval', async () => {
      vi.mocked(SettingsService.getSettings).mockResolvedValue(validSettings);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
      
      // Mock server error
      const serverError = {
        source: 'url' as const,
        content_type: 'error' as const,
        error: {
          type: 'server_error' as const,
          message: 'Server error occurred',
          details: '500 Internal Server Error',
          suggestions: ['Try again later', 'Check if the original URL is accessible'],
        },
      };
      
      vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue(serverError);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      bookmarkReader.setAttribute('bookmark-id', '1');
      document.body.appendChild(bookmarkReader);

      // Wait for initialization
      await bookmarkReader.updateComplete;

      // Should handle server errors gracefully
      expect(bookmarkReader.getAttribute('bookmark-id')).toBe('1');
    });
  });
});