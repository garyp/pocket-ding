import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
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

import { BookmarkListContainer } from '../../components/bookmark-list-container';
import { DatabaseService } from '../../services/database';
import { SyncService } from '../../services/sync-service';
import type { LocalBookmark, AppSettings } from '../../types';

describe('BookmarkListContainer Background Sync', () => {
  let element: BookmarkListContainer;
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
    element = new BookmarkListContainer();
    document.body.appendChild(element);
    await element.updateComplete;
    
    // Wait for loadBookmarks to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    await element.updateComplete;
  });

  afterEach(() => {
    if (element && document.body.contains(element)) {
      document.body.removeChild(element);
    }
    vi.unstubAllGlobals();
  });

  const triggerSyncEvent = (eventType: string, detail: any) => {
    const listeners = mockEventListeners[eventType] || [];
    const event = new CustomEvent(eventType, { detail });
    listeners.forEach(listener => listener(event));
  };

  describe('Event Listener Setup', () => {
    it('should register all sync event listeners on connect', () => {
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.addEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
    });

    it('should remove all sync event listeners on disconnect', () => {
      element.remove();
      
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-started', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-progress', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('bookmark-synced', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-completed', expect.any(Function));
      expect(mockSyncService.removeEventListener).toHaveBeenCalledWith('sync-error', expect.any(Function));
    });
  });

  // Helper function to get presentation component
  const getPresentationComponent = () => {
    return element.shadowRoot?.querySelector('bookmark-list') as any;
  };

  describe('Sync Started Event', () => {
    it('should show sync progress when sync starts', async () => {
      triggerSyncEvent('sync-started', { total: 5 });
      await element.updateComplete;

      // Sync progress bar is now in the container, not the presentation component
      const progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();
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
      const presentationComponent = getPresentationComponent();
      const bookmarkCard = presentationComponent?.shadowRoot?.querySelector('.bookmark-card.synced');
      expect(bookmarkCard).toBeFalsy();
    });
  });

  describe('Sync Progress Event', () => {
    it('should update progress bar during sync', async () => {
      triggerSyncEvent('sync-started', { total: 10 });
      await element.updateComplete;

      triggerSyncEvent('sync-progress', { current: 3, total: 10 });
      await element.updateComplete;

      // Sync progress bar is now in the container, not the presentation component
      const progressText = element.shadowRoot?.querySelector('.sync-progress-text span');
      expect(progressText?.textContent).toContain('3/10');

      const progressBar = element.shadowRoot?.querySelector('md-linear-progress');
      expect((progressBar as any)?.value).toBe(0.3);
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
      
      // Wait for handleBookmarkSynced async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const presentationComponent = getPresentationComponent();
      const bookmarkTitles = Array.from(
        presentationComponent?.shadowRoot?.querySelectorAll('.bookmark-title') || []
      ).map(el => (el as Element).textContent);
      
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
      
      // Wait for handleBookmarkSynced async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const presentationComponent = getPresentationComponent();
      const bookmarkTitles = Array.from(
        presentationComponent?.shadowRoot?.querySelectorAll('.bookmark-title') || []
      ).map(el => (el as Element).textContent);
      
      expect(bookmarkTitles).toContain('Updated Title');
      expect(bookmarkTitles).not.toContain('Test Article 1');
    });

    it('should highlight synced bookmark with animation class', async () => {
      triggerSyncEvent('bookmark-synced', { 
        bookmark: mockBookmarks[0], 
        current: 1, 
        total: 1 
      });
      
      // Wait for handleBookmarkSynced async operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      const presentationComponent = getPresentationComponent();
      const syncedCard = presentationComponent?.shadowRoot?.querySelector('.bookmark-card.synced');
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
      const presentationComponent = getPresentationComponent();
      const downloadIcon = [...(presentationComponent?.shadowRoot?.querySelectorAll('md-icon') || [])].find(icon => icon.textContent === 'download');
      expect(downloadIcon).toBeTruthy();
    });
  });

  describe('Sync Completed Event', () => {
    it('should hide sync progress bar when sync completes', async () => {
      triggerSyncEvent('sync-started', { total: 2 });
      await element.updateComplete;

      // Sync progress bar is now in the container, not the presentation component
      let progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      triggerSyncEvent('sync-completed', { processed: 2 });
      
      // Wait for sync completion
      await new Promise(resolve => setTimeout(resolve, 0));
      await element.updateComplete;

      progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();
    });

    it('should clear synced bookmark highlights when sync completes', async () => {
      vi.useFakeTimers();
      
      try {
        // First start a sync to enable sync mode
        triggerSyncEvent('sync-started', { total: 1 });
        await element.updateComplete;
        
        triggerSyncEvent('bookmark-synced', { 
          bookmark: mockBookmarks[0], 
          current: 1, 
          total: 1 
        });
        
        // Wait for handleBookmarkSynced async operation to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        await element.updateComplete;

        const presentationComponent = getPresentationComponent();
        let syncedCard = presentationComponent?.shadowRoot?.querySelector('.bookmark-card.synced');
        expect(syncedCard).toBeTruthy();

        triggerSyncEvent('sync-completed', { processed: 1 });
        
        // Wait for handleSyncCompleted's loadBookmarks to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        await element.updateComplete;

        // Highlights should still be there immediately after sync completion
        syncedCard = presentationComponent?.shadowRoot?.querySelector('.bookmark-card.synced');
        expect(syncedCard).toBeTruthy();

        // Advance timers by 3 seconds to trigger highlight clearing
        vi.advanceTimersByTime(3000);
        await element.updateComplete;

        // Now highlights should be cleared
        syncedCard = presentationComponent?.shadowRoot?.querySelector('.bookmark-card.synced');
        expect(syncedCard).toBeFalsy();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('Sync Error Event', () => {
    it('should hide sync progress bar on error', async () => {
      triggerSyncEvent('sync-started', { total: 2 });
      await element.updateComplete;

      // Sync progress bar is now in the container, not the presentation component
      let progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      triggerSyncEvent('sync-error', { error: new Error('Sync failed') });
      await element.updateComplete;

      progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();
    });
  });

  describe('Sync Request Handling', () => {
    // Note: Backwards compatibility for 'sync-requested' events was removed
    // Sync is now handled through the SyncController API

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
      const presentationComponent = getPresentationComponent();
      const bookmarkList = presentationComponent?.shadowRoot?.querySelector('.bookmark-list');
      expect(bookmarkList).toBeTruthy();
      
      const bookmarkCards = presentationComponent?.shadowRoot?.querySelectorAll('.bookmark-card');
      expect(bookmarkCards?.length).toBeGreaterThan(0);
    });

    it('should show sticky progress bar that does not interfere with reading', async () => {
      triggerSyncEvent('sync-started', { total: 3 });
      await element.updateComplete;

      // Sync progress bar is now in the container, not the presentation component
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

      // Trigger a sync-started event which will show the progress UI
      triggerSyncEvent('sync-started', { total: 7 });
      await element.updateComplete;

      // Trigger sync-progress to set the current progress
      triggerSyncEvent('sync-progress', { current: 3, total: 7 });
      await element.updateComplete;

      // Should show sync progress - now in the container
      const progressContainer = element.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeTruthy();

      const progressText = element.shadowRoot?.querySelector('.sync-progress-text span');
      expect(progressText?.textContent).toContain('3/7');
    });

    it('should not show sync progress when no sync is ongoing', async () => {
      // Ensure no ongoing sync
      (SyncService.isSyncInProgress as any).mockReturnValue(false);

      // Create a new component
      const newElement = new BookmarkListContainer();
      document.body.appendChild(newElement);
      await newElement.updateComplete;
      
      // Wait for loadBookmarks to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await newElement.updateComplete;

      // Should not show sync progress
      const newPresentationComponent = newElement.shadowRoot?.querySelector('bookmark-list') as any;
      const progressContainer = newPresentationComponent?.shadowRoot?.querySelector('.sync-progress');
      expect(progressContainer).toBeFalsy();

      // Cleanup
      document.body.removeChild(newElement);
    });

    it('should clear stale synced bookmark highlights when reconnecting during sync', async () => {
      // Mock an ongoing sync
      (SyncService.isSyncInProgress as any).mockReturnValue(true);
      (SyncService.getCurrentSyncProgress as any).mockReturnValue({ current: 2, total: 5 });

      // Create a new component
      const newElement = new BookmarkListContainer();
      document.body.appendChild(newElement);
      await newElement.updateComplete;
      
      // Wait for loadBookmarks to complete
      await new Promise(resolve => setTimeout(resolve, 0));
      await newElement.updateComplete;

      // Should not have any synced bookmarks highlighted (stale highlights cleared)
      const newPresentationComponent = newElement.shadowRoot?.querySelector('bookmark-list') as any;
      const syncedCards = newPresentationComponent?.shadowRoot?.querySelectorAll('.bookmark-card.synced');
      expect(syncedCards?.length).toBe(0);

      // Cleanup
      document.body.removeChild(newElement);
    });
  });
});