// Re-export the interface and factory for backward compatibility
export { ILinkdingAPI, testLinkdingConnection } from './linkding-api-interface';
export { MockLinkdingAPI } from './linkding-api-mock';
export { RealLinkdingAPI } from './linkding-api-real';

import type { ILinkdingAPI } from './linkding-api-interface';
import { MOCK_URL } from './mock-data';
import { MockLinkdingAPI } from './linkding-api-mock';
import { RealLinkdingAPI } from './linkding-api-real';

// Backward compatibility class that delegates to the factory
export class LinkdingAPI {
  private api: ILinkdingAPI;

  constructor(baseUrl: string, token: string) {
    this.api = this.createApi(baseUrl, token);
  }

  private createApi(baseUrl: string, token: string): ILinkdingAPI {
    const cleanUrl = baseUrl.replace(/\/$/, '');
    const isMockMode = cleanUrl === MOCK_URL;
    
    if (isMockMode) {
      return new MockLinkdingAPI(baseUrl, token);
    } else {
      return new RealLinkdingAPI(baseUrl, token);
    }
  }

  async getBookmarks(limit?: number, offset?: number, modifiedSince?: string) {
    return this.api.getBookmarks(limit, offset, modifiedSince);
  }

  async getArchivedBookmarks(limit?: number, offset?: number, modifiedSince?: string) {
    return this.api.getArchivedBookmarks(limit, offset, modifiedSince);
  }

  async getAllBookmarks(modifiedSince?: string) {
    return this.api.getAllBookmarks(modifiedSince);
  }

  async getBookmark(id: number) {
    return this.api.getBookmark(id);
  }

  async markBookmarkAsRead(id: number) {
    return this.api.markBookmarkAsRead(id);
  }

  async getBookmarkAssets(bookmarkId: number) {
    return this.api.getBookmarkAssets(bookmarkId);
  }

  async downloadAsset(bookmarkId: number, assetId: number) {
    return this.api.downloadAsset(bookmarkId, assetId);
  }

  static async testConnection(settings: any) {
    const { testLinkdingConnection } = await import('./linkding-api-interface');
    return testLinkdingConnection(settings);
  }
}

// Export the factory function for new code
export function createLinkdingAPI(baseUrl: string, token: string): ILinkdingAPI {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const isMockMode = cleanUrl === MOCK_URL;
  
  if (isMockMode) {
    return new MockLinkdingAPI(baseUrl, token);
  } else {
    return new RealLinkdingAPI(baseUrl, token);
  }
}