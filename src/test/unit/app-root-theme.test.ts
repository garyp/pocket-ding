import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppRoot } from '../../components/app-root';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/theme-service');

// Mock browser APIs
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    hash: '',
    search: ''
  },
  writable: true
});

Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn()
  },
  writable: true
});

describe('AppRoot Theme Integration', () => {
  let element: AppRoot;
  let mockSettings: AppSettings;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock settings data
    mockSettings = {
      linkding_url: 'https://example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability',
      theme_mode: 'dark'
    };

    // Mock service responses
    vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
    vi.mocked(ThemeService.init).mockImplementation(() => {});
    vi.mocked(ThemeService.setThemeFromSettings).mockImplementation(() => {});

    // Create element
    element = new AppRoot();
  });

  afterEach(() => {
    element?.remove();
  });

  describe('theme initialization on app load', () => {
    it('should initialize ThemeService when app loads', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      expect(ThemeService.init).toHaveBeenCalled();
    });

    it('should apply theme from settings when app loads', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith('dark');
    });

    it('should not apply theme if no settings exist', async () => {
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      document.body.appendChild(element);
      await element.updateComplete;

      expect(ThemeService.init).toHaveBeenCalled();
      expect(ThemeService.setThemeFromSettings).not.toHaveBeenCalled();
    });

    it('should handle theme initialization errors gracefully', async () => {
      vi.mocked(DatabaseService.getSettings).mockRejectedValue(new Error('Database error'));

      document.body.appendChild(element);
      await element.updateComplete;

      // Should not throw error
      expect(element.isConnected).toBe(true);
    });
  });

  describe('theme updates when settings change', () => {
    beforeEach(async () => {
      document.body.appendChild(element);
      await element.updateComplete;
    });

    it('should apply new theme when settings are saved', async () => {
      const newSettings: AppSettings = {
        ...mockSettings,
        theme_mode: 'light'
      };

      const settingsEvent = new CustomEvent('settings-saved', {
        detail: { settings: newSettings }
      });

      element['handleSettingsSave'](settingsEvent);

      expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith('light');
    });

    it('should update internal settings when settings saved event occurs', async () => {
      const newSettings: AppSettings = {
        ...mockSettings,
        theme_mode: 'system'
      };

      const settingsEvent = new CustomEvent('settings-saved', {
        detail: { settings: newSettings }
      });

      element['handleSettingsSave'](settingsEvent);

      expect(element['settings']).toEqual(newSettings);
    });

    it('should handle settings save event without theme_mode', async () => {
      const settingsWithoutTheme = {
        ...mockSettings
      };
      delete (settingsWithoutTheme as any).theme_mode;

      const settingsEvent = new CustomEvent('settings-saved', {
        detail: { settings: settingsWithoutTheme }
      });

      // Should not throw error
      expect(() => element['handleSettingsSave'](settingsEvent)).not.toThrow();
    });
  });

  describe('theme persistence across navigation', () => {
    beforeEach(async () => {
      document.body.appendChild(element);
      await element.updateComplete;
    });

    it('should maintain theme settings when navigating between views', async () => {
      // Save settings with a specific theme
      const newSettings: AppSettings = {
        ...mockSettings,
        theme_mode: 'dark'
      };

      const settingsEvent = new CustomEvent('settings-saved', {
        detail: { settings: newSettings }
      });

      element['handleSettingsSave'](settingsEvent);

      // Navigate to bookmarks view
      expect(element['currentView']).toBe('bookmarks');
      expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith('dark');
    });

    it('should pass theme settings to settings panel', async () => {
      element['currentView'] = 'settings';
      await element.updateComplete;

      const settingsPanel = element.shadowRoot?.querySelector('settings-panel') as any;
      expect(settingsPanel?.settings).toEqual(mockSettings);
    });
  });

  describe('theme service integration', () => {
    it('should only initialize theme service once', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Trigger loadSettings again
      await element['loadSettings']();

      // init should be called but theme service handles duplicate calls
      expect(ThemeService.init).toHaveBeenCalledTimes(2);
    });

    it('should apply theme from most recent settings', async () => {
      document.body.appendChild(element);
      await element.updateComplete;

      // Change settings
      mockSettings.theme_mode = 'light';
      await element['loadSettings']();

      expect(ThemeService.setThemeFromSettings).toHaveBeenLastCalledWith('light');
    });
  });
});