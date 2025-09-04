import { vi } from 'vitest';

/**
 * Creates a complete mock of DatabaseService with only raw Promise-based methods.
 * The ReactiveQueryController now handles wrapping these with liveQuery internally.
 */
export function createDatabaseServiceMock() {
  return {
    DatabaseService: {
      // All methods now return Promises (not Observables)
      getBookmarksPaginated: vi.fn(),
      getBookmarkCount: vi.fn(),
      getAllFilterCounts: vi.fn(),
      getBookmark: vi.fn(),
      getReadProgress: vi.fn(),
      getAssetsByBookmarkId: vi.fn(),
      getCompletedAssetsByBookmarkId: vi.fn(),
      getBookmarksWithAssetCounts: vi.fn(),
      getSettings: vi.fn(),
      getLastSyncTimestamp: vi.fn(),
      getPageFromAnchorBookmark: vi.fn(),
      
      // Write methods
      saveBookmark: vi.fn(),
      deleteBookmark: vi.fn(),
      updateBookmarkReadStatus: vi.fn(),
      saveReadProgress: vi.fn(),
      saveAsset: vi.fn(),
      setLastSyncTimestamp: vi.fn(),
    },
  };
}

/**
 * Sets up default mock implementations for database methods with sensible defaults.
 * All methods now return Promises instead of Observables.
 */
export function setupDefaultDatabaseMocks(mockBookmarks: any[] = [], settings: any = undefined) {
  const { DatabaseService } = createDatabaseServiceMock();
  
  // Configure all methods to return Promise values
  vi.mocked(DatabaseService.getBookmarksPaginated).mockResolvedValue(mockBookmarks);
  vi.mocked(DatabaseService.getBookmarkCount).mockResolvedValue(mockBookmarks.length);
  vi.mocked(DatabaseService.getAllFilterCounts).mockResolvedValue({ 
    all: mockBookmarks.length, 
    unread: mockBookmarks.filter((b: any) => b.unread).length, 
    archived: mockBookmarks.filter((b: any) => b.is_archived).length 
  });
  vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
  vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
  vi.mocked(DatabaseService.getAssetsByBookmarkId).mockResolvedValue([]);
  vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);
  vi.mocked(DatabaseService.getBookmarksWithAssetCounts).mockResolvedValue(new Map());
  vi.mocked(DatabaseService.getSettings).mockResolvedValue(settings);
  vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);
  vi.mocked(DatabaseService.getPageFromAnchorBookmark).mockResolvedValue(1);
  
  return { DatabaseService };
}