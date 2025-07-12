import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SettingsPanel } from '../../components/settings-panel';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/theme-service');

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

    // Mock service responses
    vi.mocked(DatabaseService.saveSettings).mockResolvedValue();

    // Create element
    element = new SettingsPanel();
    element.settings = mockSettings;
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
      element.settings = {
        ...mockSettings,
        theme_mode: undefined as any
      };
      element['initializeForm']();
      
      expect(element['formData'].theme_mode).toBe('system');
    });

    it('should preserve theme setting from existing settings', async () => {
      element.settings = {
        ...mockSettings,
        theme_mode: 'dark'
      };
      element['initializeForm']();
      
      expect(element['formData'].theme_mode).toBe('dark');
    });
  });

  describe('theme selection UI', () => {
    it('should render theme select with correct options', async () => {
      const themeSelect = element.shadowRoot?.querySelector('#theme-mode') as any;
      expect(themeSelect).toBeTruthy();
      expect(themeSelect?.value).toBe('system');

      const options = element.shadowRoot?.querySelectorAll('#theme-mode sl-option');
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