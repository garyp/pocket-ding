import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BookmarkListStateService } from '../../services/bookmark-list-state';
import type { BookmarkListState } from '../../types';

describe('BookmarkListStateService', () => {
  beforeEach(() => {
    // Clear localStorage before each test
    localStorage.clear();
    BookmarkListStateService.reset();
  });

  afterEach(() => {
    localStorage.clear();
    BookmarkListStateService.reset();
  });

  describe('init', () => {
    it('should initialize with default state when no saved state exists', () => {
      BookmarkListStateService.init();
      const state = BookmarkListStateService.getState();

      expect(state).toEqual({
        selectedFilter: 'all',
        scrollPosition: 0
      });
    });

    it('should restore saved state from localStorage', () => {
      const savedState: BookmarkListState = {
        selectedFilter: 'unread',
        scrollPosition: 150
      };
      
      localStorage.setItem('bookmark-list-state', JSON.stringify(savedState));
      BookmarkListStateService.init();
      
      const state = BookmarkListStateService.getState();
      expect(state).toEqual(savedState);
    });

    it('should fall back to default state when localStorage contains invalid data', () => {
      localStorage.setItem('bookmark-list-state', 'invalid-json');
      BookmarkListStateService.init();
      
      const state = BookmarkListStateService.getState();
      expect(state).toEqual({
        selectedFilter: 'all',
        scrollPosition: 0
      });
    });

    it('should validate saved state and reject invalid data', () => {
      const invalidState = {
        selectedFilter: 'invalid-filter',
        scrollPosition: -50
      };
      
      localStorage.setItem('bookmark-list-state', JSON.stringify(invalidState));
      BookmarkListStateService.init();
      
      const state = BookmarkListStateService.getState();
      expect(state).toEqual({
        selectedFilter: 'all',
        scrollPosition: 0
      });
    });
  });

  describe('saveState', () => {
    beforeEach(() => {
      BookmarkListStateService.init();
    });

    it('should save valid state to localStorage', () => {
      const newState: BookmarkListState = {
        selectedFilter: 'archived',
        scrollPosition: 300
      };
      
      BookmarkListStateService.saveState(newState);
      
      const savedData = localStorage.getItem('bookmark-list-state');
      expect(savedData).toBeTruthy();
      expect(JSON.parse(savedData!)).toEqual(newState);
    });

    it('should update current state when saving', () => {
      const newState: BookmarkListState = {
        selectedFilter: 'unread',
        scrollPosition: 200
      };
      
      BookmarkListStateService.saveState(newState);
      const currentState = BookmarkListStateService.getState();
      
      expect(currentState).toEqual(newState);
    });

    it('should reject invalid state data', () => {
      const invalidState = {
        selectedFilter: 'invalid' as any,
        scrollPosition: -100
      };
      
      BookmarkListStateService.saveState(invalidState);
      
      // State should remain unchanged
      const state = BookmarkListStateService.getState();
      expect(state).toEqual({
        selectedFilter: 'all',
        scrollPosition: 0
      });
    });
  });

  describe('updateFilter', () => {
    beforeEach(() => {
      BookmarkListStateService.init();
    });

    it('should update filter and persist state', () => {
      BookmarkListStateService.updateFilter('unread');
      
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('unread');
      
      // Verify persistence
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.selectedFilter).toBe('unread');
    });

    it('should preserve scroll position when updating filter', () => {
      BookmarkListStateService.saveState({
        selectedFilter: 'all',
        scrollPosition: 250
      });
      
      BookmarkListStateService.updateFilter('archived');
      
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('archived');
      expect(state.scrollPosition).toBe(250);
    });
  });

  describe('updateScrollPosition', () => {
    beforeEach(() => {
      BookmarkListStateService.init();
    });

    it('should update scroll position and persist state', () => {
      BookmarkListStateService.updateScrollPosition(400);
      
      const state = BookmarkListStateService.getState();
      expect(state.scrollPosition).toBe(400);
      
      // Verify persistence
      const savedData = localStorage.getItem('bookmark-list-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.scrollPosition).toBe(400);
    });

    it('should preserve filter when updating scroll position', () => {
      BookmarkListStateService.saveState({
        selectedFilter: 'unread',
        scrollPosition: 0
      });
      
      BookmarkListStateService.updateScrollPosition(150);
      
      const state = BookmarkListStateService.getState();
      expect(state.selectedFilter).toBe('unread');
      expect(state.scrollPosition).toBe(150);
    });

    it('should enforce minimum scroll position of 0', () => {
      BookmarkListStateService.updateScrollPosition(-50);
      
      const state = BookmarkListStateService.getState();
      expect(state.scrollPosition).toBe(0);
    });
  });

  describe('clearState', () => {
    beforeEach(() => {
      BookmarkListStateService.init();
    });

    it('should reset to default state', () => {
      BookmarkListStateService.saveState({
        selectedFilter: 'archived',
        scrollPosition: 500
      });
      
      BookmarkListStateService.clearState();
      
      const state = BookmarkListStateService.getState();
      expect(state).toEqual({
        selectedFilter: 'all',
        scrollPosition: 0
      });
    });

    it('should remove data from localStorage', () => {
      BookmarkListStateService.saveState({
        selectedFilter: 'unread',
        scrollPosition: 100
      });
      
      BookmarkListStateService.clearState();
      
      const savedData = localStorage.getItem('bookmark-list-state');
      expect(savedData).toBeNull();
    });
  });

  describe('getState', () => {
    beforeEach(() => {
      BookmarkListStateService.init();
    });

    it('should return a copy of the current state', () => {
      const originalState = BookmarkListStateService.getState();
      originalState.selectedFilter = 'archived'; // Mutate returned object
      
      const currentState = BookmarkListStateService.getState();
      expect(currentState.selectedFilter).toBe('all'); // Should not be mutated
    });
  });
});