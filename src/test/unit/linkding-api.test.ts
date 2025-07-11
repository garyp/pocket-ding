import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LinkdingAPI } from '../../services/linkding-api';
import { mockLinkdingResponse, mockBookmarks } from '../mocks/linkding-api.mock';

describe('LinkdingAPI', () => {
  let api: LinkdingAPI;

  beforeEach(() => {
    api = new LinkdingAPI('https://linkding.example.com', 'test-token');
    vi.clearAllMocks();
  });

  it('should fetch bookmarks', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLinkdingResponse),
    });
    global.fetch = mockFetch;

    const result = await api.getBookmarks();
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://linkding.example.com/api/bookmarks/?limit=100&offset=0',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Token test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toEqual(mockLinkdingResponse);
  });

  it('should fetch all bookmarks with pagination', async () => {
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockLinkdingResponse,
          next: 'https://linkding.example.com/api/bookmarks/?limit=100&offset=100',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockLinkdingResponse,
          next: null,
        }),
      });
    global.fetch = mockFetch;

    const result = await api.getAllBookmarks();
    
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(result).toHaveLength(mockBookmarks.length * 2);
  });

  it('should handle API errors', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    });
    global.fetch = mockFetch;

    await expect(api.getBookmarks()).rejects.toThrow('API request failed: 401 Unauthorized');
  });

  it('should test connection successfully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLinkdingResponse),
    });
    global.fetch = mockFetch;

    const result = await LinkdingAPI.testConnection({
      linkding_url: 'https://linkding.example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability',
    });

    expect(result).toBe(true);
  });
});