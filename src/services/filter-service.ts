import type { FilterState, LocalBookmark } from '../types';
import { db } from './database';

interface FilterStateRecord extends FilterState {
  id?: number;
}

export class FilterService {
  /**
   * Apply all active filters to a list of bookmarks
   */
  static applyFilters(bookmarks: LocalBookmark[], filters: FilterState): LocalBookmark[] {
    let filtered = bookmarks;

    // Apply tag filter (OR logic - bookmark must have ANY of the selected tags)
    if (filters.tags.length > 0) {
      filtered = filtered.filter(bookmark =>
        bookmark.tag_names.some(tag => filters.tags.includes(tag))
      );
    }

    // Apply read status filter
    if (filters.readStatus !== 'all') {
      filtered = filtered.filter(bookmark => {
        if (filters.readStatus === 'read') {
          return !bookmark.unread;
        } else {
          return bookmark.unread;
        }
      });
    }

    // Apply archived status filter
    if (filters.archivedStatus !== 'all') {
      filtered = filtered.filter(bookmark => {
        if (filters.archivedStatus === 'archived') {
          return bookmark.is_archived;
        } else {
          return !bookmark.is_archived;
        }
      });
    }

    // Apply date filter
    if (filters.dateFilter.type !== 'all') {
      const now = new Date();
      let fromDate: Date | null = null;
      let toDate: Date | null = null;

      if (filters.dateFilter.type === 'preset') {
        switch (filters.dateFilter.preset) {
          case 'today':
            fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            break;
          case 'last7days':
            fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case 'last30days':
            fromDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case 'thisyear':
            fromDate = new Date(now.getFullYear(), 0, 1);
            break;
        }
      } else if (filters.dateFilter.type === 'custom') {
        if (filters.dateFilter.customFrom) {
          fromDate = new Date(filters.dateFilter.customFrom);
        }
        if (filters.dateFilter.customTo) {
          toDate = new Date(filters.dateFilter.customTo);
          // Set to end of day for the "to" date
          toDate.setHours(23, 59, 59, 999);
        }
      }

      filtered = filtered.filter(bookmark => {
        const bookmarkDate = new Date(bookmark.date_added);

        if (fromDate && bookmarkDate < fromDate) {
          return false;
        }
        if (toDate && bookmarkDate > toDate) {
          return false;
        }

        return true;
      });
    }

    return filtered;
  }

  /**
   * Apply has assets filter separately (requires async database query)
   * Returns filtered bookmark IDs
   */
  static async applyHasAssetsFilter(
    bookmarkIds: number[],
    hasAssetsStatus: FilterState['hasAssetsStatus']
  ): Promise<Set<number>> {
    if (hasAssetsStatus === 'all') {
      return new Set(bookmarkIds);
    }

    const bookmarksWithAssets = new Set<number>();

    // Check each bookmark for assets
    for (const bookmarkId of bookmarkIds) {
      const assets = await db.assets
        .where('bookmark_id').equals(bookmarkId)
        .and(asset => asset.status === 'complete')
        .count();

      const hasAssets = assets > 0;

      if (hasAssetsStatus === 'has-assets' && hasAssets) {
        bookmarksWithAssets.add(bookmarkId);
      } else if (hasAssetsStatus === 'no-assets' && !hasAssets) {
        bookmarksWithAssets.add(bookmarkId);
      }
    }

    return bookmarksWithAssets;
  }

  /**
   * Save filter state to database
   */
  static async saveFilterState(filters: FilterState): Promise<void> {
    await db.transaction('rw', db.table('filterState'), async () => {
      await db.table('filterState').clear();
      await db.table('filterState').add(filters);
    });
  }

  /**
   * Load filter state from database
   */
  static async loadFilterState(): Promise<FilterState | null> {
    const state = await db.table('filterState').toCollection().first() as FilterStateRecord | undefined;
    return state || null;
  }

  /**
   * Clear saved filter state
   */
  static async clearFilterState(): Promise<void> {
    await db.table('filterState').clear();
  }

  /**
   * Get default (empty) filter state
   */
  static getDefaultFilterState(): FilterState {
    return {
      tags: [],
      readStatus: 'all',
      archivedStatus: 'all',
      hasAssetsStatus: 'all',
      dateFilter: {
        type: 'all'
      }
    };
  }

  /**
   * Check if any filters are active
   */
  static hasActiveFilters(filters: FilterState): boolean {
    return (
      filters.tags.length > 0 ||
      filters.readStatus !== 'all' ||
      filters.archivedStatus !== 'all' ||
      filters.hasAssetsStatus !== 'all' ||
      filters.dateFilter.type !== 'all'
    );
  }

  /**
   * Get all unique tags from bookmarks
   */
  static async getAllTags(): Promise<string[]> {
    const bookmarks = await db.bookmarks.toArray();
    const tagSet = new Set<string>();

    bookmarks.forEach(bookmark => {
      bookmark.tag_names.forEach(tag => tagSet.add(tag));
    });

    return Array.from(tagSet).sort();
  }
}
