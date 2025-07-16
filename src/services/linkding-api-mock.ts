import type { LinkdingBookmark, LinkdingResponse, AppSettings, LinkdingAsset } from '../types';
import type { ILinkdingAPI } from './linkding-api-interface';
import { 
  mockBookmarks, 
  mockAssets, 
  MOCK_URL 
} from './mock-data';

export class MockLinkdingAPI implements ILinkdingAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  async getBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    // Simulate pagination for mock data
    const unreadBookmarks = mockBookmarks.filter(bookmark => !bookmark.is_archived);
    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, unreadBookmarks.length);
    const results = unreadBookmarks.slice(startIndex, endIndex);
    
    return {
      count: unreadBookmarks.length,
      next: endIndex < unreadBookmarks.length ? `${MOCK_URL}/api/bookmarks/?limit=${limit}&offset=${endIndex}` : null,
      previous: startIndex > 0 ? `${MOCK_URL}/api/bookmarks/?limit=${limit}&offset=${Math.max(0, startIndex - limit)}` : null,
      results,
    };
  }

  async getArchivedBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    // Simulate pagination for mock data
    const archivedBookmarks = mockBookmarks.filter(bookmark => bookmark.is_archived);
    const startIndex = offset;
    const endIndex = Math.min(startIndex + limit, archivedBookmarks.length);
    const results = archivedBookmarks.slice(startIndex, endIndex);
    
    return {
      count: archivedBookmarks.length,
      next: endIndex < archivedBookmarks.length ? `${MOCK_URL}/api/bookmarks/archived/?limit=${limit}&offset=${endIndex}` : null,
      previous: startIndex > 0 ? `${MOCK_URL}/api/bookmarks/archived/?limit=${limit}&offset=${Math.max(0, startIndex - limit)}` : null,
      results,
    };
  }

  async getAllBookmarks(modifiedSince?: string): Promise<LinkdingBookmark[]> {
    // Filter mock bookmarks by modified date if specified
    let filteredBookmarks = mockBookmarks;
    if (modifiedSince) {
      const modifiedDate = new Date(modifiedSince);
      filteredBookmarks = mockBookmarks.filter(bookmark => 
        new Date(bookmark.date_modified) >= modifiedDate
      );
    }
    return filteredBookmarks;
  }

  async getBookmark(id: number): Promise<LinkdingBookmark> {
    const bookmark = mockBookmarks.find(b => b.id === id);
    if (!bookmark) {
      throw new Error(`Bookmark not found: ${id}`);
    }
    return bookmark;
  }

  async markBookmarkAsRead(id: number): Promise<LinkdingBookmark> {
    const bookmark = mockBookmarks.find(b => b.id === id);
    if (!bookmark) {
      throw new Error(`Bookmark not found: ${id}`);
    }
    // Return a copy with unread set to false
    return {
      ...bookmark,
      unread: false,
    };
  }

  async getBookmarkAssets(bookmarkId: number): Promise<LinkdingAsset[]> {
    // Return mock assets for all bookmarks
    return mockAssets;
  }

  async downloadAsset(bookmarkId: number, assetId: number): Promise<ArrayBuffer> {
    // Return mock asset data (simple HTML content)
    const mockHtml = `
      <html>
      <head>
        <title>Mock Asset for Bookmark ${bookmarkId}</title>
      </head>
      <body>
        <h1>Mock Asset Content</h1>
        <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
        <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
        <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
      </body>
      </html>
    `;
    return new TextEncoder().encode(mockHtml).buffer as ArrayBuffer;
  }

  static async testConnection(settings: AppSettings): Promise<boolean> {
    // Mock mode always returns true for connection test
    return true;
  }
}