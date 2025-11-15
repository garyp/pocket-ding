import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilterService } from '../../services/filter-service';
import { db } from '../../services/database';
import type { FilterState, LocalBookmark } from '../../types';

// Mock the database
vi.mock('../../services/database', () => ({
  db: {
    assets: {
      where: vi.fn(() => ({
        equals: vi.fn(() => ({
          and: vi.fn(() => ({
            count: vi.fn().mockResolvedValue(0)
          }))
        }))
      }))
    },
    table: vi.fn(() => ({
      clear: vi.fn().mockResolvedValue(undefined),
      add: vi.fn().mockResolvedValue(1),
      toCollection: vi.fn(() => ({
        first: vi.fn().mockResolvedValue(null)
      }))
    })),
    transaction: vi.fn((_mode: string, _table: any, callback: () => Promise<void>) => callback()),
    bookmarks: {
      toArray: vi.fn().mockResolvedValue([])
    }
  },
  DatabaseService: {}
}));

describe('FilterService', () => {
  const createMockBookmark = (overrides: Partial<LocalBookmark> = {}): LocalBookmark => ({
    id: 1,
    url: 'https://example.com',
    title: 'Test Bookmark',
    description: 'Test description',
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
    date_added: '2024-01-15T10:00:00Z',
    date_modified: '2024-01-15T10:00:00Z',
    ...overrides
  });

  const defaultFilters: FilterState = {
    tags: [],
    readStatus: 'all',
    archivedStatus: 'all',
    hasAssetsStatus: 'all',
    dateFilter: {
      type: 'all'
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('applyFilters', () => {
    describe('tag filtering', () => {
      it('should return all bookmarks when no tags are selected', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'] }),
          createMockBookmark({ id: 2, tag_names: ['news'] })
        ];

        const result = FilterService.applyFilters(bookmarks, defaultFilters);

        expect(result).toHaveLength(2);
      });

      it('should filter bookmarks by single tag', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'] }),
          createMockBookmark({ id: 2, tag_names: ['news'] }),
          createMockBookmark({ id: 3, tag_names: ['tech', 'programming'] })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          tags: ['tech']
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([1, 3]);
      });

      it('should filter bookmarks by multiple tags with OR logic', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'] }),
          createMockBookmark({ id: 2, tag_names: ['news'] }),
          createMockBookmark({ id: 3, tag_names: ['programming'] }),
          createMockBookmark({ id: 4, tag_names: ['other'] })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          tags: ['tech', 'news']
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([1, 2]);
      });

      it('should return empty array when no bookmarks match selected tags', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'] }),
          createMockBookmark({ id: 2, tag_names: ['news'] })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          tags: ['nonexistent']
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(0);
      });
    });

    describe('read status filtering', () => {
      it('should return all bookmarks when readStatus is "all"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, unread: true }),
          createMockBookmark({ id: 2, unread: false })
        ];

        const result = FilterService.applyFilters(bookmarks, defaultFilters);

        expect(result).toHaveLength(2);
      });

      it('should filter unread bookmarks when readStatus is "unread"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, unread: true }),
          createMockBookmark({ id: 2, unread: false }),
          createMockBookmark({ id: 3, unread: true })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          readStatus: 'unread'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([1, 3]);
      });

      it('should filter read bookmarks when readStatus is "read"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, unread: true }),
          createMockBookmark({ id: 2, unread: false }),
          createMockBookmark({ id: 3, unread: false })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          readStatus: 'read'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([2, 3]);
      });
    });

    describe('archived status filtering', () => {
      it('should return all bookmarks when archivedStatus is "all"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, is_archived: true }),
          createMockBookmark({ id: 2, is_archived: false })
        ];

        const result = FilterService.applyFilters(bookmarks, defaultFilters);

        expect(result).toHaveLength(2);
      });

      it('should filter archived bookmarks when archivedStatus is "archived"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, is_archived: true }),
          createMockBookmark({ id: 2, is_archived: false }),
          createMockBookmark({ id: 3, is_archived: true })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          archivedStatus: 'archived'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([1, 3]);
      });

      it('should filter unarchived bookmarks when archivedStatus is "unarchived"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, is_archived: true }),
          createMockBookmark({ id: 2, is_archived: false }),
          createMockBookmark({ id: 3, is_archived: false })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          archivedStatus: 'unarchived'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([2, 3]);
      });
    });

    describe('date filtering', () => {
      it('should return all bookmarks when dateFilter type is "all"', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, date_added: '2024-01-01T00:00:00Z' }),
          createMockBookmark({ id: 2, date_added: '2024-12-31T23:59:59Z' })
        ];

        const result = FilterService.applyFilters(bookmarks, defaultFilters);

        expect(result).toHaveLength(2);
      });

      it('should filter bookmarks added today', () => {
        const today = new Date();
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

        const bookmarks = [
          createMockBookmark({ id: 1, date_added: today.toISOString() }),
          createMockBookmark({ id: 2, date_added: yesterday.toISOString() })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'preset',
            preset: 'today'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(1);
      });

      it('should filter bookmarks from last 7 days', () => {
        const today = new Date();
        const fiveDaysAgo = new Date(today.getTime() - 5 * 24 * 60 * 60 * 1000);
        const tenDaysAgo = new Date(today.getTime() - 10 * 24 * 60 * 60 * 1000);

        const bookmarks = [
          createMockBookmark({ id: 1, date_added: fiveDaysAgo.toISOString() }),
          createMockBookmark({ id: 2, date_added: tenDaysAgo.toISOString() })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'preset',
            preset: 'last7days'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(1);
      });

      it('should filter bookmarks from last 30 days', () => {
        const today = new Date();
        const twentyDaysAgo = new Date(today.getTime() - 20 * 24 * 60 * 60 * 1000);
        const fourtyDaysAgo = new Date(today.getTime() - 40 * 24 * 60 * 60 * 1000);

        const bookmarks = [
          createMockBookmark({ id: 1, date_added: twentyDaysAgo.toISOString() }),
          createMockBookmark({ id: 2, date_added: fourtyDaysAgo.toISOString() })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'preset',
            preset: 'last30days'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(1);
      });

      it('should filter bookmarks from this year', () => {
        const thisYear = new Date().getFullYear();
        const thisYearDate = new Date(thisYear, 5, 15).toISOString();
        const lastYearDate = new Date(thisYear - 1, 5, 15).toISOString();

        const bookmarks = [
          createMockBookmark({ id: 1, date_added: thisYearDate }),
          createMockBookmark({ id: 2, date_added: lastYearDate })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'preset',
            preset: 'thisyear'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(1);
      });

      it('should filter bookmarks with custom date range', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, date_added: '2024-01-15T00:00:00Z' }),
          createMockBookmark({ id: 2, date_added: '2024-02-15T00:00:00Z' }),
          createMockBookmark({ id: 3, date_added: '2024-03-15T00:00:00Z' })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'custom',
            customFrom: '2024-02-01',
            customTo: '2024-02-28'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(2);
      });

      it('should handle custom date range with only from date', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, date_added: '2024-01-15T00:00:00Z' }),
          createMockBookmark({ id: 2, date_added: '2024-02-15T00:00:00Z' }),
          createMockBookmark({ id: 3, date_added: '2024-03-15T00:00:00Z' })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'custom',
            customFrom: '2024-02-01'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([2, 3]);
      });

      it('should handle custom date range with only to date', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, date_added: '2024-01-15T00:00:00Z' }),
          createMockBookmark({ id: 2, date_added: '2024-02-15T00:00:00Z' }),
          createMockBookmark({ id: 3, date_added: '2024-03-15T00:00:00Z' })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          dateFilter: {
            type: 'custom',
            customTo: '2024-02-28'
          }
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(2);
        expect(result.map(b => b.id)).toEqual([1, 2]);
      });
    });

    describe('multiple filters combined', () => {
      it('should apply multiple filters with AND logic', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'], unread: true, is_archived: false }),
          createMockBookmark({ id: 2, tag_names: ['tech'], unread: false, is_archived: false }),
          createMockBookmark({ id: 3, tag_names: ['news'], unread: true, is_archived: false }),
          createMockBookmark({ id: 4, tag_names: ['tech'], unread: true, is_archived: true })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          tags: ['tech'],
          readStatus: 'unread',
          archivedStatus: 'unarchived'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(1);
        expect(result[0]!.id).toBe(1);
      });

      it('should return empty array when no bookmarks match all filters', () => {
        const bookmarks = [
          createMockBookmark({ id: 1, tag_names: ['tech'], unread: false }),
          createMockBookmark({ id: 2, tag_names: ['news'], unread: true })
        ];

        const filters: FilterState = {
          ...defaultFilters,
          tags: ['tech'],
          readStatus: 'unread'
        };

        const result = FilterService.applyFilters(bookmarks, filters);

        expect(result).toHaveLength(0);
      });
    });
  });

  describe('applyHasAssetsFilter', () => {
    it('should return all bookmark IDs when hasAssetsStatus is "all"', async () => {
      const bookmarkIds = [1, 2, 3];
      const result = await FilterService.applyHasAssetsFilter(bookmarkIds, 'all');

      expect(result.size).toBe(3);
      expect(Array.from(result)).toEqual([1, 2, 3]);
    });

    it('should filter bookmarks with assets', async () => {
      const bookmarkIds = [1, 2, 3];

      // Mock database to return assets for bookmarks 1 and 3
      const mockDb = db as any;
      mockDb.assets.where = vi.fn(() => ({
        equals: vi.fn((value: number) => ({
          and: vi.fn(() => ({
            count: vi.fn().mockResolvedValue(value === 1 || value === 3 ? 1 : 0)
          }))
        }))
      }));

      const result = await FilterService.applyHasAssetsFilter(bookmarkIds, 'has-assets');

      expect(result.size).toBe(2);
      expect(Array.from(result)).toEqual([1, 3]);
    });

    it('should filter bookmarks without assets', async () => {
      const bookmarkIds = [1, 2, 3];

      // Mock database to return no assets for bookmark 2
      const mockDb = db as any;
      mockDb.assets.where = vi.fn(() => ({
        equals: vi.fn((value: number) => ({
          and: vi.fn(() => ({
            count: vi.fn().mockResolvedValue(value === 2 ? 0 : 1)
          }))
        }))
      }));

      const result = await FilterService.applyHasAssetsFilter(bookmarkIds, 'no-assets');

      expect(result.size).toBe(1);
      expect(Array.from(result)).toEqual([2]);
    });
  });

  describe('getDefaultFilterState', () => {
    it('should return default filter state with all filters disabled', () => {
      const defaultState = FilterService.getDefaultFilterState();

      expect(defaultState.tags).toEqual([]);
      expect(defaultState.readStatus).toBe('all');
      expect(defaultState.archivedStatus).toBe('all');
      expect(defaultState.hasAssetsStatus).toBe('all');
      expect(defaultState.dateFilter.type).toBe('all');
    });
  });

  describe('hasActiveFilters', () => {
    it('should return false for default filter state', () => {
      const result = FilterService.hasActiveFilters(defaultFilters);
      expect(result).toBe(false);
    });

    it('should return true when tags are selected', () => {
      const filters: FilterState = {
        ...defaultFilters,
        tags: ['tech']
      };
      const result = FilterService.hasActiveFilters(filters);
      expect(result).toBe(true);
    });

    it('should return true when readStatus is not "all"', () => {
      const filters: FilterState = {
        ...defaultFilters,
        readStatus: 'unread'
      };
      const result = FilterService.hasActiveFilters(filters);
      expect(result).toBe(true);
    });

    it('should return true when archivedStatus is not "all"', () => {
      const filters: FilterState = {
        ...defaultFilters,
        archivedStatus: 'archived'
      };
      const result = FilterService.hasActiveFilters(filters);
      expect(result).toBe(true);
    });

    it('should return true when hasAssetsStatus is not "all"', () => {
      const filters: FilterState = {
        ...defaultFilters,
        hasAssetsStatus: 'has-assets'
      };
      const result = FilterService.hasActiveFilters(filters);
      expect(result).toBe(true);
    });

    it('should return true when dateFilter type is not "all"', () => {
      const filters: FilterState = {
        ...defaultFilters,
        dateFilter: {
          type: 'preset',
          preset: 'today'
        }
      };
      const result = FilterService.hasActiveFilters(filters);
      expect(result).toBe(true);
    });
  });

  describe('getAllTags', () => {
    it('should return unique sorted tags from all bookmarks', async () => {
      const mockDb = db as any;
      mockDb.bookmarks.toArray = vi.fn().mockResolvedValue([
        createMockBookmark({ tag_names: ['tech', 'programming'] }),
        createMockBookmark({ tag_names: ['news', 'tech'] }),
        createMockBookmark({ tag_names: ['programming'] })
      ]);

      const result = await FilterService.getAllTags();

      expect(result).toEqual(['news', 'programming', 'tech']);
    });

    it('should return empty array when no bookmarks exist', async () => {
      const mockDb = db as any;
      mockDb.bookmarks.toArray = vi.fn().mockResolvedValue([]);

      const result = await FilterService.getAllTags();

      expect(result).toEqual([]);
    });
  });
});
