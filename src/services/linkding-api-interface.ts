import type { LinkdingBookmark, LinkdingResponse, LinkdingAsset } from '../types';
import { MockLinkdingAPI } from './linkding-api-mock';
import { RealLinkdingAPI } from './linkding-api-real';

export interface LinkdingAPI {
  getBookmarks(limit?: number, offset?: number, modifiedSince?: string): Promise<LinkdingResponse>;
  getArchivedBookmarks(limit?: number, offset?: number, modifiedSince?: string): Promise<LinkdingResponse>;
  getAllBookmarks(modifiedSince?: string): Promise<LinkdingBookmark[]>;
  getBookmark(id: number): Promise<LinkdingBookmark>;
  markBookmarkAsRead(id: number): Promise<LinkdingBookmark>;
  getBookmarkAssets(bookmarkId: number): Promise<LinkdingAsset[]>;
  downloadAsset(bookmarkId: number, assetId: number): Promise<ArrayBuffer>;
  testConnection(): Promise<boolean>;
}

export function createLinkdingAPI(baseUrl: string, token: string): LinkdingAPI {
  const cleanUrl = baseUrl.replace(/\/$/, '');
  const isMockMode = cleanUrl === 'https://linkding.example.com';
  
  if (isMockMode) {
    return new MockLinkdingAPI(baseUrl, token);
  } else {
    return new RealLinkdingAPI(baseUrl, token);
  }
}