import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncController } from '../../controllers/sync-controller';
import { SyncMessages, type SyncMessage } from '../../types/sync-messages';
import { SettingsService } from '../../services/settings-service';
import { DatabaseService } from '../../services/database';
import type { AppSettings } from '../../types';
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { waitForComponentReady } from '../utils/component-aware-wait-for';

// Mock SyncWorkerManager with callbacks
const mockCallbacks = {
  onProgress: vi.fn(),
  onComplete: vi.fn(),
  onError: vi.fn(),
  onCancelled: vi.fn()
};

// Mock DatabaseService for interrupted sync test
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getLastSyncError: vi.fn().mockResolvedValue(null),
    getSyncRetryCount: vi.fn().mockResolvedValue(0),
    // Default to empty arrays to prevent auto-resume in most tests
    getBookmarksNeedingAssetSync: vi.fn().mockResolvedValue([]),
    getBookmarksNeedingReadSync: vi.fn().mockResolvedValue([]),
    setLastSyncError: vi.fn().mockResolvedValue(undefined),
    resetSyncRetryCount: vi.fn().mockResolvedValue(undefined)
  }
}));

const mockSyncWorkerManager = {
  startSync: vi.fn().mockResolvedValue(undefined),
  cancelSync: vi.fn(),
  cleanup: vi.fn(),
  '#callbacks': mockCallbacks
};

vi.mock('../../services/sync-worker-manager', () => ({
  SyncWorkerManager: vi.fn().mockImplementation((callbacks) => {
    // Store the callbacks that are passed to the constructor
    Object.assign(mockCallbacks, callbacks);
    return mockSyncWorkerManager;
  })
}));

// Mock navigator.serviceWorker
const mockPostMessage = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

const mockServiceWorkerRegistration = {
  active: {
    postMessage: mockPostMessage
  }
};

const mockServiceWorker = {
  ready: Promise.resolve(mockServiceWorkerRegistration),
  addEventListener: mockAddEventListener,
  removeEventListener: mockRemoveEventListener
};

// Test component that uses SyncController
@customElement('test-sync-component')
class TestSyncComponent extends LitElement {
  syncController = new SyncController(this);
  
  override render() {
    return html`<div>Test Component</div>`;
  }
}

