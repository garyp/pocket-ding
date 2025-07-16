import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RealLinkdingAPI, testLinkdingConnection, type LinkdingAPI } from '../../services/linkding-api';
import { mockLinkdingResponse, mockBookmarks } from '../mocks/linkding-api.mock';

describe('LinkdingAPI', () => {
  let api: LinkdingAPI;

  beforeEach(() => {
    api = new RealLinkdingAPI('https://real-linkding.example.com', 'test-token');
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
      'https://real-linkding.example.com/api/bookmarks/?limit=100&offset=0&q=',
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
      // First page of unarchived bookmarks
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockLinkdingResponse,
          next: 'https://real-linkding.example.com/api/bookmarks/?limit=100&offset=100',
        }),
      })
      // Second page of unarchived bookmarks  
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockLinkdingResponse,
          next: null,
        }),
      })
      // First page of archived bookmarks
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          ...mockLinkdingResponse,
          next: null,
        }),
      });
    global.fetch = mockFetch;

    const result = await api.getAllBookmarks();
    
    expect(mockFetch).toHaveBeenCalledTimes(3); // 2 for unarchived + 1 for archived
    expect(result).toHaveLength(mockBookmarks.length * 3); // 3 pages total
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

    const result = await testLinkdingConnection({
      linkding_url: 'https://real-linkding.example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability',
    });

    expect(result).toBe(true);
  });

  it('should fetch bookmarks with modified_since parameter', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockLinkdingResponse),
    });
    global.fetch = mockFetch;

    const modifiedSince = '2024-01-01T00:00:00Z';
    const result = await api.getBookmarks(100, 0, modifiedSince);
    
    expect(mockFetch).toHaveBeenCalledWith(
      'https://real-linkding.example.com/api/bookmarks/?limit=100&offset=0&modified_since=2024-01-01T00%3A00%3A00Z&q=',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Authorization': 'Token test-token',
          'Content-Type': 'application/json',
        }),
      })
    );
    expect(result).toEqual(mockLinkdingResponse);
  });

  it('should fetch all bookmarks with modified_since parameter', async () => {
    const mockFetch = vi.fn()
      // Mock response for unarchived bookmarks
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLinkdingResponse),
      })
      // Mock response for archived bookmarks
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockLinkdingResponse),
      });
    global.fetch = mockFetch;

    const modifiedSince = '2024-01-01T00:00:00Z';
    const result = await api.getAllBookmarks(modifiedSince);
    
    // Should call both unarchived and archived endpoints
    expect(mockFetch).toHaveBeenCalledWith(
      'https://real-linkding.example.com/api/bookmarks/?limit=100&offset=0&modified_since=2024-01-01T00%3A00%3A00Z&q=',
      expect.anything()
    );
    expect(mockFetch).toHaveBeenCalledWith(
      'https://real-linkding.example.com/api/bookmarks/archived/?limit=100&offset=0&modified_since=2024-01-01T00%3A00%3A00Z&q=',
      expect.anything()
    );
    expect(result).toEqual([...mockBookmarks, ...mockBookmarks]); // Both unarchived and archived
  });

  describe('Asset Methods', () => {
    it('should fetch bookmark assets', async () => {
      const mockAssets = [
        {
          id: 1,
          asset_type: 'snapshot',
          content_type: 'text/html',
          display_name: 'Page Snapshot',
          file_size: 12345,
          status: 'complete' as const,
          date_created: '2024-01-01T10:00:00Z',
        },
        {
          id: 2,
          asset_type: 'document',
          content_type: 'application/pdf',
          display_name: 'Document.pdf',
          file_size: 54321,
          status: 'complete' as const,
          date_created: '2024-01-01T10:30:00Z',
        },
      ];

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          results: mockAssets,
          next: null,
          count: 2
        }),
      });
      global.fetch = mockFetch;

      const result = await api.getBookmarkAssets(123);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://real-linkding.example.com/api/bookmarks/123/assets/?limit=100&offset=0',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual(mockAssets);
    });

    it('should handle paginated asset responses', async () => {
      const firstPageAssets = [
        {
          id: 1,
          asset_type: 'snapshot',
          content_type: 'text/html',
          display_name: 'Page Snapshot',
          file_size: 12345,
          status: 'complete' as const,
          date_created: '2024-01-01T10:00:00Z',
        },
      ];

      const secondPageAssets = [
        {
          id: 2,
          asset_type: 'document',
          content_type: 'application/pdf',
          display_name: 'Document.pdf',
          file_size: 54321,
          status: 'complete' as const,
          date_created: '2024-01-01T10:30:00Z',
        },
      ];

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: firstPageAssets,
            next: 'https://real-linkding.example.com/api/bookmarks/123/assets/?limit=100&offset=100',
            count: 2
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            results: secondPageAssets,
            next: null,
            count: 2
          }),
        });
      global.fetch = mockFetch;

      const result = await api.getBookmarkAssets(123);
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1,
        'https://real-linkding.example.com/api/bookmarks/123/assets/?limit=100&offset=0',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(mockFetch).toHaveBeenNthCalledWith(2,
        'https://real-linkding.example.com/api/bookmarks/123/assets/?limit=100&offset=100',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
      expect(result).toEqual([...firstPageAssets, ...secondPageAssets]);
    });

    it('should download asset as ArrayBuffer', async () => {
      const mockContent = new ArrayBuffer(8);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(mockContent),
      });
      global.fetch = mockFetch;

      const result = await api.downloadAsset(123, 456);
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://real-linkding.example.com/api/bookmarks/123/assets/456/download/',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Token test-token',
          }),
        })
      );
      expect(result).toBe(mockContent);
    });

    it('should handle asset fetch errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
      });
      global.fetch = mockFetch;

      await expect(api.getBookmarkAssets(123)).rejects.toThrow('API request failed: 404 Not Found');
    });

    it('should handle asset download errors', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
      });
      global.fetch = mockFetch;

      await expect(api.downloadAsset(123, 456)).rejects.toThrow('Failed to download asset: 403 Forbidden');
    });
  });
});