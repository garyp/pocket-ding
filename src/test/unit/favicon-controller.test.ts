import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FaviconController } from '../../controllers/favicon-controller';
import type { ReactiveControllerHost } from 'lit';

// Mock dependencies
vi.mock('../../services/favicon-service', () => ({
  FaviconService: {
    getFaviconForBookmark: vi.fn(),
    getInstance: vi.fn(),
  },
}));

// Import after mocking
import { FaviconService } from '../../services/favicon-service';


describe('FaviconController', () => {
  let mockHost: ReactiveControllerHost;
  let controller: FaviconController;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mock host
    mockHost = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
      removeController: vi.fn(),
      updateComplete: Promise.resolve(true),
      renderRoot: {
        querySelectorAll: vi.fn(() => []),
      },
      querySelectorAll: vi.fn(() => []),
    } as any as ReactiveControllerHost;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('initialization', () => {
    it('should register itself with the host', () => {
      controller = new FaviconController(mockHost);
      expect(mockHost.addController).toHaveBeenCalledWith(controller);
    });

    it('should accept options', () => {
      const options = {
        rootMargin: '200px',
        threshold: 0.5,
        onFaviconLoaded: vi.fn(),
        onError: vi.fn(),
      };

      controller = new FaviconController(mockHost, options);
      expect(mockHost.addController).toHaveBeenCalledWith(controller);
    });

    it('should initialize with default favicon state', () => {
      controller = new FaviconController(mockHost);
      const faviconState = controller.getFaviconState();

      expect(faviconState.faviconCache).toEqual(new Map());
      expect(faviconState.isLoading).toEqual(new Set());
    });

  });





  describe('favicon loading', () => {
    let onFaviconLoaded: any;
    let onError: any;
    let mockFaviconService: any;

    beforeEach(() => {
      onFaviconLoaded = vi.fn();
      onError = vi.fn();

      // Set up mock service
      mockFaviconService = {
        getAllCachedFaviconUrls: vi.fn().mockReturnValue(new Map()),
        loadFaviconForBookmark: vi.fn(),
      };

      controller = new FaviconController(mockHost, {
        onFaviconLoaded,
        onError,
      });
      
      // Mock the service instance
      (controller as any).faviconService = mockFaviconService;
    });

    it('should load favicon successfully', async () => {
      const faviconUrl = 'https://example.com/favicon.ico';

      mockFaviconService.loadFaviconForBookmark.mockResolvedValue(undefined);

      await controller.loadFavicon(123, faviconUrl);

      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(123, faviconUrl);
      expect(controller.isLoading(123)).toBe(false);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should handle favicon loading errors', async () => {
      const faviconUrl = 'https://example.com/favicon.ico';
      const error = new Error('Failed to load favicon');

      mockFaviconService.loadFaviconForBookmark.mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await controller.loadFavicon(123, faviconUrl);

      expect(controller.isLoading(123)).toBe(false);
      expect(onError).toHaveBeenCalledWith(123, error);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load favicon:', error);

      consoleSpy.mockRestore();
    });

    it('should skip loading if favicon is already cached', async () => {
      // Mock that favicon is already cached
      const cachedFavicons = new Map([[123, 'data:image/png;base64,cached']]);
      mockFaviconService.getAllCachedFaviconUrls.mockReturnValue(cachedFavicons);

      // Try to load the favicon
      await controller.loadFavicon(123, 'https://example.com/favicon.ico');

      // Should not call the service to load
      expect(mockFaviconService.loadFaviconForBookmark).not.toHaveBeenCalled();
    });

    it('should skip loading if favicon is currently loading', async () => {
      // Mock service with delayed resolution
      let resolveLoad: () => void;
      const loadPromise = new Promise<void>(resolve => {
        resolveLoad = resolve;
      });
      mockFaviconService.loadFaviconForBookmark.mockReturnValue(loadPromise);

      // Start loading a favicon
      const firstLoad = controller.loadFavicon(123, 'https://example.com/favicon.ico');

      // Verify loading state
      expect(controller.isLoading(123)).toBe(true);

      // Try to load the same favicon again before the first one completes
      const secondLoad = controller.loadFavicon(123, 'https://example.com/favicon.ico');

      // Should only call the service once
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledTimes(1);

      // Complete the load
      resolveLoad!();
      await Promise.all([firstLoad, secondLoad]);
    });
  });

  describe('preload favicons', () => {
    let mockFaviconService: any;
    
    beforeEach(() => {
      mockFaviconService = {
        getAllCachedFaviconUrls: vi.fn().mockReturnValue(new Map()),
        loadFaviconForBookmark: vi.fn(),
      };
      
      controller = new FaviconController(mockHost);
      (controller as any).faviconService = mockFaviconService;
    });

    it('should preload favicons for multiple bookmarks', async () => {
      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
        { id: 3 }, // No favicon_url
        { id: 4, favicon_url: 'https://example.com/favicon4.ico' },
      ];

      mockFaviconService.loadFaviconForBookmark.mockResolvedValue(undefined);

      await controller.preloadFavicons(bookmarks);

      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledTimes(3);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(1, bookmarks[0]!.favicon_url!);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(4, bookmarks[3]!.favicon_url!);
    });

    it('should not preload already cached favicons', async () => {
      // Mock that favicon 1 is already cached
      const cachedFavicons = new Map([[1, 'data:image/png;base64,cached']]);
      mockFaviconService.getAllCachedFaviconUrls.mockReturnValue(cachedFavicons);

      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
      ];

      mockFaviconService.loadFaviconForBookmark.mockResolvedValue(undefined);

      await controller.preloadFavicons(bookmarks);

      // Should only load the uncached favicon
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledTimes(1);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
    });
  });

  describe('visibility handling', () => {
    let mockFaviconService: any;
    
    beforeEach(() => {
      mockFaviconService = {
        getAllCachedFaviconUrls: vi.fn().mockReturnValue(new Map()),
        loadFaviconForBookmark: vi.fn(),
      };
      
      controller = new FaviconController(mockHost);
      (controller as any).faviconService = mockFaviconService;
    });

    it('should handle visibility changes', async () => {
      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
        { id: 3 }, // No favicon_url
      ];

      mockFaviconService.loadFaviconForBookmark.mockResolvedValue(undefined);

      controller.handleVisibilityChanged([1, 2, 3], bookmarks);

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledTimes(2);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(1, bookmarks[0]!.favicon_url!);
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
    });
  });


  describe('cache management', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
    });

    it('should clear loading state', async () => {
      // Create a mock service instance
      const mockService = {
        getAllCachedFaviconUrls: vi.fn().mockReturnValue(new Map()),
        loadFaviconForBookmark: vi.fn().mockResolvedValue('data:image/png;base64,test'),
      };
      
      // Mock the service for the controller
      controller = new FaviconController(mockHost);
      (controller as any).faviconService = mockService;

      // Simulate loading state
      (controller as any).isLoadingSet.add(1);
      (controller as any).isLoadingSet.add(2);

      expect(controller.isLoading(1)).toBe(true);
      expect(controller.isLoading(2)).toBe(true);

      controller.clearCache();

      expect(controller.isLoading(1)).toBe(false);
      expect(controller.isLoading(2)).toBe(false);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should return favicon state as immutable copies', () => {
      const state1 = controller.getFaviconState();
      const state2 = controller.getFaviconState();

      expect(state1).not.toBe(state2);
      expect(state1.faviconCache).not.toBe(state2.faviconCache);
      expect(state1.isLoading).not.toBe(state2.isLoading);
    });
  });

  describe('service cache synchronization', () => {
    let mockFaviconService: any;

    beforeEach(() => {
      vi.useFakeTimers();
      
      mockFaviconService = {
        waitForInitialization: vi.fn().mockResolvedValue(undefined),
        getAllCachedFaviconUrls: vi.fn().mockReturnValue(new Map()),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        loadFaviconForBookmark: vi.fn().mockResolvedValue(undefined),
      };
      
      vi.mocked(FaviconService.getInstance).mockReturnValue(mockFaviconService);
      controller = new FaviconController(mockHost);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should initialize service on host connect', async () => {
      const existingFavicons = new Map([
        [123, 'data:image/png;base64,cached1'],
        [456, 'data:image/png;base64,cached2']
      ]);
      
      mockFaviconService.getAllCachedFaviconUrls.mockReturnValue(existingFavicons);
      
      controller.hostConnected();
      
      // Wait for async initialization
      await vi.runAllTimersAsync();
      
      expect(mockFaviconService.waitForInitialization).toHaveBeenCalled();
      expect(mockFaviconService.addEventListener).toHaveBeenCalledWith('favicon-loaded', expect.any(Function));
      
      // Service cache should be accessible through controller
      const faviconState = controller.getFaviconState();
      expect(faviconState.faviconCache.get(123)).toBe('data:image/png;base64,cached1');
      expect(faviconState.faviconCache.get(456)).toBe('data:image/png;base64,cached2');
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should handle service initialization errors gracefully', async () => {
      mockFaviconService.waitForInitialization.mockRejectedValue(new Error('Service initialization failed'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      controller.hostConnected();
      
      // Wait for async initialization
      await vi.runAllTimersAsync();
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize favicon service:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should handle favicon-loaded events for loading state management', async () => {
      let eventListener: Function;
      mockFaviconService.addEventListener.mockImplementation((eventType: string, listener: Function) => {
        if (eventType === 'favicon-loaded') {
          eventListener = listener;
        }
      });
      
      controller.hostConnected();
      await vi.runAllTimersAsync();
      
      // Mark as loading first
      const onFaviconLoaded = vi.fn();
      controller = new FaviconController(mockHost, { onFaviconLoaded });
      controller.hostConnected();
      await vi.runAllTimersAsync();
      
      // Simulate loading state
      expect(controller.isLoading(789)).toBe(false);
      
      // Simulate favicon-loaded event
      const mockEvent = new CustomEvent('favicon-loaded', {
        detail: { bookmarkId: 789, faviconUrl: 'data:image/png;base64,newFavicon' }
      });
      
      eventListener!(mockEvent);
      
      expect(mockHost.requestUpdate).toHaveBeenCalled();
      expect(onFaviconLoaded).toHaveBeenCalledWith(789, 'data:image/png;base64,newFavicon');
    });

    it('should clean up service event listener on disconnect', async () => {
      controller.hostConnected();
      await vi.runAllTimersAsync();
      
      controller.hostDisconnected();
      
      expect(mockFaviconService.removeEventListener).toHaveBeenCalledWith('favicon-loaded', expect.any(Function));
    });

    it('should use service instance for favicon loading when available', async () => {
      controller.hostConnected();
      await vi.runAllTimersAsync();
      
      await controller.loadFavicon(123, 'https://example.com/favicon.ico');
      
      expect(mockFaviconService.loadFaviconForBookmark).toHaveBeenCalledWith(123, 'https://example.com/favicon.ico');
    });
  });
});