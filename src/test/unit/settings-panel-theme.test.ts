import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { liveQuery } from 'dexie';
import { SettingsPanel } from '../../components/settings-panel';
import { DatabaseService } from '../../services/database';
import { ThemeService } from '../../services/theme-service';
import type { AppSettings } from '../../types';

// Mock services and liveQuery
vi.mock('dexie', () => ({
  liveQuery: vi.fn()
}));
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    saveSettings: vi.fn()
  }
}));
vi.mock('../../services/theme-service');

describe('SettingsPanel Theme', () => {
  let element: SettingsPanel;
  let mockSettings: AppSettings;
  let mockSubscription: { unsubscribe: ReturnType<typeof vi.fn> };
  let mockObservable: { subscribe: ReturnType<typeof vi.fn> };

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

    // Create mock subscription
    mockSubscription = { unsubscribe: vi.fn() };
    
    // Create mock observable
    mockObservable = {
      subscribe: vi.fn().mockImplementation((observer) => {
        // Immediately call the next callback with the mock settings
        setTimeout(() => observer.next(mockSettings), 0);
        return mockSubscription;
      })
    };

    // Mock liveQuery to return our mock observable
    vi.mocked(liveQuery).mockReturnValue(mockObservable as any);

    // Mock service responses
    vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
    vi.mocked(DatabaseService.saveSettings).mockResolvedValue();

    // Create element
    element = new SettingsPanel();
    document.body.appendChild(element);
    await element.updateComplete;
    
    // Wait a bit for the reactive query to initialize
    await new Promise(resolve => setTimeout(resolve, 10));
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
      // Remove existing element
      element.remove();
      
      const settingsWithoutTheme = {
        ...mockSettings,
        theme_mode: undefined as any
      };
      
      // Update the database mock to return settings without theme_mode
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(settingsWithoutTheme);
      
      // Update the observable to return settings without theme_mode
      mockObservable.subscribe.mockImplementation((observer) => {
        setTimeout(() => observer.next(settingsWithoutTheme), 0);
        return mockSubscription;
      });
      
      // Create new element which will use the updated mock
      element = new SettingsPanel();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive query to initialize
      await new Promise(resolve => setTimeout(resolve, 10));
      await element.updateComplete;
      
      expect(element['formData'].theme_mode).toBe('system');
    });

    it('should preserve theme setting from existing settings', async () => {
      // Remove existing element
      element.remove();
      
      const darkThemeSettings: AppSettings = {
        ...mockSettings,
        theme_mode: 'dark' as const
      };
      
      // Update the database mock to return settings with dark theme
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(darkThemeSettings);
      
      // Update the observable to return settings with dark theme
      mockObservable.subscribe.mockImplementation((observer) => {
        setTimeout(() => observer.next(darkThemeSettings as AppSettings), 0);
        return mockSubscription;
      });
      
      // Create new element which will use the updated mock
      element = new SettingsPanel();
      document.body.appendChild(element);
      await element.updateComplete;
      
      // Wait for reactive query to initialize
      await new Promise(resolve => setTimeout(resolve, 10));
      await element.updateComplete;
      
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
      // Simulate theme change to dark by dispatching change event
      const themeSelect = element.shadowRoot?.querySelector('#theme-mode') as any;
      expect(themeSelect).toBeTruthy();
      
      // Create a custom event that mimics Material Design select behavior
      const changeEvent = new CustomEvent('change', { 
        detail: { value: 'dark' },
        bubbles: true 
      });
      Object.defineProperty(changeEvent, 'target', {
        writable: false,
        value: { value: 'dark' }
      });
      
      themeSelect.dispatchEvent(changeEvent);
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

      // Trigger save by clicking the "Save Settings" button
      const saveButton = element.shadowRoot?.querySelector('md-filled-button') as any;
      expect(saveButton).toBeTruthy();
      
      saveButton.click();
      await element.updateComplete;
      
      // Wait for async save operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

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

      // Trigger save by clicking the "Save Settings" button
      const saveButton = element.shadowRoot?.querySelector('md-filled-button') as any;
      expect(saveButton).toBeTruthy();
      
      saveButton.click();
      await element.updateComplete;
      
      // Wait for async save operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith('light');
    });

    it('should include theme in settings-saved event', async () => {
      const eventSpy = vi.fn();
      element.addEventListener('settings-saved', eventSpy);

      element['formData'] = {
        ...element['formData'],
        theme_mode: 'dark'
      };

      // Trigger save by clicking the "Save Settings" button
      const saveButton = element.shadowRoot?.querySelector('md-filled-button') as any;
      expect(saveButton).toBeTruthy();
      
      saveButton.click();
      await element.updateComplete;
      
      // Wait for async save operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

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
        // Simulate theme change by dispatching change event
        const themeSelect = element.shadowRoot?.querySelector('#theme-mode') as any;
        expect(themeSelect).toBeTruthy();
        
        const changeEvent = new CustomEvent('change', { 
          detail: { value: themeMode },
          bubbles: true 
        });
        Object.defineProperty(changeEvent, 'target', {
          writable: false,
          value: { value: themeMode }
        });
        
        themeSelect.dispatchEvent(changeEvent);
        await element.updateComplete;
        
        expect(element['formData'].theme_mode).toBe(themeMode);

        // Trigger save by clicking the "Save Settings" button
        const saveButton = element.shadowRoot?.querySelector('md-filled-button') as any;
        expect(saveButton).toBeTruthy();
        
        saveButton.click();
        await element.updateComplete;
        
        // Wait for async save operation to complete
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(ThemeService.setThemeFromSettings).toHaveBeenCalledWith(themeMode);
      }
    });

    it('should save the exact theme value provided', async () => {
      element['formData'] = {
        ...element['formData'],
        theme_mode: 'dark' as any
      };

      // Trigger save by clicking the "Save Settings" button
      const saveButton = element.shadowRoot?.querySelector('md-filled-button') as any;
      expect(saveButton).toBeTruthy();
      
      saveButton.click();
      await element.updateComplete;
      
      // Wait for async save operation to complete
      await new Promise(resolve => setTimeout(resolve, 0));

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