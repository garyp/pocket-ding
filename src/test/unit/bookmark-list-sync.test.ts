import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { waitFor } from '@testing-library/dom';
import '../setup';

// Mock dependencies
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getAllBookmarks: vi.fn(),
    getCompletedAssetsByBookmarkId: vi.fn(),
  },
}));

vi.mock('../../services/sync-service', () => ({
  SyncService: {
    getInstance: vi.fn(),
    syncBookmarks: vi.fn(),
    isSyncInProgress: vi.fn(),
    getCurrentSyncProgress: vi.fn(),
  },
}));

import { BookmarkList } from '../../components/bookmark-list';
import { DatabaseService } from '../../services/database';
import { SyncService } from '../../services/sync-service';
import type { LocalBookmark, AppSettings } from '../../types';

describe('BookmarkList Background Sync', () => {
  let element: BookmarkList;
  let mockSyncService: any;
  let mockEventListeners: { [key: string]: Function[] };

  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  const mockBookmarks: LocalBookmark[] = [
    {
      id: 1,
      url: 'https://example.com/article1',
      title: 'Test Article 1',
      description: 'This is a test article',
      tag_names: ['test'],
      date_added: '2024-01-01T10:00:00Z',
      date_modified: '2024-01-01T10:00:00Z',
      unread: true,
      is_archived: false,
      last_read_at: '',
      read_progress: 0,
      reading_mode: 'readability',
      is_synced: true,
      notes: '',
      website_title: '',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      needs_read_sync: false,
      shared: false,
    },
    {
      id: 2,
      url: 'https://example.com/article2',
      title: 'Test Article 2',
      description: 'Another test article',
      tag_names: ['test', 'example'],
      date_added: '2024-01-02T10:00:00Z',
      date_modified: '2024-01-02T10:00:00Z',
      unread: false,
      is_archived: false,
      last_read_at: '2024-01-02T12:00:00Z',
      read_progress: 75,
      reading_mode: 'original',
      is_synced: true,
      notes: '',
      website_title: '',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      needs_read_sync: false,
      shared: false,
    },
  ];

  beforeEach(async () => {
    // Setup mock event listeners tracking
    mockEventListeners = {};
    
    // Create mock sync service
    mockSyncService = {
      addEventListener: vi.fn((event: string, listener: Function) => {
        if (!mockEventListeners[event]) {
          mockEventListeners[event] = [];
        }
        mockEventListeners[event].push(listener);
      }),
      removeEventListener: vi.fn((event: string, listener: Function) => {
        if (mockEventListeners[event]) {
          const index = mockEventListeners[event].indexOf(listener);
          if (index > -1) {
            mockEventListeners[event].splice(index, 1);
          }
        }
      }),
    };

    // Mock SyncService.getInstance to return our mock
    (SyncService.getInstance as any).mockReturnValue(mockSyncService);
    (SyncService.syncBookmarks as any).mockResolvedValue(undefined);
    (SyncService.isSyncInProgress as any).mockReturnValue(false);
    (SyncService.getCurrentSyncProgress as any).mockReturnValue({ current: 0, total: 0 });

    // Setup database mocks
    (DatabaseService.getAllBookmarks as any).mockResolvedValue(mockBookmarks);
    (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([]);
    (DatabaseService.getSettings as any).mockResolvedValue(mockSettings);

    // Create and connect component
    element = new BookmarkList();
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    if (element && document.body.contains(element)) {
      document.body.removeChild(element);
    }
  });

  const triggerSyncEvent = (eventType: string, detail: any) => {
    const listeners = mockEventListeners[eventType] || [];
    const event = new CustomEvent(eventType, { detail });
    listeners.forEach(listener => listener(event));
  };

  describe('Event Listener Setup', () => {
    it('should register all sync event listeners on connect', () => {
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-initiated', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
    });

    it('should remove all sync event listeners on disconnect', () => {
      element.remove();
      
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-initiated', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
    });
  });

  describe('Sync Initiated Event', () => {
    it('should show immediate sync feedback when sync is initiated', async () => {
      triggerSyncEvent('sync-initiated', {});
      await element.updateComplete;

      const progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();
      
      const progressText = element.shadowRoot?.querySelector('.sync-progress-text span');
      expect(progressText?.textContent).toContain('Starting sync...');
    });

    it('should show indeterminate progress bar when total is unknown', async () => {
      triggerSyncEvent('sync-initiated', {});
      await element.updateComplete;

      const progressBar = element.shadowRoot?.querySelector('sl-progress-bar');
      expect(progressBar?.hasAttribute('indeterminate')).toBe(true);
    });

    it('should switch to determinate progress bar when total is known', async () => {
      // Start with indeterminate
      triggerSyncEvent('sync-initiated', {});
      await element.updateComplete;

      let progressBar = element.shadowRoot?.querySelector('sl-progress-bar');
      expect(progressBar?.hasAttribute('indeterminate')).toBe(true);

      // Switch to determinate when total is known
      triggerSyncEvent('sync-started', { total: 10 });
      await element.updateComplete;

      progressBar = element.shadowRoot?.querySelector('sl-progress-bar');
      expect(progressBar?.hasAttribute('indeterminate')).toBe(false);
      expect(progressBar?.getAttribute('value')).toBe('0');
    });

    it('should clear synced bookmark tracking on sync initiation', async () => {
      // Add some synced bookmarks first
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 2 
      });
      await element.updateComplete;

      // Initiate new sync
      triggerSyncEvent('sync-initiated', {});
      await element.updateComplete;

      // Synced bookmarks should be cleared
      const bookmarkCard = element.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(bookmarkCard).toBeFalsy();
    });
  });

  describe('Sync Started Event', () => {
    it('should show sync progress bar when sync starts', async () => {
      triggerSyncEvent('sync-started', { total: 5 });
      await element.updateComplete;

      const progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();
      expect(progressContainer?.textContent).toContain('0/5');
    });

    it('should clear synced bookmark tracking on sync start', async () => {
      // Add some synced bookmarks first
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 2 
      });
      await element.updateComplete;

      // Start new sync
      triggerSyncEvent('sync-started', { total: 3 });
      await element.updateComplete;

      // Synced bookmarks should be cleared
      const bookmarkCard = element.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(bookmarkCard).toBeFalsy();
    });
  });

  describe('Sync Progress Event', () => {
    it('should update progress bar during sync', async () => {
      triggerSyncEvent('sync-started', { total: 10 });
      await element.updateComplete;

      triggerSyncEvent('sync-progress', { current: 3, total: 10 });
      await element.updateComplete;

      const progressText = element.shadowRoot?.querySelector('.sync-progress-text span');
      expect(progressText?.textContent).toContain('3/10');

      const progressBar = element.shadowRoot?.querySelector('sl-progress-bar');
      expect(progressBar?.getAttribute('value')).toBe('30');
    });
  });

  describe('Bookmark Synced Event', () => {
    it('should add new bookmark to list when synced', async () => {
      const newBookmark: LocalBookmark = {
        id: 999,
        url: 'https://example.com/new',
        title: 'New Synced Bookmark',
        description: 'A newly synced bookmark',
        tag_names: ['new'],
        date_added: '2024-01-03T10:00:00Z',
        date_modified: '2024-01-03T10:00:00Z',
        unread: true,
        is_archived: false,
        last_read_at: '',
        read_progress: 0,
        reading_mode: 'readability',
        is_synced: true,
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        needs_read_sync: false,
        shared: false,
      };

      triggerSyncEvent('bookmark-synced', { 
        bookmark: newBookmark, 
        current: 1, 
        total: 1 
      });
      await element.updateComplete;

      const bookmarkTitles = Array.from(
        element.shadowRoot?.querySelectorAll('.bookmark-title') || []
      ).map(el => el.textContent);
      
      expect(bookmarkTitles).toContain('New Synced Bookmark');
    });

    it('should update existing bookmark when synced', async () => {
      const updatedBookmark: LocalBookmark = {
        ...mockBookmarks[0],
        title: 'Updated Title',
        description: 'Updated description',
      } as LocalBookmark;

      triggerSyncEvent('bookmark-synced', { 
        bookmark: updatedBookmark, 
        current: 1, 
        total: 1 
      });
      await element.updateComplete;

      const bookmarkTitles = Array.from(
        element.shadowRoot?.querySelectorAll('.bookmark-title') || []
      ).map(el => el.textContent);
      
      expect(bookmarkTitles).toContain('Updated Title');
      expect(bookmarkTitles).not.toContain('Test Article 1');
    });

    it('should highlight synced bookmark with animation class', async () => {
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 1 
      });
      await element.updateComplete;

      const syncedCard = element.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(syncedCard).toBeTruthy();
    });

    it('should update assets status for synced bookmark', async () => {
      // Mock bookmark having assets after sync - set this up before the event
      (DatabaseService.getCompletedAssetsByBookmarkId as any).mockResolvedValue([
        { id: 1, status: 'complete' }
      ]);

      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 1 
      });
      
      // Wait for the async asset check in handleBookmarkSynced to complete
      await new Promise(resolve => setTimeout(resolve, 10));
      await element.updateComplete;

      // Check for cached badge by looking for download icon
      const downloadIcon = element.shadowRoot?.querySelector('sl-icon[name="download"]');
      expect(downloadIcon).toBeTruthy();
    });
  });

  describe('Sync Completed Event', () => {
    it('should hide sync progress bar when sync completes', async () => {
      triggerSyncEvent('sync-started', { total: 2 });
      await element.updateComplete;

      let progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      triggerSyncEvent('sync-completed', { processed: 2 });
      await element.updateComplete;

      progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();
    });

    it('should clear synced bookmark highlights when sync completes', async () => {
      // First start a sync to enable sync mode
      triggerSyncEvent('sync-started', { total: 1 });
      await element.updateComplete;
      
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 1 
      });
      await element.updateComplete;

      let syncedCard = element.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(syncedCard).toBeTruthy();

      triggerSyncEvent('sync-completed', { processed: 1 });
      await element.updateComplete;

      syncedCard = element.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(syncedCard).toBeFalsy();
    });
  });

  describe('Sync Error Event', () => {
    it('should hide sync progress bar on error', async () => {
      triggerSyncEvent('sync-started', { total: 2 });
      await element.updateComplete;

      let progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      triggerSyncEvent('sync-error', { error: new Error('Sync failed') });
      await element.updateComplete;

      progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();
    });
  });

  describe('Sync Request Handling', () => {
    it('should trigger sync when sync-requested event is dispatched', async () => {
      const syncRequestEvent = new CustomEvent('sync-requested');
      element.dispatchEvent(syncRequestEvent);

      await waitFor(() => {
        expect(SyncService.syncBookmarks).toHaveBeenCalledWith(mockSettings);
      });
    });

    it('should not trigger multiple syncs if already syncing', async () => {
      // Start first sync
      triggerSyncEvent('sync-started', { total: 2 });
      await element.updateComplete;

      // Clear previous call
      (SyncService.syncBookmarks as any).mockClear();

      // Try to start another sync
      const syncRequestEvent = new CustomEvent('sync-requested');
      element.dispatchEvent(syncRequestEvent);

      // Should not call sync again since already syncing
      expect(SyncService.syncBookmarks).not.toHaveBeenCalled();
    });
  });

  describe('Real-time UI Updates', () => {
    it('should maintain user scroll position during sync updates', async () => {
      // This would require more complex DOM testing, but the concept is important
      // for UX - sync updates should not disrupt user reading
      
      triggerSyncEvent('sync-started', { total: 5 });
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 5 
      });
      await element.updateComplete;

      // Verify the DOM structure remains stable
      const bookmarkList = element.shadowRoot?.querySelector('.bookmark-list');
      expect(bookmarkList).toBeTruthy();
      
      const bookmarkCards = element.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBeGreaterThan(0);
    });

    it('should show sticky progress bar that does not interfere with reading', async () => {
      triggerSyncEvent('sync-started', { total: 3 });
      await element.updateComplete;

      const progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();
      
      // Check that the progress container has the right CSS classes for styling
      expect(progressContainer?.className).toContain('sync-progress');
    });
  });

  describe('Ongoing Sync Detection', () => {
    it('should detect and show ongoing sync when component connects', async () => {
      // Mock an ongoing sync
      (SyncService.isSyncInProgress as any).mockReturnValue(true);
      (SyncService.getCurrentSyncProgress as any).mockReturnValue({ current: 3, total: 7 });

      // Create a new component (simulating navigation back to bookmark list)
      const newElement = new BookmarkList();
      document.body.appendChild(newElement);
      await newElement.updateComplete;
      
      // Wait for checkOngoingSync to complete and trigger another render
      await new Promise(resolve => setTimeout(resolve, 10));
      await newElement.updateComplete;

      // Should show sync progress immediately
      const progressContainer = newElement.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      const progressText = newElement.shadowRoot?.querySelector('.sync-progress-text span');
      expect(progressText?.textContent).toContain('3/7');

      // Cleanup
      if (document.body.contains(newElement)) {
        document.body.removeChild(newElement);
      }
    });

    it('should not show sync progress when no sync is ongoing', async () => {
      // Ensure no ongoing sync
      (SyncService.isSyncInProgress as any).mockReturnValue(false);

      // Create a new component
      const newElement = new BookmarkList();
      document.body.appendChild(newElement);
      await newElement.updateComplete;

      // Should not show sync progress
      const progressContainer = newElement.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();

      // Cleanup
      document.body.removeChild(newElement);
    });

    it('should clear stale synced bookmark highlights when reconnecting during sync', async () => {
      // Mock an ongoing sync
      (SyncService.isSyncInProgress as any).mockReturnValue(true);
      (SyncService.getCurrentSyncProgress as any).mockReturnValue({ current: 2, total: 5 });

      // Create a new component
      const newElement = new BookmarkList();
      document.body.appendChild(newElement);
      await newElement.updateComplete;

      // Should not have any synced bookmarks highlighted (stale highlights cleared)
      const syncedCards = newElement.shadowRoot?.querySelectorAll('.bookmark-card.synced');
      expect(syncedCards?.length).toBe(0);

      // Cleanup
      document.body.removeChild(newElement);
    });
  });
});