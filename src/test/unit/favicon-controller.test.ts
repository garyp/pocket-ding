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

    beforeEach(() => {
      onFaviconLoaded = vi.fn();
      onError = vi.fn();

      controller = new FaviconController(mockHost, {
        onFaviconLoaded,
        onError,
      });
    });

    it('should load favicon successfully', async () => {
      const faviconUrl = 'https://example.com/favicon.ico';
      const faviconDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...';

      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue(faviconDataUrl);

      await controller.loadFavicon(123, faviconUrl);

      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(123, faviconUrl);
      expect(controller.getFavicon(123)).toBe(faviconDataUrl);
      expect(controller.isLoading(123)).toBe(false);
      expect(onFaviconLoaded).toHaveBeenCalledWith(123, faviconDataUrl);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should handle favicon loading errors', async () => {
      const faviconUrl = 'https://example.com/favicon.ico';
      const error = new Error('Failed to load favicon');

      vi.mocked(FaviconService.getFaviconForBookmark).mockRejectedValue(error);

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await controller.loadFavicon(123, faviconUrl);

      expect(controller.getFavicon(123)).toBeUndefined();
      expect(controller.isLoading(123)).toBe(false);
      expect(onError).toHaveBeenCalledWith(123, error);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to load favicon:', error);

      consoleSpy.mockRestore();
    });

    it('should skip loading if favicon is already cached', async () => {
      // Pre-load a favicon
      const faviconDataUrl = 'data:image/png;base64,cached';
      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue(faviconDataUrl);
      await controller.loadFavicon(123, 'https://example.com/favicon.ico');

      vi.clearAllMocks();

      // Try to load the same favicon again
      await controller.loadFavicon(123, 'https://example.com/favicon.ico');

      expect(FaviconService.getFaviconForBookmark).not.toHaveBeenCalled();
    });

    it('should skip loading if favicon is currently loading', async () => {
      // Start loading a favicon
      const loadPromise = controller.loadFavicon(123, 'https://example.com/favicon.ico');

      // Try to load the same favicon again before the first one completes
      await controller.loadFavicon(123, 'https://example.com/favicon.ico');

      // Should only call the service once
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(1);

      // Wait for the original load to complete
      await loadPromise;
    });
  });

  describe('preload favicons', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
    });

    it('should preload favicons for multiple bookmarks', async () => {
      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
        { id: 3 }, // No favicon_url
        { id: 4, favicon_url: 'https://example.com/favicon4.ico' },
      ];

      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,test');

      await controller.preloadFavicons(bookmarks);

      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(3);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(1, bookmarks[0]!.favicon_url!);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(4, bookmarks[3]!.favicon_url!);
    });

    it('should not preload already cached favicons', async () => {
      // Pre-cache a favicon
      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,cached');
      await controller.loadFavicon(1, 'https://example.com/favicon1.ico');

      vi.clearAllMocks();

      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
      ];

      await controller.preloadFavicons(bookmarks);

      // Should only load the uncached favicon
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(1);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
    });
  });

  describe('visibility handling', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
    });

    it('should handle visibility changes', async () => {
      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
        { id: 3 }, // No favicon_url
      ];

      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,test');

      controller.handleVisibilityChanged([1, 2, 3], bookmarks);

      // Allow async operations to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(2);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(1, bookmarks[0]!.favicon_url!);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(2, bookmarks[1]!.favicon_url!);
    });
  });


  describe('cache management', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
    });

    it('should clear favicon cache', async () => {
      // Load some favicons first
      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,test');
      await controller.loadFavicon(1, 'https://example.com/favicon1.ico');
      await controller.loadFavicon(2, 'https://example.com/favicon2.ico');

      expect(controller.getFavicon(1)).toBeDefined();
      expect(controller.getFavicon(2)).toBeDefined();

      controller.clearCache();

      expect(controller.getFavicon(1)).toBeUndefined();
      expect(controller.getFavicon(2)).toBeUndefined();
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

    it('should initialize cache from service on host connect', async () => {
      const existingFavicons = new Map([
        [123, 'data:image/png;base64,cached1'],
        [456, 'data:image/png;base64,cached2']
      ]);
      
      mockFaviconService.getAllCachedFaviconUrls.mockReturnValue(existingFavicons);
      
      controller.hostConnected();
      
      // Wait for async initialization
      await vi.runAllTimersAsync();
      
      expect(mockFaviconService.waitForInitialization).toHaveBeenCalled();
      expect(mockFaviconService.getAllCachedFaviconUrls).toHaveBeenCalled();
      expect(mockFaviconService.addEventListener).toHaveBeenCalledWith('favicon-loaded', expect.any(Function));
      
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
      
      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize favicon cache from service:', expect.any(Error));
      
      consoleSpy.mockRestore();
    });

    it('should sync cache when service emits favicon-loaded event', async () => {
      let eventListener: Function;
      mockFaviconService.addEventListener.mockImplementation((eventType: string, listener: Function) => {
        if (eventType === 'favicon-loaded') {
          eventListener = listener;
        }
      });
      
      controller.hostConnected();
      await vi.runAllTimersAsync();
      
      // Simulate favicon-loaded event
      const mockEvent = new CustomEvent('favicon-loaded', {
        detail: { bookmarkId: 789, faviconUrl: 'data:image/png;base64,newFavicon' }
      });
      
      eventListener!(mockEvent);
      
      const faviconState = controller.getFaviconState();
      expect(faviconState.faviconCache.get(789)).toBe('data:image/png;base64,newFavicon');
      expect(mockHost.requestUpdate).toHaveBeenCalled();
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