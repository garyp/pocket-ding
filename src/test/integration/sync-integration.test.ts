import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AppSettings } from '../../types';

// Setup DOM environment
// Material Web Components doesn't require base path setup

// Mock the SyncService
vi.mock('../../services/sync-service', () => ({
  SyncService: {
    syncBookmarks: vi.fn(),
    fullSync: vi.fn(),
    backgroundSync: vi.fn(),
  },
}));

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    saveSettings: vi.fn(),
    getSettings: vi.fn(),
    clearAll: vi.fn(),
    createSettingsQuery: vi.fn(),
    createPaginationDataQuery: vi.fn(),
    createBookmarkQuery: vi.fn(),
  },
}));

// Mock ReactiveQueryController to prevent hanging
vi.mock('../../controllers/reactive-query-controller', () => ({
  ReactiveQueryController: vi.fn().mockImplementation((_host, _options) => ({
    hostConnected: vi.fn(),
    hostDisconnected: vi.fn(),
    value: {
      linkding_url: 'https://linkding.example.com',
      linkding_token: 'test-token',
      sync_interval: 60,
      auto_sync: true,
      reading_mode: 'readability'
    },
    loading: false,
    hasError: false,
    errorMessage: null,
    render: vi.fn((callbacks) => {
      if (callbacks.complete) return callbacks.complete({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'test-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      });
      return undefined;
    }),
    setEnabled: vi.fn(),
    updateQuery: vi.fn(),
  }))
}));

// Mock LinkdingAPI
vi.mock('../../services/linkding-api', () => ({
  createLinkdingAPI: vi.fn(() => ({
    testConnection: vi.fn().mockResolvedValue(true)
  })),
}));

// Import after mocking
import { SyncService } from '../../services/sync-service';
import { DatabaseService } from '../../services/database';
import '../../components/settings-panel';

describe('Settings Panel - Sync Integration', () => {
  let settingsPanel: any;
  
  const mockSettings: AppSettings = {
    linkding_url: 'https://linkding.example.com',
    linkding_token: 'test-token',
    sync_interval: 60,
    auto_sync: true,
    reading_mode: 'readability',
  };

  beforeEach(async () => {
    // Use fake timers for deterministic testing
    vi.useFakeTimers();
    
    vi.clearAllMocks();
    
    // Setup default mock behaviors
    (SyncService.fullSync as any).mockResolvedValue(undefined);
    (DatabaseService.saveSettings as any).mockResolvedValue(undefined);
    (DatabaseService.getSettings as any).mockResolvedValue(mockSettings);
    (DatabaseService.createSettingsQuery as any).mockReturnValue(() => Promise.resolve(mockSettings));

    // Create settings panel element
    settingsPanel = document.createElement('settings-panel');
    settingsPanel.settings = mockSettings;
    document.body.appendChild(settingsPanel);
    
    // Wait for component to initialize using fake timers
    await settingsPanel.updateComplete;
  });

  afterEach(() => {
    document.body.removeChild(settingsPanel);
    // Always restore real timers
    vi.useRealTimers();
  });

  describe('Full Sync Button', () => {
    it('should render full sync button', async () => {
      // Button should exist (using a more flexible approach)
      const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
      const fullSyncButton = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('Force Full Sync') || btn.textContent?.includes('Syncing')
      );
      
      expect(fullSyncButton).toBeTruthy();
    });

    it('should be enabled when settings are configured', async () => {
      settingsPanel.settings = mockSettings;
      await settingsPanel.updateComplete;
      
      const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
      const fullSyncButton = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('Force Full Sync')
      ) as any;
      
      expect(fullSyncButton?.disabled).toBeFalsy();
    });

    it('should be disabled when settings are not configured', async () => {
      settingsPanel.settings = null;
      await settingsPanel.updateComplete;
      
      const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
      const fullSyncButton = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('Force Full Sync')
      ) as any;
      
      expect(fullSyncButton?.disabled).toBeTruthy();
    });

    it('should show confirmation dialog when clicked', async () => {
      // Mock window.confirm
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(false);
      
      try {
        settingsPanel.settings = mockSettings;
        await settingsPanel.updateComplete;
        
        // Trigger full sync
        await settingsPanel.handleFullSync();
        
        expect(window.confirm).toHaveBeenCalledWith(
          'This will perform a complete resync of all bookmarks. Continue?'
        );
        
        // Should not call SyncService since user cancelled
        expect(SyncService.fullSync).not.toHaveBeenCalled();
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should perform full sync when confirmed', async () => {
      // Mock window.confirm to return true
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        await settingsPanel.updateComplete;
        
        // Setup progress callback mock
        (SyncService.fullSync as any).mockImplementation((_settings: any, _callback: any) => {
          return Promise.resolve();
        });
        
        // Trigger full sync
        await settingsPanel.handleFullSync();
        
        expect(SyncService.fullSync).toHaveBeenCalledWith(
          mockSettings,
          expect.any(Function)
        );
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should update progress during sync', async () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        await settingsPanel.updateComplete;
        
        (SyncService.fullSync as any).mockImplementation((_settings: any, callback: any) => {
          // Simulate progress updates with fake timers
          callback(1, 10);
          vi.advanceTimersByTime(10);
          callback(5, 10);
          vi.advanceTimersByTime(10);
          callback(10, 10);
          return Promise.resolve();
        });
        
        const syncPromise = settingsPanel.handleFullSync();
        
        // Advance fake timers for progress updates
        vi.advanceTimersByTime(30);
        await settingsPanel.updateComplete;
        
        expect(settingsPanel.isFullSyncing).toBe(true);
        expect(settingsPanel.fullSyncTotal).toBe(10);
        expect(settingsPanel.fullSyncProgress).toBeGreaterThan(0);
        
        await syncPromise;
        
        expect(settingsPanel.isFullSyncing).toBe(false);
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should handle sync errors gracefully', async () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        await settingsPanel.updateComplete;
        
        (SyncService.fullSync as any).mockRejectedValue(new Error('Sync failed'));
        
        await settingsPanel.handleFullSync();
        
        expect(settingsPanel.testStatus).toBe('error');
        expect(settingsPanel.testMessage).toContain('Full sync failed');
        expect(settingsPanel.isFullSyncing).toBe(false);
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should emit sync-completed event on successful sync', async () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        await settingsPanel.updateComplete;
        
        let eventEmitted = false;
        settingsPanel.addEventListener('sync-completed', () => {
          eventEmitted = true;
        });
        
        await settingsPanel.handleFullSync();
        
        expect(eventEmitted).toBe(true);
        expect(settingsPanel.testStatus).toBe('success');
        expect(settingsPanel.testMessage).toBe('Full sync completed successfully!');
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should show error when settings are not saved', async () => {
      settingsPanel.settings = null;
      await settingsPanel.updateComplete;
      
      await settingsPanel.handleFullSync();
      
      expect(settingsPanel.testStatus).toBe('error');
      expect(settingsPanel.testMessage).toBe('Please save your Linkding settings first.');
      expect(SyncService.fullSync).not.toHaveBeenCalled();
    });
  });

  describe('Progress Display', () => {
    it('should show progress bar during sync', async () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        
        (SyncService.fullSync as any).mockImplementation((_settings: any, callback: any) => {
          callback(5, 10); // Set progress
          return Promise.resolve();
        });
        
        const syncPromise = settingsPanel.handleFullSync();
        
        // Wait for progress to be set using fake timers
        vi.advanceTimersByTime(10);
        await settingsPanel.updateComplete;
        
        const progressBar = settingsPanel.shadowRoot.querySelector('md-linear-progress');
        expect(progressBar).toBeTruthy();
        
        const progressText = settingsPanel.shadowRoot.querySelector('.sync-progress-text');
        expect(progressText?.textContent).toContain('5 / 10');
        
        await syncPromise;
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should hide progress bar when sync completes', async () => {
      const originalConfirm = window.confirm;
      window.confirm = vi.fn().mockReturnValue(true);
      
      try {
        settingsPanel.settings = mockSettings;
        
        await settingsPanel.handleFullSync();
        await settingsPanel.updateComplete;
        
        const progressBar = settingsPanel.shadowRoot.querySelector('md-linear-progress');
        expect(progressBar).toBeFalsy();
        
        expect(settingsPanel.isFullSyncing).toBe(false);
      } finally {
        window.confirm = originalConfirm;
      }
    });
  });
});