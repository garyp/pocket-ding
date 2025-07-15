import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import '../setup';
import { BookmarkListStateService } from '../../services/bookmark-list-state';
import { DatabaseService } from '../../services/database';
import type { LocalBookmark, AppSettings } from '../../types';

describe('Bookmark List State Integration', () => {
  let mockBookmarks: LocalBookmark[];
  let mockSettings: AppSettings;

  beforeEach(async () => {
    localStorage.clear();
    BookmarkListStateService.reset();
    
    mockSettings = {
      linkding_url: 'https://example.com',
      linkding_token: 'test-token',
      sync_interval: 30,
      auto_sync: false,
      reading_mode: 'readability'
    };

    mockBookmarks = [
      {
        id: 1,
        url: 'https://example.com/1',
        title: 'Test Bookmark 1',
        description: 'Description 1',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: true,
        shared: false,
        tag_names: ['test'],
        date_added: '2024-01-01T00:00:00Z',
        date_modified: '2024-01-01T00:00:00Z'
      },
      {
        id: 2,
        url: 'https://example.com/2',
        title: 'Test Bookmark 2',
        description: 'Description 2',
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: false,
        shared: false,
        tag_names: ['read'],
        date_added: '2024-01-02T00:00:00Z',
        date_modified: '2024-01-02T00:00:00Z'
      }
    ];

    // Mock database service
    vi.spyOn(DatabaseService, 'getSettings').mockResolvedValue(mockSettings);
    vi.spyOn(DatabaseService, 'getAllBookmarks').mockResolvedValue(mockBookmarks);
    vi.spyOn(DatabaseService, 'getCompletedAssetsByBookmarkId').mockResolvedValue([]);
  });

  afterEach(() => {
    localStorage.clear();
    BookmarkListStateService.reset();
    vi.restoreAllMocks();
  });

  describe('Service Integration', () => {
    it('should persist state across service interactions', () => {
      // Initialize service
      BookmarkListStateService.init();
      
      // Update filter
      BookmarkListStateService.updateFilter('unread');
      
      // Update scroll position
      BookmarkListStateService.updateScrollPosition(150);
      
      // Verify state was saved
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('unread');
      expect(state.scrollPosition).toBe(150);
      
      // Verify localStorage persistence
      const savedData = localStorage.getItem('bookmark-list-state');
      expect(savedData).toBeTruthy();
      
      const parsedState = JSON.parse(savedData!);
      expect(parsedState.selectedFilter).toBe('unread');
      expect(parsedState.scrollPosition).toBe(150);
    });

    it('should restore state after service reinitialization', () => {
      // Set initial state
      BookmarkListStateService.init();
      BookmarkListStateService.updateFilter('archived');
      BookmarkListStateService.updateScrollPosition(300);
      
      // Reset service to simulate page reload
      BookmarkListStateService.reset();
      
      // Reinitialize service
      BookmarkListStateService.init();
      
      // Verify state was restored
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('archived');
      expect(state.scrollPosition).toBe(300);
    });
  });

  describe('Error Handling', () => {
    it('should handle localStorage errors gracefully', () => {
      // Mock localStorage to throw an error
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn().mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      BookmarkListStateService.init();
      
      // Try to update state - should not crash
      expect(() => {
        BookmarkListStateService.updateFilter('unread');
      }).not.toThrow();
      
      expect(() => {
        BookmarkListStateService.updateScrollPosition(100);
      }).not.toThrow();

      // Restore original localStorage
      localStorage.setItem = originalSetItem;
    });

    it('should handle invalid localStorage data gracefully', () => {
      // Set invalid data in localStorage
      localStorage.setItem('bookmark-list-state', 'invalid-json');
      
      // Should not crash on init
      expect(() => {
        BookmarkListStateService.init();
      }).not.toThrow();
      
      // Should fall back to default state
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('all');
      expect(state.scrollPosition).toBe(0);
    });
  });
});