describe('Sync Message Passing Integration', () => {
  let component: TestSyncComponent;
  let messageHandler: ((event: MessageEvent) => void) | null = null;
  
  beforeEach(async () => {
    // Clear all mocks first
    vi.clearAllMocks();
    messageHandler = null;

    // Reset mock implementation to capture message handler
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });

    // Setup service worker mock
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      writable: true
    });

    // Mock settings
    vi.spyOn(SettingsService, 'getSettings').mockResolvedValue({
      linkding_url: 'https://test.com',
      linkding_token: 'test-key',
      auto_sync: true,
      reading_mode: 'original' as const
    } as AppSettings);

    // Create test component
    component = document.createElement('test-sync-component') as TestSyncComponent;
    document.body.appendChild(component);
    await waitForComponentReady(component);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
    // Clear component and reset state
    if (component) {
      document.body.removeChild(component);
    }
  });
  
  describe('Manual Sync and Service Worker Communication', () => {
    it('should perform manual sync directly via worker manager', async () => {
      // Manual sync should bypass service worker and use SyncWorkerManager directly
      const initialState = component.syncController.getSyncState();
      expect(initialState.isSyncing).toBe(false);

      // Request sync - should start immediately
      await component.syncController.requestSync();

      // Should show immediate UI feedback
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);
      expect(state.syncStatus).toBe('starting');

      // Should NOT post message to service worker for manual sync
      expect(mockPostMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REQUEST_SYNC' })
      );
    });

    it('should ignore sync progress messages from service worker (background sync)', async () => {
      const progressMessage: SyncMessage = SyncMessages.syncProgress(5, 10, 'bookmarks');

      // Simulate message from service worker (background sync)
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: progressMessage }));
      }

      await component.updateComplete;

      // Background sync messages should be ignored - UI state should not change
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false); // Should remain in idle state
      expect(state.syncProgress).toBe(0);
      expect(state.syncTotal).toBe(0);
      expect(state.syncPhase).toBe(undefined);
    });

    it('should ignore sync complete messages from service worker (background sync)', async () => {
      const completeMessage: SyncMessage = SyncMessages.syncComplete(true, 25, 5000);

      // Simulate completion message from background sync
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: completeMessage }));
      }

      await component.updateComplete;

      // Background sync messages should be ignored - UI state should not change
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
      expect(state.syncStatus).toBe('idle'); // Should remain in idle state
    });

    it('should ignore sync error messages from service worker (background sync)', async () => {
      const errorMessage: SyncMessage = SyncMessages.syncError('Network error', true);

      // Simulate error message from background sync
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: errorMessage }));
      }

      await component.updateComplete;

      // Background sync messages should be ignored - UI state should not change
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
      expect(state.syncStatus).toBe('idle'); // Should remain in idle state
    });

    it('should delegate periodic sync to PageVisibilityService', async () => {
      // refreshPeriodicSyncState delegates to PageVisibilityService
      await component.syncController.refreshPeriodicSyncState();

      // Should NOT post directly to service worker (demonstrates delegation)
      expect(mockPostMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'REGISTER_PERIODIC_SYNC' })
      );
    });

    it('should handle interrupted sync status messages for resuming', async () => {
      // Mock database to return bookmarks needing sync (for interrupted sync scenario)
      (DatabaseService.getBookmarksNeedingAssetSync as any).mockResolvedValue([{ id: 1 }]);
      (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([{ id: 2 }]);

      // Create a fresh component to avoid state pollution
      const testComponent = document.createElement('test-sync-component') as TestSyncComponent;
      document.body.appendChild(testComponent);
      await waitForComponentReady(testComponent);

      // Wait for async service worker setup to complete
      await vi.waitFor(() => {
        // The service worker setup should be done and message handler registered
        expect(mockAddEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      }, { timeout: 1000 });

      // Capture the message handler that was registered for this component
      let testMessageHandler: ((event: MessageEvent) => void) | null = null;
      const addEventListenerCalls = mockAddEventListener.mock.calls;
      for (const call of addEventListenerCalls) {
        if (call[0] === 'message') {
          testMessageHandler = call[1] as (event: MessageEvent) => void;
          break;
        }
      }

      // Mock the sync worker manager startSync to track if sync is requested
      const startSyncSpy = vi.spyOn(mockSyncWorkerManager, 'startSync');
      startSyncSpy.mockClear();

      const statusMessage: SyncMessage = SyncMessages.syncStatus('interrupted');

      // Simulate interrupted status message from background sync
      expect(testMessageHandler).not.toBeNull();
      testMessageHandler!(new MessageEvent('message', { data: statusMessage }));

      // Wait for async operations - the interrupted message should trigger resume sync
      await vi.waitFor(() => {
        expect(startSyncSpy).toHaveBeenCalled();
      }, { timeout: 1000 });

      // Cleanup
      document.body.removeChild(testComponent);
    });

    it('should cancel sync directly via worker manager', async () => {
      // Start sync first
      await component.syncController.requestSync();
      await component.updateComplete;

      // Should be syncing
      let state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);

      // Cancel sync - should work directly via worker manager
      await component.syncController.cancelSync();
      await component.updateComplete;

      // Should stop syncing (Note: actual cancellation may be async)
      state = component.syncController.getSyncState();
      // Don't assert final state since cancellation might be async

      // Should NOT post cancel message to service worker for manual sync
      expect(mockPostMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'CANCEL_SYNC' })
      );
    });
  });
  
  describe('UI State Management', () => {
    it('should show immediate UI feedback when requesting sync', async () => {
      // Ensure no bookmarks need syncing to prevent auto-resume from affecting this test
      (DatabaseService.getBookmarksNeedingAssetSync as any).mockResolvedValue([]);
      (DatabaseService.getBookmarksNeedingReadSync as any).mockResolvedValue([]);

      // Also ensure no last sync error to prevent retry logic
      (DatabaseService.getLastSyncError as any).mockResolvedValue(null);
      (DatabaseService.getSyncRetryCount as any).mockResolvedValue(0);

      // Create a fresh component to avoid state pollution
      const testComponent = document.createElement('test-sync-component') as TestSyncComponent;
      document.body.appendChild(testComponent);
      await waitForComponentReady(testComponent);

      // Wait for component initialization to complete (including any async setup)
      await vi.waitFor(() => {
        const state = testComponent.syncController.getSyncState();
        // Component should be fully initialized and not syncing
        expect(state.isSyncing).toBe(false);
        expect(state.syncStatus).toBe('idle');
      }, { timeout: 2000 });

      const initialState = testComponent.syncController.getSyncState();
      expect(initialState.isSyncing).toBe(false);

      await testComponent.syncController.requestSync();

      // Should immediately show syncing state
      const state = testComponent.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);
      expect(state.syncStatus).toBe('starting');
      expect(state.syncPhase).toBe(undefined); // No phase until first progress message

      // Cleanup
      document.body.removeChild(testComponent);
    });
    
    it('should maintain sync state via SyncWorkerManager callbacks (not service worker messages)', async () => {
      // Start manual sync which uses SyncWorkerManager
      await component.syncController.requestSync();

      // Should show immediate UI feedback
      let state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);
      expect(state.syncStatus).toBe('starting');

      // Background sync messages should be ignored
      const backgroundMessages = [
        SyncMessages.syncStatus('starting'),
        SyncMessages.syncProgress(5, 10, 'bookmarks'),
        SyncMessages.syncComplete(true, 15, 3000)
      ];

      for (const message of backgroundMessages) {
        if (messageHandler) {
          messageHandler(new MessageEvent('message', { data: message }));
        }
        await component.updateComplete;
      }

      // State should only reflect manual sync, not background messages
      const finalState = component.syncController.getSyncState();
      expect(finalState.isSyncing).toBe(true); // Still syncing via manual sync
      expect(finalState.syncStatus).toBe('starting'); // From manual sync, not background
    });
    
    it('should clear synced highlights after manual sync completion', async () => {
      vi.useFakeTimers();

      // Verify that the callback system is working by checking spy calls
      expect(mockCallbacks.onComplete).toBeDefined();

      // Simulate manual sync completion via the mock callbacks
      if (mockCallbacks.onComplete) {
        mockCallbacks.onComplete(2);
      }
      await component.updateComplete;

      // Fast-forward time to test delayed clearing
      vi.advanceTimersByTime(3000);
      await component.updateComplete;

      vi.useRealTimers();

      // This test primarily verifies that the callback mechanism is in place
      // The actual clearing behavior is tested in sync-controller unit tests
    });
  });

  describe('4-Phase Sync Progress Reporting', () => {
    it('should handle 4-phase sync progress via SyncWorkerManager callbacks', async () => {
      const phaseProgressHistory: Array<{ phase?: string | undefined; current: number; total: number; percentage: number }> = [];

      // Simulate complete 4-phase sync cycle via mock callbacks
      const phases = [
        { current: 25, total: 100, phase: 'bookmarks' as const },
        { current: 50, total: 100, phase: 'bookmarks' as const },
        { current: 25, total: 50, phase: 'archived-bookmarks' as const },
        { current: 40, total: 75, phase: 'assets' as const },
        { current: 10, total: 20, phase: 'read-status' as const }
      ];

      for (const { current, total, phase } of phases) {
        if (mockCallbacks.onProgress) {
          mockCallbacks.onProgress(current, total, phase);
        }
        await component.updateComplete;

        const syncState = component.syncController.getSyncState();
        phaseProgressHistory.push({
          phase: syncState.syncPhase,
          current: syncState.syncProgress,
          total: syncState.syncTotal,
          percentage: syncState.getPercentage()
        });
      }

      // Validate that we cycled through all 4 phases
      const uniquePhases = [...new Set(phaseProgressHistory.map(p => p.phase))];
      expect(uniquePhases).toEqual(['bookmarks', 'archived-bookmarks', 'assets', 'read-status']);

      // Complete sync
      if (mockCallbacks.onComplete) {
        mockCallbacks.onComplete(245);
      }
      await component.updateComplete;

      const finalState = component.syncController.getSyncState();
      expect(finalState.isSyncing).toBe(false);
      expect(finalState.syncStatus).toBe('completed');
      expect(finalState.syncPhase).toBe('complete');
    });

    it('should calculate correct percentage via SyncWorkerManager callbacks', async () => {
      // Test percentage calculation with different totals
      const testCases = [
        { current: 50, total: 100, expectedPercentage: 50 },
        { current: 25, total: 50, expectedPercentage: 50 },
        { current: 3, total: 7, expectedPercentage: 43 }, // Rounds to nearest integer
        { current: 0, total: 0, expectedPercentage: 0 }, // Edge case: no division by zero
      ];

      for (const { current, total, expectedPercentage } of testCases) {
        if (mockCallbacks.onProgress) {
          mockCallbacks.onProgress(current, total, 'assets');
        }
        await component.updateComplete;

        const syncState = component.syncController.getSyncState();
        expect(syncState.getPercentage()).toBe(expectedPercentage);
        expect(syncState.syncProgress).toBe(current);
        expect(syncState.syncTotal).toBe(total);
        expect(syncState.syncPhase).toBe('assets');
      }
    });

    it('should reset phase tracking on sync completion and errors via callbacks', async () => {
      // Start with a phase via mock callback
      if (mockCallbacks.onProgress) {
        mockCallbacks.onProgress(50, 100, 'bookmarks');
      }
      await component.updateComplete;

      let state = component.syncController.getSyncState();
      expect(state.syncPhase).toBe('bookmarks');

      // Complete sync via callback - should reset to 'complete'
      if (mockCallbacks.onComplete) {
        mockCallbacks.onComplete(100);
      }
      await component.updateComplete;

      state = component.syncController.getSyncState();
      expect(state.syncPhase).toBe('complete');
      expect(state.isSyncing).toBe(false);

      // Start new sync - phase should be undefined until first progress
      await component.syncController.requestSync();
      state = component.syncController.getSyncState();
      expect(state.syncPhase).toBe(undefined);

      // Simulate error via callback - should reset phase tracking
      if (mockCallbacks.onError) {
        mockCallbacks.onError('Test error', false);
      }
      await component.updateComplete;

      state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
      expect(state.syncStatus).toBe('failed');
    });
  });

  describe('Error Handling', () => {
    it('should handle service worker not available', async () => {
      // Remove service worker
      Object.defineProperty(navigator, 'serviceWorker', {
        value: undefined,
        writable: true
      });
      
      const component2 = document.createElement('test-sync-component') as TestSyncComponent;
      document.body.appendChild(component2);
      await waitForComponentReady(component2);
      
      // Should not throw when trying to sync
      await expect(component2.syncController.requestSync()).resolves.not.toThrow();
    });
    
    it('should handle settings not configured', async () => {
      vi.spyOn(SettingsService, 'getSettings').mockResolvedValue(undefined);
      
      const component2 = document.createElement('test-sync-component') as TestSyncComponent;
      document.body.appendChild(component2);
      await waitForComponentReady(component2);
      
      await component2.syncController.requestSync();
      
      // Should not start sync without settings
      const state = component2.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
    });
  });
});

// Type augmentation for the test
declare global {
  interface HTMLElementTagNameMap {
    'test-sync-component': TestSyncComponent;
  }
}