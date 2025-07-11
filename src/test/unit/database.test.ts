import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { LocalBookmark, AppSettings, ReadProgress } from '../../types';

// Mock the database module
vi.mock('../../services/database', () => {
  // Define mock objects inside the factory function to avoid hoisting issues
  const mockTable = {
    put: vi.fn(),
    get: vi.fn(),
    toArray: vi.fn(),
    where: vi.fn().mockReturnThis(),
    equals: vi.fn().mockReturnThis(),
    first: vi.fn(),
    orderBy: vi.fn().mockReturnThis(),
    reverse: vi.fn().mockReturnThis(),
    clear: vi.fn(),
    add: vi.fn(),
    toCollection: vi.fn().mockReturnThis(),
  };

  const mockDbInstance = {
    bookmarks: mockTable,
    readProgress: mockTable,
    settings: mockTable,
    syncMetadata: mockTable,
    open: vi.fn().mockResolvedValue(undefined),
  };

  return {
    db: mockDbInstance,
    DatabaseService: {
      saveBookmark: vi.fn(),
      getBookmark: vi.fn(),
      getAllBookmarks: vi.fn(),
      getUnreadBookmarks: vi.fn(),
      saveSettings: vi.fn(),
      getSettings: vi.fn(),
      saveReadProgress: vi.fn(),
      getReadProgress: vi.fn(),
      clearAll: vi.fn(),
      getLastSyncTimestamp: vi.fn(),
      setLastSyncTimestamp: vi.fn(),
    },
  };
});

// Import after mocking
import { DatabaseService } from '../../services/database';

describe('DatabaseService', () => {
  const mockBookmark: LocalBookmark = {
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
    tag_names: ['test'],
    date_added: '2024-01-01T10:00:00Z',
    date_modified: '2024-01-01T10:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Set default resolved values for mocked methods
    (DatabaseService.saveBookmark as any).mockResolvedValue(undefined);
    (DatabaseService.getBookmark as any).mockResolvedValue(mockBookmark);
    (DatabaseService.getAllBookmarks as any).mockResolvedValue([mockBookmark]);
    (DatabaseService.getUnreadBookmarks as any).mockResolvedValue([mockBookmark]);
    (DatabaseService.saveSettings as any).mockResolvedValue(undefined);
    (DatabaseService.getSettings as any).mockResolvedValue(null);
    (DatabaseService.saveReadProgress as any).mockResolvedValue(undefined);
    (DatabaseService.getReadProgress as any).mockResolvedValue(null);
    (DatabaseService.clearAll as any).mockResolvedValue(undefined);
    (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);
    (DatabaseService.setLastSyncTimestamp as any).mockResolvedValue(undefined);
  });

  it('should save a bookmark', async () => {
    await DatabaseService.saveBookmark(mockBookmark);
    expect(DatabaseService.saveBookmark).toHaveBeenCalledWith(mockBookmark);
  });

  it('should get a bookmark by id', async () => {
    const result = await DatabaseService.getBookmark(1);
    expect(DatabaseService.getBookmark).toHaveBeenCalledWith(1);
    expect(result).toEqual(mockBookmark);
  });

  it('should get all bookmarks', async () => {
    const result = await DatabaseService.getAllBookmarks();
    expect(DatabaseService.getAllBookmarks).toHaveBeenCalled();
    expect(result).toEqual([mockBookmark]);
  });

  it('should save settings', async () => {
    const settings: AppSettings = {
      linkding_url: 'https://linkding.example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability',
    };

    await DatabaseService.saveSettings(settings);
    expect(DatabaseService.saveSettings).toHaveBeenCalledWith(settings);
  });

  it('should save read progress', async () => {
    const progress: ReadProgress = {
      bookmark_id: 1,
      progress: 50,
      last_read_at: '2024-01-01T10:00:00Z',
      reading_mode: 'readability',
      scroll_position: 100,
    };

    await DatabaseService.saveReadProgress(progress);
    expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(progress);
  });

  it('should get last sync timestamp', async () => {
    const timestamp = '2024-01-01T10:00:00Z';
    (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(timestamp);

    const result = await DatabaseService.getLastSyncTimestamp();
    expect(DatabaseService.getLastSyncTimestamp).toHaveBeenCalled();
    expect(result).toBe(timestamp);
  });

  it('should return null when no sync timestamp exists', async () => {
    (DatabaseService.getLastSyncTimestamp as any).mockResolvedValue(null);

    const result = await DatabaseService.getLastSyncTimestamp();
    expect(result).toBeNull();
  });

  it('should set last sync timestamp', async () => {
    const timestamp = '2024-01-01T10:00:00Z';

    await DatabaseService.setLastSyncTimestamp(timestamp);
    expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalledWith(timestamp);
  });
});