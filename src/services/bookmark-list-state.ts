import type { BookmarkFilter, BookmarkListState } from '../types';

export class BookmarkListStateService {
  private static readonly STORAGE_KEY = 'bookmark-list-state';
  private static currentState: BookmarkListState = {
    selectedFilter: 'all',
    scrollPosition: 0
  };

  static init() {
    try {
      const savedState = localStorage.getItem(this.STORAGE_KEY);
      if (savedState) {
        const parsedState = JSON.parse(savedState) as BookmarkListState;
        
        // Validate the saved state
        if (this.isValidState(parsedState)) {
          this.currentState = parsedState;
        }
      }
    } catch (error) {
      console.warn('Failed to load bookmark list state:', error);
      // Fall back to default state
      this.currentState = {
        selectedFilter: 'all',
        scrollPosition: 0
      };
    }
  }

  static saveState(state: BookmarkListState) {
    if (!this.isValidState(state)) {
      console.warn('Invalid bookmark list state:', state);
      return;
    }

    this.currentState = { ...state };
    
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.currentState));
    } catch (error) {
      console.warn('Failed to save bookmark list state:', error);
    }
  }

  static getState(): BookmarkListState {
    return { ...this.currentState };
  }

  static updateFilter(filter: BookmarkFilter) {
    this.saveState({
      ...this.currentState,
      selectedFilter: filter
    });
  }

  static updateScrollPosition(scrollPosition: number) {
    this.saveState({
      ...this.currentState,
      scrollPosition: Math.max(0, scrollPosition)
    });
  }

  static clearState() {
    this.currentState = {
      selectedFilter: 'all',
      scrollPosition: 0
    };
    
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.warn('Failed to clear bookmark list state:', error);
    }
  }

  // For testing purposes - reset the service state
  static reset() {
    this.currentState = {
      selectedFilter: 'all',
      scrollPosition: 0
    };
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      // Ignore errors during reset
    }
  }

  private static isValidState(state: any): state is BookmarkListState {
    return (
      state &&
      typeof state === 'object' &&
      ['all', 'unread', 'archived'].includes(state.selectedFilter) &&
      typeof state.scrollPosition === 'number' &&
      state.scrollPosition >= 0
    );
  }
}