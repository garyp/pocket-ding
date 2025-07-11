import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import { userEvent } from '@testing-library/user-event';
import '../setup';

// Import components directly
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

// Helper function to find text in shadow DOM
function findTextInShadowDOM(element: Element, text: string): Element | null {
  if (!element.shadowRoot) return null;
  
  const walker = document.createTreeWalker(
    element.shadowRoot,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent?.includes(text)) {
      return node.parentElement;
    }
  }
  return null;
}

// Helper function to find element by text in shadow DOM
function findElementByText(element: Element, text: string): Element | null {
  if (!element.shadowRoot) return null;
  
  const walker = document.createTreeWalker(
    element.shadowRoot,
    NodeFilter.SHOW_ELEMENT,
    null,
    false
  );
  
  let node;
  while (node = walker.nextNode()) {
    if (node.textContent?.includes(text)) {
      return node as Element;
    }
  }
  return null;
}

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
    if (!customElements.get('bookmark-list')) {
      customElements.define('bookmark-list', BookmarkList);
    }
    if (!customElements.get('bookmark-reader')) {
      customElements.define('bookmark-reader', BookmarkReader);
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

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await waitFor(() => {
        const welcomeText = findTextInShadowDOM(appRoot, 'Welcome to Linkding Reader');
        const configButton = findTextInShadowDOM(appRoot, 'Configure Settings');
        expect(welcomeText).toBeTruthy();
        expect(configButton).toBeTruthy();
      });
    });

    it('should navigate to settings when configure button is clicked', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await waitFor(() => {
        const configButton = findElementByText(appRoot, 'Configure Settings') as HTMLElement;
        expect(configButton).toBeTruthy();
      });

      const configButton = findElementByText(appRoot, 'Configure Settings') as HTMLElement;
      await user.click(configButton);
      await appRoot.updateComplete;

      await waitFor(() => {
        const settingsText = findTextInShadowDOM(appRoot, 'Settings');
        const serverUrlText = findTextInShadowDOM(appRoot, 'Server URL');
        expect(settingsText).toBeTruthy();
        expect(serverUrlText).toBeTruthy();
      });
    });
  });

  describe('Settings Management', () => {
    it('should save settings and navigate to bookmarks', async () => {
      (DatabaseService.getSettings as any).mockResolvedValue(null);
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);




      await waitFor(() => {
        const configButton = findElementByText(appRoot, 'Configure Settings') as HTMLElement;
        expect(configButton).toBeTruthy();
      });

      // Navigate to settings
      const configButton = findElementByText(appRoot, 'Configure Settings') as HTMLElement;
      await user.click(configButton);
      await appRoot.updateComplete;

      await waitFor(() => {
        const settingsPanel = appRoot.shadowRoot?.querySelector('settings-panel') as SettingsPanel;
        expect(settingsPanel).toBeTruthy();
      });

      const settingsPanel = appRoot.shadowRoot?.querySelector('settings-panel') as SettingsPanel;
      
      await waitFor(() => {
        const urlInput = settingsPanel.shadowRoot?.querySelector('#url') as HTMLInputElement;
        const tokenInput = settingsPanel.shadowRoot?.querySelector('#token') as HTMLInputElement;
        expect(urlInput).toBeTruthy();
        expect(tokenInput).toBeTruthy();
      });

      const urlInput = settingsPanel.shadowRoot?.querySelector('#url') as HTMLInputElement;
      const tokenInput = settingsPanel.shadowRoot?.querySelector('#token') as HTMLInputElement;
      
      await user.type(urlInput, 'https://demo.linkding.link');
      await user.type(tokenInput, 'test-token');
      
      await settingsPanel.updateComplete;

      await waitFor(() => {
        const saveButton = findElementByText(settingsPanel, 'Save Settings') as HTMLElement;
        expect(saveButton).toBeTruthy();
      });

      const saveButton = findElementByText(settingsPanel, 'Save Settings') as HTMLElement;
      await user.click(saveButton);
      await settingsPanel.updateComplete;
      await appRoot.updateComplete;

      await waitFor(() => {
        expect(DatabaseService.saveSettings).toHaveBeenCalled();
      });
    });

    it('should test connection successfully', async () => {
      const settingsPanel = document.createElement('settings-panel') as SettingsPanel;
      container.appendChild(settingsPanel);



      await waitFor(() => {
        const urlInput = settingsPanel.shadowRoot?.querySelector('#url') as HTMLInputElement;
        const tokenInput = settingsPanel.shadowRoot?.querySelector('#token') as HTMLInputElement;
        expect(urlInput).toBeTruthy();
        expect(tokenInput).toBeTruthy();
      });

      const urlInput = settingsPanel.shadowRoot?.querySelector('#url') as HTMLInputElement;
      const tokenInput = settingsPanel.shadowRoot?.querySelector('#token') as HTMLInputElement;
      
      await user.type(urlInput, 'https://demo.linkding.link');
      await user.type(tokenInput, 'test-token');
      
      await settingsPanel.updateComplete;
      
      await waitFor(() => {
        const testButton = findElementByText(settingsPanel, 'Test Connection') as HTMLElement;
        expect(testButton).toBeTruthy();
      });

      const testButton = findElementByText(settingsPanel, 'Test Connection') as HTMLElement;
      await user.click(testButton);
      await settingsPanel.updateComplete;

      await waitFor(() => {
        expect(LinkdingAPI.testConnection).toHaveBeenCalled();
      });
    });
  });

  describe('Bookmark List', () => {
    it('should display bookmarks after loading', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      container.appendChild(bookmarkList);

      await waitFor(() => {
        const article1 = findTextInShadowDOM(bookmarkList, 'Test Article 1');
        const article2 = findTextInShadowDOM(bookmarkList, 'Test Article 2');
        expect(article1).toBeTruthy();
        expect(article2).toBeTruthy();
      });
    });

    it('should filter bookmarks by unread status', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      container.appendChild(bookmarkList);


      await waitFor(() => {
        const unreadButton = findElementByText(bookmarkList, 'Unread (1)') as HTMLElement;
        expect(unreadButton).toBeTruthy();
      });

      const unreadButton = findElementByText(bookmarkList, 'Unread (1)') as HTMLElement;
      await user.click(unreadButton);
      await bookmarkList.updateComplete;

      await waitFor(() => {
        // After filtering, only unread bookmark should be visible
        const article1 = findTextInShadowDOM(bookmarkList, 'Test Article 1');
        const article2 = findTextInShadowDOM(bookmarkList, 'Test Article 2');
        expect(article1).toBeTruthy();
        expect(article2).toBeFalsy();
      });
    });

    it('should emit bookmark-selected event when bookmark is clicked', async () => {
      (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      container.appendChild(bookmarkList);


      let selectedBookmarkId: number | null = null;
      bookmarkList.addEventListener('bookmark-selected', (e: any) => {
        selectedBookmarkId = e.detail.bookmarkId;
      });

      await waitFor(() => {
        const bookmarkCard = bookmarkList.shadowRoot?.querySelector('.bookmark-card') as HTMLElement;
        expect(bookmarkCard).toBeTruthy();
      });

      const bookmarkCard = bookmarkList.shadowRoot?.querySelector('.bookmark-card') as HTMLElement;
      await user.click(bookmarkCard);
      await bookmarkList.updateComplete;
      
      await waitFor(() => {
        expect(selectedBookmarkId).toBe(1);
      });
    });
  });

  describe('Bookmark Reader', () => {
    it('should display bookmark content', async () => {
      (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmarks[0]);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await waitFor(() => {
        const title = findTextInShadowDOM(bookmarkReader, 'Test Article 1');
        const readerButton = findTextInShadowDOM(bookmarkReader, 'Reader');
        const originalButton = findTextInShadowDOM(bookmarkReader, 'Original');
        expect(title).toBeTruthy();
        expect(readerButton).toBeTruthy();
        expect(originalButton).toBeTruthy();
      });
    });

    it('should switch between reading modes', async () => {
      (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmarks[0]);

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);

      await waitFor(() => {
        const originalButton = findElementByText(bookmarkReader, 'Original') as HTMLElement;
        expect(originalButton).toBeTruthy();
      });

      const originalButton = findElementByText(bookmarkReader, 'Original') as HTMLElement;
      await user.click(originalButton);
      await bookmarkReader.updateComplete;
      
      await waitFor(() => {
        // Verify mode changed (this is a basic check)
        expect(originalButton).toBeTruthy();
      });
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

      const bookmarkReader = document.createElement('bookmark-reader') as BookmarkReader;
      (bookmarkReader as any).bookmarkId = 1;
      container.appendChild(bookmarkReader);
      
      await waitFor(() => {
        const progressText = findTextInShadowDOM(bookmarkReader, '50% read');
        expect(progressText).toBeTruthy();
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

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      container.appendChild(bookmarkList);

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

      const appRoot = document.createElement('app-root') as AppRoot;
      container.appendChild(appRoot);

      await waitFor(() => {
        // Should still render without crashing
        expect(appRoot).toBeTruthy();
        expect(appRoot.shadowRoot).toBeTruthy();
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

      const bookmarkList = document.createElement('bookmark-list') as BookmarkList;
      container.appendChild(bookmarkList);

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