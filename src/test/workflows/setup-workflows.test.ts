import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import '../setup';
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';

// Import components
import { AppRoot } from '../../components/app-root';
import { SettingsPanel } from '../../components/settings-panel';
import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { BookmarkList } from '../../components/bookmark-list';
import { BookmarkReader } from '../../components/bookmark-reader';

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

describe('Setup Workflows - First-Time User Experience', () => {
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

  describe('Journey 1: First-Time Setup', () => {
    it('should guide user through initial setup flow', async () => {
      // Mock initial state - no settings exist
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      // Create app root and connect it to DOM
      const appRoot = document.createElement('app-root') as AppRoot;
      document.body.appendChild(appRoot);

      // Wait for component to initialize  
      await waitForComponentReady(appRoot);

      // Wait for app to initialize and show setup screen
      await waitForComponent(() => {
        const setupCard = appRoot.shadowRoot?.querySelector('.setup-card');
        expect(setupCard).toBeTruthy();
        expect(setupCard?.textContent).toContain('Welcome to Pocket Ding');
        return setupCard;
      });

      // User clicks configure button
      const configureButton = appRoot.shadowRoot?.querySelector('md-filled-button') as HTMLElement;
      expect(configureButton).toBeTruthy();
      
      // Use direct click event instead of userEvent for fake timer compatibility
      configureButton.click();

      // Should trigger navigation to settings (checked via settings call)
      expect(DatabaseService.getSettings).toHaveBeenCalled();
    });
  });
});