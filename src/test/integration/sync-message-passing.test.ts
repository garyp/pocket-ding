import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SyncController } from '../../controllers/sync-controller';
import { SyncMessages, type SyncMessage } from '../../services/sync-messages';
import { SettingsService } from '../../services/settings-service';
import type { AppSettings } from '../../types';
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { waitForComponentReady } from '../utils/component-aware-wait-for';

// Mock navigator.serviceWorker
const mockPostMessage = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

const mockServiceWorker = {
  ready: Promise.resolve({
    active: {
      postMessage: mockPostMessage
    }
  }),
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
    // Setup service worker mock
    Object.defineProperty(navigator, 'serviceWorker', {
      value: mockServiceWorker,
      writable: true
    });
    
    // Capture message handler
    mockAddEventListener.mockImplementation((event, handler) => {
      if (event === 'message') {
        messageHandler = handler;
      }
    });
    
    // Mock settings
    vi.spyOn(SettingsService, 'getSettings').mockResolvedValue({
      linkding_url: 'https://test.com',
      linkding_token: 'test-key',
      auto_sync: true,
      sync_interval: 60,
      reading_mode: 'original' as const
    } as AppSettings);
    
    // Create test component
    component = document.createElement('test-sync-component') as TestSyncComponent;
    document.body.appendChild(component);
    await waitForComponentReady(component);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  describe('Service Worker Communication', () => {
    it('should post sync request message to service worker', async () => {
      
      await component.syncController.requestSync();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REQUEST_SYNC',
          immediate: true,
          priority: 'high'
        })
      );
    });
    
    it('should handle sync progress messages from service worker', async () => {
      const progressMessage: SyncMessage = SyncMessages.syncProgress(5, 10, 'bookmarks');
      
      // Simulate message from service worker
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: progressMessage }));
      }
      
      await component.updateComplete;
      
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);
      expect(state.syncProgress).toBe(5);
      expect(state.syncTotal).toBe(10);
      expect(state.syncPhase).toBe('bookmarks');
    });
    
    it('should handle sync complete messages', async () => {
      const completeMessage: SyncMessage = SyncMessages.syncComplete(true, 25, 5000);
      
      // Start sync first
      await component.syncController.requestSync();
      await component.updateComplete;
      
      // Simulate completion message
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: completeMessage }));
      }
      
      await component.updateComplete;
      
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
      expect(state.syncStatus).toBe('completed');
    });
    
    it('should handle sync error messages', async () => {
      const errorMessage: SyncMessage = SyncMessages.syncError('Network error', true);
      
      // Simulate error message
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: errorMessage }));
      }
      
      await component.updateComplete;
      
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(false);
      expect(state.syncStatus).toBe('failed');
    });
    
    it('should enable periodic sync when auto_sync is enabled', async () => {
      await component.syncController.setPeriodicSync(true, 720 * 60 * 1000);
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'REGISTER_PERIODIC_SYNC',
          enabled: true,
          minInterval: 720 * 60 * 1000
        })
      );
    });
    
    it('should handle sync status messages', async () => {
      const statusMessage: SyncMessage = SyncMessages.syncStatus('syncing');
      
      // Simulate status message
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: statusMessage }));
      }
      
      await component.updateComplete;
      
      const state = component.syncController.getSyncState();
      expect(state.syncStatus).toBe('syncing');
      expect(state.isSyncing).toBe(true);
    });
    
    it('should cancel sync by posting cancel message', async () => {
      // Start sync first
      await component.syncController.requestSync();
      await component.updateComplete;
      
      // Cancel sync
      await component.syncController.cancelSync();
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 10));
      
      expect(mockPostMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'CANCEL_SYNC',
          reason: 'User requested cancellation'
        })
      );
    });
  });
  
  describe('UI State Management', () => {
    it('should show immediate UI feedback when requesting sync', async () => {
      const initialState = component.syncController.getSyncState();
      expect(initialState.isSyncing).toBe(false);
      
      await component.syncController.requestSync();
      
      // Should immediately show syncing state
      const state = component.syncController.getSyncState();
      expect(state.isSyncing).toBe(true);
      expect(state.syncStatus).toBe('starting');
      expect(state.syncPhase).toBe('init');
    });
    
    it('should maintain sync state across multiple progress updates', async () => {
      // Simulate multiple progress updates
      const messages = [
        SyncMessages.syncStatus('starting'),
        SyncMessages.syncProgress(0, 10, 'bookmarks'),
        SyncMessages.syncProgress(5, 10, 'bookmarks'),
        SyncMessages.syncProgress(10, 10, 'bookmarks'),
        SyncMessages.syncProgress(0, 5, 'assets'),
        SyncMessages.syncProgress(5, 5, 'assets'),
        SyncMessages.syncComplete(true, 15, 3000)
      ];
      
      for (const message of messages) {
        if (messageHandler) {
          messageHandler(new MessageEvent('message', { data: message }));
        }
        await component.updateComplete;
      }
      
      const finalState = component.syncController.getSyncState();
      expect(finalState.isSyncing).toBe(false);
      expect(finalState.syncStatus).toBe('completed');
    });
    
    it('should clear synced highlights after delay', async () => {
      vi.useFakeTimers();
      
      // Track some synced bookmarks
      const state1 = component.syncController.getSyncState();
      state1.syncedBookmarkIds.add(1);
      state1.syncedBookmarkIds.add(2);
      
      // Simulate sync complete
      const completeMessage = SyncMessages.syncComplete(true, 2, 1000);
      if (messageHandler) {
        messageHandler(new MessageEvent('message', { data: completeMessage }));
      }
      
      await component.updateComplete;
      
      // Fast-forward time
      vi.advanceTimersByTime(3000);
      await component.updateComplete;
      
      const finalState = component.syncController.getSyncState();
      expect(finalState.syncedBookmarkIds.size).toBe(0);
      
      vi.useRealTimers();
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