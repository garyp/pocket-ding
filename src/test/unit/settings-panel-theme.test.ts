import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsPanel } from '../../components/settings-panel';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/theme-service');
vi.mock('../../controllers/reactive-query-controller');

describe('SettingsPanel Theme', () => {
  let element: SettingsPanel;
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
      theme_mode: 'system'
    };

    // Mock ReactiveQueryController to return mock settings
    const { ReactiveQueryController } = await import('../../controllers/reactive-query-controller');
    vi.mocked(ReactiveQueryController).mockImplementation((_host: any, _options: any) => ({
      value: mockSettings,
      loading: false,
      hasError: false,
      errorMessage: null,
      hostConnected: vi.fn(),
      hostDisconnected: vi.fn(),
      setEnabled: vi.fn(),
      updateQuery: vi.fn(),
      render: vi.fn()
    }) as any);

    // Mock service responses
    vi.mocked(DatabaseService.saveSettings).mockResolvedValue();

    // Create element
    element = new SettingsPanel();
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  describe('theme setting initialization', () => {
    it('should initialize theme mode from settings', async () => {
      expect(element['formData'].theme_mode).toBe('system');
    });

    it('should default to system theme when not set', async () => {
      // Update the mock to return settings without theme_mode
      const settingsWithoutTheme = {
        ...mockSettings,
        theme_mode: undefined as any
      };
      
      // Update the mock controller
      (element as any).settingsQuery = {
        value: settingsWithoutTheme,
        loading: false,
        hasError: false,
        errorMessage: null
      };
      
      element['initializeForm']();
      
      expect(element['formData'].theme_mode).toBe('system');
    });

    it('should preserve theme setting from existing settings', async () => {
      // Update the mock to return settings with dark theme
      const settingsWithDarkTheme = {
        ...mockSettings,
        theme_mode: 'dark'
      };
      
      // Update the mock controller
      (element as any).settingsQuery = {
        value: settingsWithDarkTheme,
        loading: false,
        hasError: false,
        errorMessage: null
      };
      
      element['initializeForm']();
      
      expect(element['formData'].theme_mode).toBe('dark');
    });
  });

  describe('theme selection UI', () => {
    it('should render theme select with correct options', async () => {
      // Wait for the component to fully render
      await element.updateComplete;
      
      const themeSelect = element.shadowRoot?.querySelector('#theme-mode') as any;
      expect(themeSelect).toBeTruthy();
      
      // The form data should have the correct theme mode value
      expect(element['formData'].theme_mode).toBe('system');

      const options = element.shadowRoot?.querySelectorAll('#theme-mode md-select-option');
      expect(options?.length).toBe(3);
      
      const optionValues = Array.from(options || []).map(opt => opt.getAttribute('value'));
      expect(optionValues).toEqual(['system', 'light', 'dark']);
    });

    it('should update form data when theme selection changes', async () => {
      // Simulate theme change to dark
      element['handleInputChange']('theme_mode', 'dark');
      await element.updateComplete;
      
      expect(element['formData'].theme_mode).toBe('dark');
    });
  });

  describe('theme persistence', () => {
    it('should save theme setting when form is saved', async () => {
      element['formData'] = {
        ...element['formData'],
        theme_mode: 'dark'
      };

      await element['handleSave']();

      expect(DatabaseService.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_mode: 'dark'
        })
      );
    });

    it('should apply theme immediately when settings are saved', async () => {
      element['formData'] = {
        ...element['formData'],
        theme_mode: 'light'
      };

      await element['handleSave']();

      expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith('light');
    });

    it('should include theme in settings-saved event', async () => {
      const eventSpy = vi.fn();
      element.addEventListener('settings-saved', eventSpy);

      element['formData'] = {
        ...element['formData'],
        theme_mode: 'dark'
      };

      await element['handleSave']();

      expect(eventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: {
            settings: expect.objectContaining({
              theme_mode: 'dark'
            })
          }
        })
      );
    });
  });

  describe('theme option values', () => {
    it('should handle all theme mode options correctly', async () => {
      const testCases = ['system', 'light', 'dark'] as const;

      for (const themeMode of testCases) {
        element['handleInputChange']('theme_mode', themeMode);
        expect(element['formData'].theme_mode).toBe(themeMode);

        await element['handleSave']();
        expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith(themeMode);
      }
    });

    it('should save the exact theme value provided', async () => {
      element['formData'] = {
        ...element['formData'],
        theme_mode: 'dark' as any
      };

      await element['handleSave']();

      expect(DatabaseService.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({
          theme_mode: 'dark'
        })
      );
    });
  });

  describe('UI rendering', () => {
    it('should show theme setting in Reading Preferences section', async () => {
      const readingSection = Array.from(element.shadowRoot?.querySelectorAll('.form-section') || [])
        .find(section => section.querySelector('h3')?.textContent?.includes('Reading Preferences'));
      
      expect(readingSection).toBeTruthy();
      
      const themeGroup = readingSection?.querySelector('.form-group:has(#theme-mode)');
      expect(themeGroup).toBeTruthy();
      
      const themeLabel = themeGroup?.querySelector('label');
      expect(themeLabel?.textContent).toBe('Theme');
    });

    it('should render theme select with proper accessibility', async () => {
      const themeSelect = element.shadowRoot?.querySelector('#theme-mode');
      const themeLabel = element.shadowRoot?.querySelector('label[for="theme-mode"]');
      
      expect(themeSelect).toBeTruthy();
      expect(themeLabel).toBeTruthy();
      expect(themeLabel?.getAttribute('for')).toBe('theme-mode');
    });
  });
});