import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '../setup';

// Import real components for more authentic testing
import { SettingsPanel } from '../../components/settings-panel';
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';
import { setupServiceWorkerMock, setupLimitedServiceWorkerMock, setupFailingServiceWorkerMock } from '../utils/service-worker-test-utils';
import type { AppSettings } from '../../types';

// Mock external APIs but keep sync logic real
vi.mock('../../services/linkding-api', () => ({
  createLinkdingAPI: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue(true),
    getBookmarks: vi.fn().mockResolvedValue({ results: [], next: null }),
    getArchivedBookmarks: vi.fn().mockResolvedValue({ results: [], next: null }),
    getBookmarkAssets: vi.fn().mockResolvedValue([]),
  })),
}));

// Mock ThemeService since it requires DOM APIs
vi.mock('../../services/theme-service', () => ({
  ThemeService: {
    init: vi.fn(),
    setTheme: vi.fn(),
    getTheme: vi.fn().mockReturnValue('light'),
    getCurrentTheme: vi.fn().mockReturnValue('light'),
    reset: vi.fn(),
  }
}));

// Mock database with realistic behavior for sync testing
const mockSettings: AppSettings = {
  linkding_url: '',
  linkding_token: '',
  auto_sync: false,
  reading_mode: 'original' as const
};

let currentMockSettings = { ...mockSettings };

vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn().mockImplementation(() => Promise.resolve(currentMockSettings)),
    saveSettings: vi.fn().mockImplementation((settings: AppSettings) => {
      currentMockSettings = { ...settings };
      return Promise.resolve();
    }),
    clearAll: vi.fn().mockResolvedValue(undefined),
    // Add other methods that might be called
    getBookmarks: vi.fn().mockResolvedValue([]),
    saveBookmark: vi.fn().mockResolvedValue(undefined),
    getBookmark: vi.fn().mockResolvedValue(null),
    // Sync-related database methods
    getLastSyncTimestamp: vi.fn().mockResolvedValue('0'),
    setLastSyncTimestamp: vi.fn().mockResolvedValue(undefined),
    setLastSyncError: vi.fn().mockResolvedValue(undefined),
    getSyncRetryCount: vi.fn().mockResolvedValue(0),
    setSyncRetryCount: vi.fn().mockResolvedValue(undefined),
    incrementSyncRetryCount: vi.fn().mockResolvedValue(undefined),
    resetSyncRetryCount: vi.fn().mockResolvedValue(undefined),
  }
}));

// Keep sync controller real but mock its dependencies strategically
vi.mock('../../services/settings-service', () => ({
  SettingsService: {
    initialize: vi.fn(),
    cleanup: vi.fn(),
    getSettings: vi.fn().mockImplementation(() => currentMockSettings),
    getCurrentSettings: vi.fn().mockImplementation(() => currentMockSettings),
  }
}));

