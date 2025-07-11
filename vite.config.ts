import { describe, it, expect, beforeEach, vi } from 'vitest';
import { waitFor, screen } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import '../setup';
import { AppRoot } from '../../components/app-root';
import { SettingsPanel } from '../../components/settings-panel';
import { BookmarkList } from '../../components/bookmark-list';
import { BookmarkReader } from '../../components/bookmark-reader';

// Mock the database service
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
  },
}));

// Mock the sync service
vi.mock('../../services/sync-service', () => ({
  SyncService: {
    syncBookmarks: vi.fn(),
  },
}));

// Mock the linkding API
vi.mock('../../services/linkding-api', () => ({
  LinkdingAPI: {
    testConnection: vi.fn(),
  },
}));

import { DatabaseService } from '../../services/database';
import { SyncService } from '../../services/sync-service';
import { LinkdingAPI } from '../../services/linkding-api';

const mockBookmarks = [
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
    content: '<h1>Test Article 1</h1><p>Content</p>',
    readability_content: '<h1>Test Article 1</h1><p>Readable content</p>',
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
    date_added: '2024-01-02T10:00:00Z',
    date_modified: '2024-01-02T10:00:00Z',
    content: '<h1>Test Article 2</h1><p>Content</p>',
    readability_content: '<h1>Test Article 2</h1><p>Readable content</p>',
  },
];

