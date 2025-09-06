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
  },
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
    // Clean setup
    vi.clearAllMocks();
    
    // Setup default mock behaviors
    (SyncService.fullSync as any).mockResolvedValue(undefined);
    (DatabaseService.saveSettings as any).mockResolvedValue(undefined);
    (DatabaseService.getSettings as any).mockResolvedValue(mockSettings);

    // Create and append element properly
    settingsPanel = document.createElement('settings-panel');
    document.body.appendChild(settingsPanel);
    await settingsPanel.updateComplete;
  });

  afterEach(() => {
    // Safe cleanup
    if (settingsPanel && settingsPanel.parentNode) {
      settingsPanel.parentNode.removeChild(settingsPanel);
    }
    settingsPanel = null;
    vi.restoreAllMocks();
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
      // Settings are already mocked in beforeEach
      await settingsPanel.updateComplete;
      
      const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
      const fullSyncButton = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('Force Full Sync')
      ) as any;
      
      expect(fullSyncButton?.disabled).toBeFalsy();
    });

    it('should be disabled when settings are not configured', async () => {
      // Mock empty settings for this test
      (DatabaseService.getSettings as any).mockResolvedValue(null);
      // Force reactive query to re-run by creating new element
      if (settingsPanel && settingsPanel.parentNode) {
        settingsPanel.parentNode.removeChild(settingsPanel);
      }
      settingsPanel = document.createElement('settings-panel');
      document.body.appendChild(settingsPanel);
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
        // Settings are already mocked in beforeEach
        await settingsPanel.updateComplete;
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        fullSyncButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
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
        // Settings are already mocked in beforeEach
        await settingsPanel.updateComplete;
        
        // Setup progress callback mock
        (SyncService.fullSync as any).mockImplementation((_settings: any, _callback: any) => {
          return Promise.resolve();
        });
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        fullSyncButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
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
        // Settings are already mocked in beforeEach
        await settingsPanel.updateComplete;
        
        (SyncService.fullSync as any).mockImplementation((_settings: any, callback: any) => {
          // Simulate progress updates
          setTimeout(() => {
            callback(1, 10);
            setTimeout(() => callback(5, 10), 10);
            setTimeout(() => callback(10, 10), 20);
          }, 0);
          return new Promise(resolve => setTimeout(resolve, 50));
        });
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        
        const syncPromise = new Promise(resolve => {
          // Mock the sync to resolve after a delay
          setTimeout(resolve, 60);
        });
        
        fullSyncButton.click();
        
        // Wait a bit for progress updates
        await new Promise(resolve => setTimeout(resolve, 30));
        
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
        // Settings are already mocked in beforeEach
        await settingsPanel.updateComplete;
        
        (SyncService.fullSync as any).mockRejectedValue(new Error('Sync failed'));
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        fullSyncButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
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
        // Settings are already mocked in beforeEach
        await settingsPanel.updateComplete;
        
        let eventEmitted = false;
        settingsPanel.addEventListener('sync-completed', () => {
          eventEmitted = true;
        });
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        fullSyncButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
        
        expect(eventEmitted).toBe(true);
        expect(settingsPanel.testStatus).toBe('success');
        expect(settingsPanel.testMessage).toBe('Full sync completed successfully!');
      } finally {
        window.confirm = originalConfirm;
      }
    });

    it('should show error when settings are not saved', async () => {
      // Mock empty settings for this test
      (DatabaseService.getSettings as any).mockResolvedValue(null);
      // Force reactive query to re-run by creating new element
      if (settingsPanel && settingsPanel.parentNode) {
        settingsPanel.parentNode.removeChild(settingsPanel);
      }
      settingsPanel = document.createElement('settings-panel');
      document.body.appendChild(settingsPanel);
      await settingsPanel.updateComplete;
      
      // Trigger full sync by clicking the button
      const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
      const fullSyncButton = Array.from(buttons).find((btn: any) => 
        btn.textContent?.includes('Force Full Sync')
      ) as HTMLElement;
      expect(fullSyncButton).toBeTruthy();
      fullSyncButton.click();
      await new Promise(resolve => setTimeout(resolve, 0));
      
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
        // Settings are already mocked in beforeEach
        
        (SyncService.fullSync as any).mockImplementation((_settings: any, callback: any) => {
          callback(5, 10); // Set progress
          return new Promise(resolve => setTimeout(resolve, 100));
        });
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        
        const syncPromise = new Promise(resolve => {
          // Mock the sync to resolve after showing progress
          setTimeout(resolve, 60);
        });
        
        fullSyncButton.click();
        
        // Wait for progress to be set
        await new Promise(resolve => setTimeout(resolve, 10));
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
        // Settings are already mocked in beforeEach
        
        // Trigger full sync by clicking the button
        const buttons = settingsPanel.shadowRoot.querySelectorAll('md-outlined-button, md-filled-button, md-text-button');
        const fullSyncButton = Array.from(buttons).find((btn: any) => 
          btn.textContent?.includes('Force Full Sync')
        ) as HTMLElement;
        expect(fullSyncButton).toBeTruthy();
        fullSyncButton.click();
        await new Promise(resolve => setTimeout(resolve, 0));
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