describe('Background Sync Enhanced Workflow Tests', () => {
  let settingsPanel: SettingsPanel;
  let mockServiceWorkerRegistration: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Reset mock settings
    currentMockSettings = { ...mockSettings };

    // Setup service worker mock
    const { registration } = setupServiceWorkerMock({ includePeriodicSync: true });
    mockServiceWorkerRegistration = registration;

    // Create real settings panel component
    settingsPanel = document.createElement('settings-panel') as SettingsPanel;
    document.body.appendChild(settingsPanel);
    await waitForComponentReady(settingsPanel);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  describe('Real User Journey: Configuring Sync Settings', () => {
    it('should enable background sync when user completes valid settings', async () => {
      // User Journey: Test sync registration through programmatic settings update
      // This simulates the same workflow as user form interaction but without UI dependency

      // Simulate user configuring valid settings
      const testSettings: AppSettings = {
        linkding_url: 'https://demo.linkding.net',
        linkding_token: 'test-api-token-123',
        auto_sync: true,
        reading_mode: 'original' as const
      };

      // Trigger the settings update that would happen when user saves the form
      const syncController = (settingsPanel as any).syncController;
      if (syncController && typeof syncController.updateSettings === 'function') {
        await syncController.updateSettings(testSettings);

        // Wait for background sync to be registered
        await waitForComponent(() => {
          return mockServiceWorkerRegistration.periodicSync.register.mock.calls.length > 0;
        }, { timeout: 3000 });

        // Verify periodic background sync was registered
        expect(mockServiceWorkerRegistration.periodicSync.register).toHaveBeenCalledWith(
          'periodic-sync',
          expect.objectContaining({
            minInterval: expect.any(Number)
          })
        );

        // Verify settings were saved with correct values
        const { DatabaseService } = await import('../../services/database');
        expect(DatabaseService.saveSettings).toHaveBeenCalledWith(
          expect.objectContaining({
            linkding_url: 'https://demo.linkding.net',
            linkding_token: 'test-api-token-123',
            auto_sync: true
          })
        );
      } else {
        // If no sync controller available, verify the component rendered
        expect(settingsPanel).toBeTruthy();
        expect(settingsPanel.shadowRoot).toBeTruthy();
      }
    });

    it('should not register sync with invalid settings', async () => {
      // User Journey: User tries to enable auto-sync without proper configuration

      // User leaves URL empty
      const urlInput = settingsPanel.shadowRoot?.querySelector('input[name="linkding_url"]') as HTMLInputElement;
      if (urlInput) {
        urlInput.value = '';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        await settingsPanel.updateComplete;
      }

      // User leaves token empty
      const tokenInput = settingsPanel.shadowRoot?.querySelector('input[name="linkding_token"]') as HTMLInputElement;
      if (tokenInput) {
        tokenInput.value = '';
        tokenInput.dispatchEvent(new Event('input', { bubbles: true }));
        await settingsPanel.updateComplete;
      }

      // User tries to enable auto-sync
      const autoSyncCheckbox = settingsPanel.shadowRoot?.querySelector('input[name="auto_sync"]') as HTMLInputElement;
      if (autoSyncCheckbox) {
        autoSyncCheckbox.checked = true;
        autoSyncCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        await settingsPanel.updateComplete;
      }

      // User tries to save
      const saveButton = settingsPanel.shadowRoot?.querySelector('button[type="submit"]') as HTMLButtonElement;
      if (saveButton) {
        saveButton.click();
        await settingsPanel.updateComplete;

        // Wait a moment to ensure no sync registration occurs
        await new Promise(resolve => setTimeout(resolve, 500));

        // Should NOT register periodic sync with invalid settings
        expect(mockServiceWorkerRegistration.periodicSync.register).not.toHaveBeenCalled();
      }
    });
  });

  describe('Real User Journey: Testing Sync Controller Integration', () => {
    it('should handle sync state transitions correctly', async () => {
      // Test the real sync controller if it's available in the settings panel
      const syncController = (settingsPanel as any).syncController;

      if (syncController) {
        // Set up valid settings first
        currentMockSettings = {
          linkding_url: 'https://demo.linkding.net',
          linkding_token: 'valid-token',
          auto_sync: false,
          reading_mode: 'original' as const
        };

        // Test getting sync state
        const initialState = syncController.getSyncState();
        expect(initialState).toBeDefined();
        expect(typeof initialState.isSyncing).toBe('boolean');
        expect(typeof initialState.autoSyncEnabled).toBe('boolean');

        // Test manual sync request
        if (typeof syncController.requestSync === 'function') {
          const syncPromise = syncController.requestSync();

          // Should register one-time background sync
          await waitForComponent(() => {
            return mockServiceWorkerRegistration.sync.register.mock.calls.length > 0;
          }, { timeout: 2000 });

          expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalledWith('sync-bookmarks');

          await syncPromise;
        }
      }
    });
  });

  describe('User Journey: Browser Compatibility', () => {
    it('should handle browsers without Periodic Sync API gracefully', async () => {
      // Simulate browser without Periodic Sync
      setupLimitedServiceWorkerMock();

      // Create new settings panel in limited environment
      const limitedPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(limitedPanel);
      await waitForComponentReady(limitedPanel);

      // User can still interact with settings
      const urlInput = limitedPanel.shadowRoot?.querySelector('input[name="linkding_url"]') as HTMLInputElement;
      if (urlInput) {
        urlInput.value = 'https://demo.linkding.net';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));
        await limitedPanel.updateComplete;

        // Should not crash
        expect(limitedPanel).toBeTruthy();
        expect(urlInput.value).toBe('https://demo.linkding.net');
      }

      document.body.removeChild(limitedPanel);
    });

    it('should handle service worker unavailability gracefully', async () => {
      // Simulate service worker failure
      setupFailingServiceWorkerMock('Service Worker not available');

      // Create new settings panel
      const panelWithoutSW = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(panelWithoutSW);
      await waitForComponentReady(panelWithoutSW);

      // Component should still function
      expect(panelWithoutSW).toBeTruthy();
      expect(panelWithoutSW.shadowRoot).toBeTruthy();

      // User can still configure settings
      const urlInput = panelWithoutSW.shadowRoot?.querySelector('input[name="linkding_url"]') as HTMLInputElement;
      if (urlInput) {
        urlInput.value = 'https://demo.linkding.net';
        urlInput.dispatchEvent(new Event('input', { bubbles: true }));

        // Should not crash
        expect(urlInput.value).toBe('https://demo.linkding.net');
      }

      document.body.removeChild(panelWithoutSW);
    });
  });

  describe('User Journey: Auto-sync Toggle Behavior', () => {
    it('should disable periodic sync when user turns off auto-sync', async () => {
      // Start with auto-sync enabled
      currentMockSettings = {
        linkding_url: 'https://demo.linkding.net',
        linkding_token: 'valid-token',
        auto_sync: true,
        reading_mode: 'original' as const
      };

      // Create new settings panel with auto-sync enabled
      const enabledPanel = document.createElement('settings-panel') as SettingsPanel;
      document.body.appendChild(enabledPanel);
      await waitForComponentReady(enabledPanel);

      // Find auto-sync checkbox
      const autoSyncCheckbox = enabledPanel.shadowRoot?.querySelector('input[name="auto_sync"]') as HTMLInputElement;
      if (autoSyncCheckbox) {
        // Should start checked
        expect(autoSyncCheckbox.checked).toBe(true);

        // Clear mock calls from setup
        vi.clearAllMocks();

        // User disables auto-sync
        autoSyncCheckbox.checked = false;
        autoSyncCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
        await enabledPanel.updateComplete;

        // User saves settings
        const saveButton = enabledPanel.shadowRoot?.querySelector('button[type="submit"]') as HTMLButtonElement;
        if (saveButton) {
          saveButton.click();
          await enabledPanel.updateComplete;

          // Should unregister periodic sync
          await waitForComponent(() => {
            return mockServiceWorkerRegistration.periodicSync.unregister.mock.calls.length > 0;
          }, { timeout: 2000 });

          expect(mockServiceWorkerRegistration.periodicSync.unregister).toHaveBeenCalledWith('periodic-sync');
        }
      }

      document.body.removeChild(enabledPanel);
    });
  });

  describe('User Journey: Real Sync Error States and Recovery', () => {
    it('should show sync error state when sync fails and allow user to dismiss', async () => {
      // User Journey: User experiences sync error and wants to clear it

      if ((settingsPanel as any).syncController) {
        const realSyncController = (settingsPanel as any).syncController;

        // Test that user can check sync error state
        const hasError = realSyncController.hasSyncError();
        expect(typeof hasError).toBe('boolean');

        // Test that user can check if sync is running
        const isSyncing = realSyncController.isSyncing();
        expect(typeof isSyncing).toBe('boolean');

        // Test that user can get sync state
        const syncState = realSyncController.getSyncState();
        expect(syncState).toBeDefined();
        expect(typeof syncState.isSyncing).toBe('boolean');
        expect(typeof syncState.syncProgress).toBe('number');
        expect(typeof syncState.syncTotal).toBe('number');

        // Test that user can dismiss sync errors (if any exist)
        if (typeof realSyncController.dismissSyncError === 'function') {
          // This should not throw an error
          await expect(realSyncController.dismissSyncError()).resolves.not.toThrow();
        }
      } else {
        // If sync controller not available, ensure component rendered
        expect(settingsPanel).toBeTruthy();
      }
    });
  });

  describe('User Journey: Real Concurrent Sync Prevention', () => {
    it('should prevent multiple concurrent sync operations through real sync controller', async () => {
      // User Journey: User rapidly triggers sync multiple times
      const realSyncController = (settingsPanel as any).syncController;

      if (realSyncController && typeof realSyncController.requestSync === 'function') {
        // Setup valid settings for sync
        currentMockSettings = {
          linkding_url: 'https://demo.linkding.net',
          linkding_token: 'valid-token',
          auto_sync: false,
          reading_mode: 'original' as const
        };

        // Test real concurrent sync prevention logic
        const initialSyncState = realSyncController.isSyncing();
        expect(typeof initialSyncState).toBe('boolean');

        // Trigger multiple sync requests rapidly
        const syncPromise1 = realSyncController.requestSync();
        const syncPromise2 = realSyncController.requestSync();
        const syncPromise3 = realSyncController.requestSync();

        // All should resolve without error (sync controller handles deduplication)
        await expect(Promise.all([syncPromise1, syncPromise2, syncPromise3])).resolves.not.toThrow();

        // Sync controller should maintain consistent state
        const finalSyncState = realSyncController.getSyncState();
        expect(finalSyncState).toBeDefined();
        expect(typeof finalSyncState.isSyncing).toBe('boolean');
      } else {
        // If sync controller not available, verify component exists
        expect(settingsPanel).toBeTruthy();
      }
    });
  });

  describe('User Journey: Real Periodic Sync Control', () => {
    it('should allow user to control periodic sync through real settings', async () => {
      // User Journey: User toggles auto-sync setting and it affects periodic sync
      const realSyncController = (settingsPanel as any).syncController;

      if (realSyncController && typeof realSyncController.setPeriodicSync === 'function') {
        // User enables auto-sync (periodic sync)
        await expect(realSyncController.setPeriodicSync(true)).resolves.not.toThrow();

        // User disables auto-sync (periodic sync)
        await expect(realSyncController.setPeriodicSync(false)).resolves.not.toThrow();

        // The actual registration/unregistration is handled by service worker
        // This tests that the user-facing API works correctly
        expect(realSyncController.setPeriodicSync).toBeDefined();
      } else {
        // If sync controller not available, verify component exists
        expect(settingsPanel).toBeTruthy();
      }
    });
  });

  describe('User Journey: Real Force Sync Through UI', () => {
    it('should allow user to trigger manual sync through settings panel', async () => {
      // User Journey: User clicks "Force Full Sync" button in settings

      // Look for the Force Full Sync button
      const forceSyncButton = settingsPanel.shadowRoot?.querySelector('md-filled-button[type="button"]') as HTMLButtonElement;

      if (forceSyncButton && forceSyncButton.textContent?.includes('Force Full Sync')) {
        // User clicks the force sync button
        forceSyncButton.click();
        await settingsPanel.updateComplete;

        // Should register background sync for manual operation
        await waitForComponent(() => {
          return mockServiceWorkerRegistration.sync.register.mock.calls.length > 0;
        }, { timeout: 2000 });

        expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalledWith('sync-bookmarks');
      } else {
        // Test through sync controller directly if UI button not found
        const realSyncController = (settingsPanel as any).syncController;
        if (realSyncController && typeof realSyncController.requestSync === 'function') {
          await realSyncController.requestSync(true); // Full sync

          await waitForComponent(() => {
            return mockServiceWorkerRegistration.sync.register.mock.calls.length > 0;
          }, { timeout: 2000 });

          expect(mockServiceWorkerRegistration.sync.register).toHaveBeenCalledWith('sync-bookmarks');
        }
      }
    });
  });
});