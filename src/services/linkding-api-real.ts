import { appFetch } from '../utils/fetch-helper';
import type { LinkdingBookmark, LinkdingResponse, LinkdingAsset, LinkdingAssetResponse } from '../types';
import type { LinkdingAPI } from './linkding-api';
import { DebugService } from './debug-service';

export class RealLinkdingAPI implements LinkdingAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}/api${endpoint}`;
    const method = options.method || 'GET';
    
    DebugService.logApiRequest(url, method);
    
    const response = await appFetch(url, {
      ...options,
      headers: {
        'Authorization': `Token ${this.token}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    DebugService.logApiResponse(url, response.status, response.statusText);

    if (!response.ok) {
      const error = new Error(`API request failed: ${response.status} ${response.statusText}`);
      DebugService.logApiError(error, { url, method, status: response.status, statusText: response.statusText });
      throw error;
    }

    return await response.json();
  }

  async getBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    let query = `limit=${limit}&offset=${offset}`;
    if (modifiedSince) {
      query += `&modified_since=${encodeURIComponent(modifiedSince)}`;
    }
    query += `&q=`;
    return await this.request<LinkdingResponse>(`/bookmarks/?${query}`);
  }

  async getArchivedBookmarks(limit = 100, offset = 0, modifiedSince?: string): Promise<LinkdingResponse> {
    let query = `limit=${limit}&offset=${offset}`;
    if (modifiedSince) {
      query += `&modified_since=${encodeURIComponent(modifiedSince)}`;
    }
    query += `&q=`;
    return await this.request<LinkdingResponse>(`/bookmarks/archived/?${query}`);
  }

  async getAllBookmarks(modifiedSince?: string): Promise<LinkdingBookmark[]> {
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
    return await this.request<LinkdingBookmark>(`/bookmarks/${id}/`);
  }

  async markBookmarkAsRead(id: number): Promise<LinkdingBookmark> {
    return await this.request<LinkdingBookmark>(`/bookmarks/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ unread: false }),
    });
  }

  async getBookmarkAssets(bookmarkId: number): Promise<LinkdingAsset[]> {
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
    const url = `${this.baseUrl}/api/bookmarks/${bookmarkId}/assets/${assetId}/download/`;

    DebugService.logApiRequest(url, 'GET');

    // Create timeout controller for asset downloads (30 second timeout)
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      DebugService.logApiError(new Error(`Asset download timeout after 30s`), {
        url, method: 'GET', bookmarkId, assetId, timeout: 30000
      });
      timeoutController.abort();
    }, 30000);

    try {
      const response = await appFetch(url, {
        headers: {
          'Authorization': `Token ${this.token}`,
        },
        signal: timeoutController.signal
      });

      DebugService.logApiResponse(url, response.status, response.statusText);

      if (!response.ok) {
        const error = new Error(`Failed to download asset: ${response.status} ${response.statusText}`);
        DebugService.logApiError(error, { url, method: 'GET', bookmarkId, assetId, status: response.status, statusText: response.statusText });
        throw error;
      }

      const startTime = Date.now();
      const arrayBuffer = await response.arrayBuffer();
      const downloadTime = Date.now() - startTime;

      DebugService.logApiSuccess(`Downloaded asset ${assetId} for bookmark ${bookmarkId} (${arrayBuffer.byteLength} bytes in ${downloadTime}ms)`);

      return arrayBuffer;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.getBookmarks(1);
      DebugService.logApiSuccess('Connection test successful');
      return true;
    } catch (error) {
      DebugService.logApiError(error as Error, { context: 'connection_test' });
      return false;
    }
  }
}