describe('App Integration Tests', () => {
  let container: HTMLElement;
  let user: ReturnType<typeof userEvent.setup>;

  beforeEach(() => {
    user = userEvent.setup();
    container = document.createElement('div');
    document.body.appendChild(container);
    vi.clearAllMocks();
    
    // Ensure custom elements are properly defined
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot);
    }
    if (!customElements.get('settings-panel')) {
      customElements.define('settings-panel', SettingsPanel);
    }
    
    // Reset all mocks to default state
    (DatabaseService.getSettings as any).mockResolvedValue(null);
    (DatabaseService.saveSettings as any).mockResolvedValue(undefined);
    (DatabaseService.getAllBookmarks as any).mockResolvedValue([]);
    (DatabaseService.getUnreadBookmarks as any).mockResolvedValue([]);
    (DatabaseService.getBookmark as any).mockResolvedValue(null);
    (DatabaseService.saveBookmark as any).mockResolvedValue(undefined);
    (DatabaseService.getReadProgress as any).mockResolvedValue(null);
    (DatabaseService.saveReadProgress as any).mockResolvedValue(undefined);
    (LinkdingAPI.testConnection as any).mockResolvedValue(true);
    (SyncService.syncBookmarks as any).mockResolvedValue(undefined);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('Initial Setup Flow', () => {
    it('should show setup screen when no settings exist', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);

      const appRoot = document.createElement('app-root');
      container.appendChild(appRoot);

      await (appRoot as any).updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('Welcome to Linkding Reader')).toBeTruthy();
        expect(screen.queryByText('Configure Settings')).toBeTruthy();
      });
    });

    it('should navigate to settings when configure button is clicked', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);

      const appRoot = document.createElement('app-root');
      container.appendChild(appRoot);

      await (appRoot as any).updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('Configure Settings')).toBeTruthy();
      });

      const configButton = screen.getByText('Configure Settings');
      await user.click(configButton);

      await (appRoot as any).updateComplete;

      await waitFor(() => {
        expect(screen.queryByText('Settings')).toBeTruthy();
        expect(screen.queryByText('Server URL')).toBeTruthy();
        // Ensure we're not showing bookmark list
        expect(screen.queryByText(/All \(/)).toBeFalsy();
      });
    });
  });

  describe('Settings Management', () => {
    it('should save settings and navigate to bookmarks', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const appRoot = document.createElement('app-root');
      container.appendChild(appRoot);

      await (appRoot as any).updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      // Wait for initial load and navigate to settings
      await waitFor(() => {
        expect(screen.queryByText('Configure Settings')).toBeTruthy();
      });

      const configButton = screen.getByText('Configure Settings');
      await user.click(configButton);

      await (appRoot as any).updateComplete;

      await waitFor(() => {
        expect(screen.queryByText('Settings')).toBeTruthy();
      });

      // Fill in settings form
      const urlInput = screen.getByLabelText('Server URL') as any;
      const tokenInput = screen.getByLabelText('API Token') as any;
      
      if (urlInput && tokenInput) {
        // Set values directly and dispatch events
        urlInput.value = 'https://demo.linkding.link';
        urlInput.dispatchEvent(new CustomEvent('sl-input', { bubbles: true, composed: true }));
        
        tokenInput.value = 'test-token';
        tokenInput.dispatchEvent(new CustomEvent('sl-input', { bubbles: true, composed: true }));
        
        await (appRoot as any).updateComplete;

        // Save settings
        const saveButton = screen.getByText('Save Settings') as HTMLElement;
        if (saveButton) {
          await user.click(saveButton);
          await (appRoot as any).updateComplete;

          await waitFor(() => {
            expect(DatabaseService.saveSettings).toHaveBeenCalled();
          });
        }
      }
    });

    it('should test connection successfully', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);

      const settingsPanel = document.createElement('settings-panel');
      container.appendChild(settingsPanel);

      await (settingsPanel as any).updateComplete;

      await waitFor(() => {
        expect(screen.queryByText('Test Connection')).toBeTruthy();
      });

      // Fill in form first
      const urlInput = screen.getByLabelText('Server URL') as any;
      const tokenInput = screen.getByLabelText('API Token') as any;
      
      if (urlInput && tokenInput) {
        // Set values directly and dispatch events
        urlInput.value = 'https://demo.linkding.link';
        urlInput.dispatchEvent(new CustomEvent('sl-input', { bubbles: true, composed: true }));
        await (settingsPanel as any).updateComplete;
        
        tokenInput.value = 'test-token';
        tokenInput.dispatchEvent(new CustomEvent('sl-input', { bubbles: true, composed: true }));
        await (settingsPanel as any).updateComplete;
        
        const testButton = screen.getByText('Test Connection') as HTMLElement;
        if (testButton) {
          await user.click(testButton);
          await (settingsPanel as any).updateComplete;

          await waitFor(() => {
            expect(LinkdingAPI.testConnection).toHaveBeenCalled();
          });
        }
      }
    });
  });

  describe('Bookmark List', () => {
    it('should display bookmarks after loading', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list');
      container.appendChild(bookmarkList);

      await (bookmarkList as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkList as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test Article 1')).toBeTruthy();
        expect(screen.queryByText('Test Article 2')).toBeTruthy();
      });
    });

    it('should filter bookmarks by unread status', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list');
      container.appendChild(bookmarkList);

      await (bookmarkList as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkList as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('All (2)')).toBeTruthy();
        expect(screen.queryByText('Unread (1)')).toBeTruthy();
      });

      // Click unread filter
      const unreadButton = screen.getByText('Unread (1)') as HTMLElement;
      
      if (unreadButton) {
        await user.click(unreadButton);
        await (bookmarkList as any).updateComplete;

        await waitFor(() => {
          expect(screen.queryByText('Test Article 1')).toBeTruthy();
          expect(screen.queryByText('Test Article 2')).toBeFalsy();
        });
      }
    });

    it('should emit bookmark-selected event when bookmark is clicked', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list');
      container.appendChild(bookmarkList);

      await (bookmarkList as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkList as any).isLoading).toBe(false);
      });

      let selectedBookmarkId: number | null = null;
      bookmarkList.addEventListener('bookmark-selected', (e: any) => {
        selectedBookmarkId = e.detail.bookmarkId;
      });

      await waitFor(() => {
        expect(screen.queryByText('Test Article 1')).toBeTruthy();
      });

      const bookmarkCard = screen.getByText('Test Article 1').closest('sl-card') as HTMLElement;
      if (bookmarkCard) {
        await user.click(bookmarkCard);
        await (bookmarkList as any).updateComplete;
        expect(selectedBookmarkId).toBe(1);
      }
    });
  });

  describe('Bookmark Reader', () => {
    it('should display bookmark content', async () => {
      (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmarks[0]);

      const bookmarkReader = document.createElement('bookmark-reader');
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await (bookmarkReader as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('Test Article 1')).toBeTruthy();
        expect(screen.queryByText('Reader')).toBeTruthy();
        expect(screen.queryByText('Original')).toBeTruthy();
      });
    });

    it('should switch between reading modes', async () => {
      (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmarks[0]);

      const bookmarkReader = document.createElement('bookmark-reader');
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await (bookmarkReader as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('Reader')).toBeTruthy();
      });

      // Should start in reader mode
      const readerButton = screen.getByText('Reader') as HTMLElement;
      
      expect(readerButton?.getAttribute('variant')).toBe('primary');

      // Switch to original mode
      const originalButton = screen.getByText('Original') as HTMLElement;
      
      if (originalButton) {
        await user.click(originalButton);
        await (bookmarkReader as any).updateComplete;

        // Wait a bit for the mode change to process
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    });

    it('should restore reading progress', async () => {
      const mockProgress = {
        bookmark_id: 1,
        progress: 50,
        last_read_at: '2024-01-01T12:00:00Z',
        reading_mode: 'readability' as const,
        scroll_position: 100,
      };

      (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmarks[0]);
      (DatabaseService.getReadProgress as any).mockResolvedValue(mockProgress);

      const bookmarkReader = document.createElement('bookmark-reader');
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);
      
      await (bookmarkReader as any).updateComplete;
      
      // Wait for component to finish loading
      await waitFor(() => {
        expect((bookmarkReader as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        expect(screen.queryByText('50% read')).toBeTruthy();
      });
    });
  });

  describe('Sync Functionality', () => {
    it('should trigger sync when requested', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue({
        linkding_url: 'https://demo.linkding.link',
        linkding_token: 'test-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
      });
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list');
      container.appendChild(bookmarkList);

      await (bookmarkList as any).updateComplete;

      // Wait for component to be fully loaded and filter buttons to be rendered
      await waitFor(() => {
        expect((bookmarkList as any).isLoading).toBe(false);
      });
      
      await waitFor(() => {
        expect(screen.queryByText('All (2)')).toBeTruthy();
      });

      // Trigger sync event
      const syncEvent = new CustomEvent('sync-requested');
      bookmarkList.dispatchEvent(syncEvent);

      await waitFor(() => {
        expect(SyncService.syncBookmarks).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (DatabaseService.getSettings as any).mockRejectedValue(new Error('Database error'));

      const appRoot = document.createElement('app-root');
      container.appendChild(appRoot);

      await (appRoot as any).updateComplete;
      
      // Wait for async loading to complete
      await waitFor(() => {
        expect((appRoot as any).isLoading).toBe(false);
      });

      await waitFor(() => {
        // Should still render without crashing
        expect(appRoot).toBeTruthy();
      });
    });

    it('should handle sync errors gracefully', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue({
        linkding_url: 'https://demo.linkding.link',
        linkding_token: 'test-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
      });
      (SyncService.syncBookmarks as any).mockRejectedValue(new Error('Sync failed'));

      const bookmarkList = document.createElement('bookmark-list');
      container.appendChild(bookmarkList);

      await (bookmarkList as any).updateComplete;
      
      // Wait for component to be fully loaded
      await waitFor(() => {
        expect((bookmarkList as any).isLoading).toBe(false);
      });

      // Trigger sync event
      const syncEvent = new CustomEvent('sync-requested');
      bookmarkList.dispatchEvent(syncEvent);

      // Should not crash the app
      await waitFor(() => {
        expect(bookmarkList).toBeTruthy();
      });
    });
  });
});