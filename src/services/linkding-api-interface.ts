import type { LinkdingBookmark, LinkdingResponse, AppSettings, LinkdingAsset } from '../types';
import { MockLinkdingAPI } from './linkding-api-mock';
import { RealLinkdingAPI } from './linkding-api-real';

export interface ILinkdingAPI {
  getBookmarks(limit?: number, offset?: number, modifiedSince?: string): Promise<LinkdingResponse>;
  getArchivedBookmarks(limit?: number, offset?: number, modifiedSince?: string): Promise<LinkdingResponse>;
  getAllBookmarks(modifiedSince?: string): Promise<LinkdingBookmark[]>;
  getBookmark(id: number): Promise<LinkdingBookmark>;
  markBookmarkAsRead(id: number): Promise<LinkdingBookmark>;
  getBookmarkAssets(bookmarkId: number): Promise<LinkdingAsset[]>;
  downloadAsset(bookmarkId: number, assetId: number): Promise<ArrayBuffer>;
}

export interface ILinkdingAPIConstructor {
  new (baseUrl: string, token: string): ILinkdingAPI;
  testConnection(settings: AppSettings): Promise<boolean>;
}

export function createLinkdingAPI(baseUrl: string, token: string): ILinkdingAPI {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const isMockMode = cleanUrl === 'https://linkding.example.com';
  
  if (isMockMode) {
    return new MockLinkdingAPI(baseUrl, token);
  } else {
    return new RealLinkdingAPI(baseUrl, token);
  }
}

export async function testLinkdingConnection(settings: AppSettings): Promise<boolean> {
  const api = createLinkdingAPI(settings.linkding_url, settings.linkding_token);
  try {
    await api.getBookmarks(1);
    return true;
  } catch (error) {
    console.error('Connection test failed:', error);
    return false;
  }
}