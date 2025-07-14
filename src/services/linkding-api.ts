import { appFetch } from '../utils/fetch-helper';
import type { LinkdingBookmark, LinkdingResponse, AppSettings, LinkdingAsset, LinkdingAssetResponse } from '../types';

export class LinkdingAPI {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.token = token;
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
      await api.getBookmarks(1);
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}