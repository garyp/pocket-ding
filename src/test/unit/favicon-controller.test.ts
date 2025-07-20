import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FaviconController } from '../../controllers/favicon-controller';
import type { ReactiveControllerHost } from 'lit';

// Mock dependencies
vi.mock('../../services/favicon-service', () => ({
  FaviconService: {
    getFaviconForBookmark: vi.fn(),
  },
}));

// Import after mocking
import { FaviconService } from '../../services/favicon-service';

// Mock IntersectionObserver
const mockIntersectionObserver = {
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
  callback: undefined as any,
  options: undefined as any,
};

beforeEach(() => {
  global.IntersectionObserver = vi.fn().mockImplementation((callback, options) => {
    mockIntersectionObserver.callback = callback;
    mockIntersectionObserver.options = options;
    return mockIntersectionObserver;
  });
});

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

    it('should use default options when none provided', () => {
      controller = new FaviconController(mockHost);
      controller.hostConnected();

      expect(global.IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        {
          root: null,
          rootMargin: '100px',
          threshold: 0.1,
        }
      );
    });
  });

  describe('hostConnected', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
    });

    it('should setup intersection observer', () => {
      controller.hostConnected();
      expect(global.IntersectionObserver).toHaveBeenCalled();
    });

    it('should use custom options for intersection observer', () => {
      const options = {
        rootMargin: '200px',
        threshold: 0.3,
      };

      controller = new FaviconController(mockHost, options);
      controller.hostConnected();

      expect(global.IntersectionObserver).toHaveBeenCalledWith(
        expect.any(Function),
        {
          root: null,
          rootMargin: '200px',
          threshold: 0.3,
        }
      );
    });
  });

  describe('hostDisconnected', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
      controller.hostConnected();
    });

    it('should cleanup intersection observer', () => {
      controller.hostDisconnected();
      expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
    });
  });

  describe('hostUpdated', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
      controller.hostConnected();
    });

    it('should re-observe elements after DOM updates', () => {
      const mockElements = [
        { getAttribute: vi.fn().mockReturnValue('1') },
        { getAttribute: vi.fn().mockReturnValue('2') },
      ];

      vi.mocked((mockHost as any).renderRoot!.querySelectorAll).mockReturnValue(mockElements as any);

      controller.hostUpdated();

      expect(mockIntersectionObserver.disconnect).toHaveBeenCalled();
      expect(mockIntersectionObserver.observe).toHaveBeenCalledTimes(2);
      expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(mockElements[0]);
      expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(mockElements[1]);
    });

    it('should fall back to host.querySelectorAll when renderRoot not available', () => {
      const hostWithoutRenderRoot = {
        ...mockHost,
        renderRoot: undefined,
      } as any;

      const mockElements = [
        { getAttribute: vi.fn().mockReturnValue('1') },
      ];

      vi.mocked(hostWithoutRenderRoot.querySelectorAll).mockReturnValue(mockElements);

      controller = new FaviconController(hostWithoutRenderRoot);
      controller.hostConnected();
      controller.hostUpdated();

      expect(mockIntersectionObserver.observe).toHaveBeenCalledWith(mockElements[0]);
    });
  });

  describe('intersection observer callback', () => {
    let onFaviconLoaded: any;
    let onError: any;

    beforeEach(() => {
      onFaviconLoaded = vi.fn();
      onError = vi.fn();

      controller = new FaviconController(mockHost, {
        onFaviconLoaded,
        onError,
      });
      controller.hostConnected();
    });

    it('should handle intersecting elements', () => {
      const entries = [
        {
          isIntersecting: true,
          target: { getAttribute: vi.fn().mockReturnValue('123') },
        },
        {
          isIntersecting: false,
          target: { getAttribute: vi.fn().mockReturnValue('456') },
        },
        {
          isIntersecting: true,
          target: { getAttribute: vi.fn().mockReturnValue('789') },
        },
      ];

      // Call the intersection observer callback
      mockIntersectionObserver.callback!(entries);

      // Should not automatically load favicons since we need the URL
      const faviconState = controller.getFaviconState();
      expect(faviconState.isLoading.size).toBe(0);
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

  describe('observe bookmarks', () => {
    beforeEach(() => {
      controller = new FaviconController(mockHost);
      controller.hostConnected();
    });

    it('should observe bookmark elements and preload visible ones', async () => {
      const bookmarks = [
        { id: 1, favicon_url: 'https://example.com/favicon1.ico' },
        { id: 2, favicon_url: 'https://example.com/favicon2.ico' },
      ];

      // Mock getBoundingClientRect to simulate visible elements
      const mockElements = [
        {
          getAttribute: vi.fn().mockReturnValue('1'),
          getBoundingClientRect: vi.fn().mockReturnValue({
            top: 100,
            bottom: 200,
          }),
        },
        {
          getAttribute: vi.fn().mockReturnValue('2'),
          getBoundingClientRect: vi.fn().mockReturnValue({
            top: 1000, // Not visible
            bottom: 1100,
          }),
        },
      ];

      vi.mocked((mockHost as any).renderRoot.querySelectorAll).mockReturnValue(mockElements as any);

      // Mock window.innerHeight
      Object.defineProperty(window, 'innerHeight', {
        writable: true,
        configurable: true,
        value: 800,
      });

      vi.mocked(FaviconService.getFaviconForBookmark).mockResolvedValue('data:image/png;base64,test');

      controller.observeBookmarks(bookmarks);

      // Wait for the timeout and async operations
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should only load favicon for visible element (id: 1)
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledTimes(1);
      expect(FaviconService.getFaviconForBookmark).toHaveBeenCalledWith(1, bookmarks[0]!.favicon_url!);
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
});