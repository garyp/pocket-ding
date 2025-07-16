import { appFetch } from '../utils/fetch-helper';
import type { LinkdingBookmark, LinkdingResponse, AppSettings, LinkdingAsset, LinkdingAssetResponse } from '../types';
import { 
  mockBookmarks, 
  mockAssets, 
  MOCK_URL 
} from './mock-data';

export class LinkdingAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private isMockMode(): boolean {
    return this.baseUrl === MOCK_URL;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`;
    
    const response = await appFetch(url, {
      ...options,
      headers: {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  async getBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    if (this.isMockMode()) {
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
    
    let query = `limit=${limit}&offset=${offset}`;
    if (modifiedSince) {
      query += `&modified_since=${encodeURIComponent(modifiedSince)}`;
    }
    query += `&q=`;
    return await this.request<LinkdingResponse>(`/bookmarks/?${query}`);
  }

  async getArchivedBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    if (this.isMockMode()) {
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
    
    let query = `limit=${limit}&offset=${offset}`;
    if (modifiedSince) {
      query += `&modified_since=${encodeURIComponent(modifiedSince)}`;
    }
    query += `&q=`;
    return await this.request<LinkdingResponse>(`/bookmarks/archived/?${query}`);
  }

  async getAllBookmarks(modifiedSince?: string): Promise<LinkdingBookmark[]> {
    if (this.isMockMode()) {
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
    
    const allBookmarks: LinkdingBookmark[] = [];
    
    // Fetch unarchived bookmarks
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.getBookmarks(limit, offset, modifiedSince);
      allBookmarks.push(...response.results);
      
      if (!response.next) break;
      offset += limit;
    }
    
    // Fetch archived bookmarks
    offset = 0;
    while (true) {
      const response = await this.getArchivedBookmarks(limit, offset, modifiedSince);
      allBookmarks.push(...response.results);
      
      if (!response.next) break;
      offset += limit;
    }

    return allBookmarks;
  }

  async getBookmark(id: number): Promise<LinkdingBookmark> {
    if (this.isMockMode()) {
      const bookmark = mockBookmarks.find(b => b.id === id);
      if (!bookmark) {
        throw new Error(`Bookmark not found: ${id}`);
      }
      return bookmark;
    }
    
    return await this.request<LinkdingBookmark>(`/bookmarks/${id}/`);
  }

  async markBookmarkAsRead(id: number): Promise<LinkdingBookmark> {
    if (this.isMockMode()) {
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
    
    return await this.request<LinkdingBookmark>(`/bookmarks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ unread: false }),
    });
  }

  async getBookmarkAssets(bookmarkId: number): Promise<LinkdingAsset[]> {
    if (this.isMockMode()) {
      // Return mock assets for all bookmarks
      return mockAssets;
    }
    
    const allAssets: LinkdingAsset[] = [];
    let offset = 0;
    const limit = 100;

    while (true) {
      const response = await this.request<LinkdingAssetResponse>(`/bookmarks/${bookmarkId}/assets/?limit=${limit}&offset=${offset}`);
      allAssets.push(...response.results);
      
      if (!response.next) break;
      offset += limit;
    }

    return allAssets;
  }

  async downloadAsset(bookmarkId: number, assetId: number): Promise<ArrayBuffer> {
    if (this.isMockMode()) {
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
    
    const url = `${this.baseUrl}/api/bookmarks/${bookmarkId}/assets/${assetId}/download/`;
    
    const response = await appFetch(url, {
      headers: {
        'Authorization': `Token ${this.token}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
    }

    return await response.arrayBuffer();
  }

  static async testConnection(settings: AppSettings): Promise<boolean> {
    try {
      const api = new LinkdingAPI(settings.linkding_url, settings.linkding_token);
      if (api.isMockMode()) {
        // Mock mode always returns true for connection test
        return true;
      }
      await api.getBookmarks(1);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}