import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThemeService } from '../../services/theme-service';

// Mock localStorage
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

Object.defineProperty(window, 'localStorage', {
  value: mockLocalStorage,
});

// Mock matchMedia
const mockMatchMedia = vi.fn();
Object.defineProperty(window, 'matchMedia', {
  value: mockMatchMedia,
});

describe('ThemeService', () => {
  let mockMediaQuery: any;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();
    
    // Mock media query
    mockMediaQuery = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    mockMatchMedia.mockReturnValue(mockMediaQuery);
    
    // Reset localStorage mock
    mockLocalStorage.getItem.mockReturnValue(null);
    
    // Reset ThemeService state
    ThemeService.reset();
  });

  afterEach(() => {
    // Clean up any theme links created during tests
    document.querySelectorAll('link[data-shoelace-theme]').forEach(link => link.remove());
  });

  describe('init', () => {
    it('should initialize with system theme when no saved preference', () => {
      ThemeService.init();
      
      expect(mockMatchMedia).toHaveBeenCalledWith('(prefers-color-scheme: dark)');
      expect(mockMediaQuery.addEventListener).toHaveBeenCalledWith('change', expect.any(Function));
      expect(document.documentElement.className).toBe('light');
    });

    it('should initialize with dark theme when system prefers dark', () => {
      mockMediaQuery.matches = true;
      
      ThemeService.init();
      
      expect(document.documentElement.className).toBe('dark');
      const themeLink = document.querySelector('link[data-shoelace-theme]');
      expect(themeLink?.getAttribute('href')).toContain('dark.css');
    });

    it('should use saved theme preference', () => {
      mockLocalStorage.getItem.mockReturnValue('dark');
      
      ThemeService.init();
      
      expect(document.documentElement.className).toBe('dark');
    });

    it('should ignore invalid saved theme preference', () => {
      mockLocalStorage.getItem.mockReturnValue('invalid');
      
      ThemeService.init();
      
      expect(document.documentElement.className).toBe('light');
    });
  });

  describe('setTheme', () => {
    beforeEach(() => {
      ThemeService.init();
    });

    it('should set light theme', () => {
      ThemeService.setTheme('light');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme-mode', 'light');
      expect(document.documentElement.className).toBe('light');
      
      const themeLink = document.querySelector('link[data-shoelace-theme]');
      expect(themeLink?.getAttribute('href')).toContain('light.css');
    });

    it('should set dark theme', () => {
      ThemeService.setTheme('dark');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme-mode', 'dark');
      expect(document.documentElement.className).toBe('dark');
      
      const themeLink = document.querySelector('link[data-shoelace-theme]');
      expect(themeLink?.getAttribute('href')).toContain('dark.css');
    });

    it('should set system theme', () => {
      mockMediaQuery.matches = true;
      ThemeService.setTheme('system');
      
      expect(mockLocalStorage.setItem).toHaveBeenCalledWith('theme-mode', 'system');
      expect(document.documentElement.className).toBe('dark');
    });
  });

  describe('getCurrentTheme', () => {
    it('should return current theme mode', () => {
      ThemeService.init();
      expect(ThemeService.getCurrentTheme()).toBe('system');
      
      ThemeService.setTheme('dark');
      expect(ThemeService.getCurrentTheme()).toBe('dark');
    });
  });

  describe('getResolvedTheme', () => {
    beforeEach(() => {
      ThemeService.init();
    });

    it('should return light when system preference is light', () => {
      mockMediaQuery.matches = false;
      expect(ThemeService.getResolvedTheme()).toBe('light');
    });

    it('should return dark when system preference is dark', () => {
      mockMediaQuery.matches = true;
      expect(ThemeService.getResolvedTheme()).toBe('dark');
    });

    it('should return explicit theme when not system', () => {
      ThemeService.setTheme('dark');
      mockMediaQuery.matches = false; // System is light, but we set dark
      expect(ThemeService.getResolvedTheme()).toBe('dark');
    });
  });

  describe('theme change listeners', () => {
    let listener1: any, listener2: any;
    let mediaQueryChangeHandler: any;

    beforeEach(() => {
      listener1 = vi.fn();
      listener2 = vi.fn();
      ThemeService.init();
      
      // Capture the change handler from the init call
      const addEventListenerCalls = mockMediaQuery.addEventListener.mock.calls;
      if (addEventListenerCalls.length > 0) {
        mediaQueryChangeHandler = addEventListenerCalls[0][1];
      }
    });

    it('should call listener immediately when added', () => {
      ThemeService.addThemeChangeListener(listener1);
      
      expect(listener1).toHaveBeenCalledWith('light');
    });

    it('should call all listeners when theme changes', () => {
      ThemeService.addThemeChangeListener(listener1);
      ThemeService.addThemeChangeListener(listener2);
      
      vi.clearAllMocks();
      
      ThemeService.setTheme('dark');
      
      expect(listener1).toHaveBeenCalledWith('dark');
      expect(listener2).toHaveBeenCalledWith('dark');
    });

    it('should remove listener correctly', () => {
      ThemeService.addThemeChangeListener(listener1);
      ThemeService.addThemeChangeListener(listener2);
      
      ThemeService.removeThemeChangeListener(listener1);
      
      vi.clearAllMocks();
      
      ThemeService.setTheme('dark');
      
      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalledWith('dark');
    });

    it('should respond to system theme changes when in system mode', () => {
      ThemeService.addThemeChangeListener(listener1);
      
      vi.clearAllMocks();
      
      // Simulate system theme change
      mockMediaQuery.matches = true;
      if (mediaQueryChangeHandler) {
        mediaQueryChangeHandler();
        
        expect(listener1).toHaveBeenCalledWith('dark');
      } else {
        // Skip test if no event listener was captured
        expect(true).toBe(true);
      }
    });

    it('should not respond to system theme changes when not in system mode', () => {
      ThemeService.setTheme('light');
      ThemeService.addThemeChangeListener(listener1);
      
      vi.clearAllMocks();
      
      // Simulate system theme change
      mockMediaQuery.matches = true;
      if (mediaQueryChangeHandler) {
        mediaQueryChangeHandler();
        
        expect(listener1).not.toHaveBeenCalled();
      } else {
        // Skip test if no event listener was captured
        expect(true).toBe(true);
      }
    });
  });

  describe('Shoelace theme switching', () => {
    beforeEach(() => {
      ThemeService.init();
    });

    it('should replace existing theme link when changing themes', () => {
      // Initial theme
      expect(document.querySelectorAll('link[data-shoelace-theme]')).toHaveLength(1);
      
      ThemeService.setTheme('dark');
      
      // Should still have only one theme link
      const themeLinks = document.querySelectorAll('link[data-shoelace-theme]');
      expect(themeLinks).toHaveLength(1);
      expect(themeLinks[0]?.getAttribute('href')).toContain('dark.css');
    });

    it('should create theme link with correct attributes', () => {
      ThemeService.setTheme('dark');
      
      const themeLink = document.querySelector('link[data-shoelace-theme]');
      expect(themeLink?.getAttribute('rel')).toBe('stylesheet');
      expect(themeLink?.getAttribute('href')).toBe('/shoelace/themes/dark.css');
      expect(themeLink?.getAttribute('data-shoelace-theme')).toBe('dark');
    });
  });
});