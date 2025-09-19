import { vi } from 'vitest';
import type { AppSettings, LocalBookmark } from '../../types';

/**
 * Test database service that provides predictable data for workflow tests.
 * This wraps the real database service but ensures data is available immediately
 * to prevent loading state issues in component tests.
 */
export class TestDatabaseService {
  private static defaultSettings: AppSettings = {
    linkding_url: '',
    linkding_token: '',
    auto_sync: false,
    reading_mode: 'original' as const
  };

  private static mockBookmarks: LocalBookmark[] = [];
  private static currentSettings: AppSettings = { ...this.defaultSettings };

  /**
   * Initialize the test database with default data
   */
  static async initialize(): Promise<void> {
    // Reset to clean state
    this.currentSettings = { ...this.defaultSettings };
    this.mockBookmarks = [];

    // Import the real database service
    const { DatabaseService } = await import('../../services/database');

    // Clear any existing data
    try {
      await DatabaseService.clearAll();
    } catch (error) {
      // Ignore errors if database doesn't exist yet
    }

    // Save default settings to ensure loading completes
    await DatabaseService.saveSettings(this.currentSettings);
  }

  /**
   * Set specific settings for a test
   */
  static async setSettings(settings: Partial<AppSettings>): Promise<void> {
    this.currentSettings = { ...this.defaultSettings, ...settings };
    const { DatabaseService } = await import('../../services/database');
    await DatabaseService.saveSettings(this.currentSettings);
  }

  /**
   * Add mock bookmarks for testing
   */
  static async addBookmarks(bookmarks: Partial<LocalBookmark>[]): Promise<void> {
    const { DatabaseService } = await import('../../services/database');

    for (let i = 0; i < bookmarks.length; i++) {
      const bookmark: LocalBookmark = {
        id: i + 1,
        url: `https://example.com/${i}`,
        title: `Test Bookmark ${i + 1}`,
        description: `Description for bookmark ${i + 1}`,
        notes: '',
        website_title: '',
        website_description: '',
        web_archive_snapshot_url: '',
        favicon_url: '',
        preview_image_url: '',
        is_archived: false,
        unread: false,
        shared: false,
        tag_names: [],
        date_added: new Date().toISOString(),
        date_modified: new Date().toISOString(),
        ...bookmarks[i]
      };

      await DatabaseService.saveBookmark(bookmark);
      this.mockBookmarks.push(bookmark);
    }
  }

  /**
   * Get current settings (synchronous for test assertions)
   */
  static getCurrentSettings(): AppSettings {
    return { ...this.currentSettings };
  }

  /**
   * Get current bookmarks (synchronous for test assertions)
   */
  static getCurrentBookmarks(): LocalBookmark[] {
    return [...this.mockBookmarks];
  }

  /**
   * Clear all test data
   */
  static async cleanup(): Promise<void> {
    const { DatabaseService } = await import('../../services/database');
    await DatabaseService.clearAll();
    this.currentSettings = { ...this.defaultSettings };
    this.mockBookmarks = [];
  }

  /**
   * Wait for database operations to complete and reactive queries to update
   */
  static async waitForUpdates(_timeoutMs: number = 1000): Promise<void> {
    // Give time for reactive queries to process updates
    await new Promise(resolve => setTimeout(resolve, 50));

    // Advance timers if fake timers are active
    try {
      if (vi.getTimerCount && vi.getTimerCount() > 0) {
        vi.advanceTimersByTime(100);
      }
    } catch (error) {
      // Ignore if not using fake timers
    }
  }
}