import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DebugService } from '../../services/debug-service';
import { DatabaseService } from '../../services/database';
import type { AppSettings } from '../../types';

// Mock DatabaseService
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getAllBookmarks: vi.fn(),
    getAllAssets: vi.fn(),
    getLastSyncTimestamp: vi.fn()
  }
}));

describe('DebugService', () => {
  beforeEach(() => {
    // Reset service state before each test
    DebugService.setDebugMode(false);
    DebugService.clearLogs();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should initialize with debug mode disabled by default', () => {
      expect(DebugService.isEnabled()).toBe(false);
    });

    it('should initialize debug mode from settings', async () => {
      const mockSettings: AppSettings = {
        linkding_url: 'http://example.com',
        linkding_token: 'token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
        debug_mode: true
      };

      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);

      await DebugService.initialize();

      expect(DebugService.isEnabled()).toBe(true);
    });

    it('should handle initialization errors gracefully', async () => {
      vi.mocked(DatabaseService.getSettings).mockRejectedValue(new Error('Database error'));
      
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await DebugService.initialize();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to initialize debug service:', expect.any(Error));
      expect(DebugService.isEnabled()).toBe(false);
    });
  });

  describe('debug mode control', () => {
    it('should enable and disable debug mode', () => {
      expect(DebugService.isEnabled()).toBe(false);
      
      DebugService.setDebugMode(true);
      expect(DebugService.isEnabled()).toBe(true);
      
      DebugService.setDebugMode(false);
      expect(DebugService.isEnabled()).toBe(false);
    });
  });

  describe('logging', () => {
    beforeEach(() => {
      DebugService.setDebugMode(true);
    });

    it('should log messages when debug mode is enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      DebugService.log('info', 'sync', 'test', 'Test message', { detail: 'value' });

      const logs = DebugService.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'sync',
        operation: 'test',
        message: 'Test message',
        details: { detail: 'value' }
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DEBUG] SYNC test: Test message',
        { detail: 'value' }
      );
    });

    it('should not log messages when debug mode is disabled', () => {
      DebugService.setDebugMode(false);
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      DebugService.log('info', 'sync', 'test', 'Test message');

      const logs = DebugService.getLogs();
      expect(logs).toHaveLength(0);
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log errors with error objects', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const testError = new Error('Test error');

      DebugService.log('error', 'api', 'request', 'API failed', { url: '/api/test' }, testError);

      const logs = DebugService.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0]!).toMatchObject({
        level: 'error',
        category: 'api',
        operation: 'request',
        message: 'API failed',
        details: { url: '/api/test' },
        error: testError
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        '[DEBUG] API request: API failed',
        { details: { url: '/api/test' }, error: testError }
      );
    });

    it('should log warnings', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      DebugService.log('warn', 'database', 'query', 'Slow query detected');

      const logs = DebugService.getLogs();
      expect(logs[0]!.level).toBe('warn');
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[DEBUG] DATABASE query: Slow query detected',
        undefined
      );
    });

    it('should clear logs', () => {
      DebugService.log('info', 'sync', 'test', 'Test message 1');
      DebugService.log('info', 'sync', 'test', 'Test message 2');
      
      expect(DebugService.getLogs()).toHaveLength(2);
      
      DebugService.clearLogs();
      expect(DebugService.getLogs()).toHaveLength(0);
    });

    it('should limit log entries to maximum count', () => {
      // Mock the internal maxLogEntries by adding many logs
      for (let i = 0; i < 1500; i++) {
        DebugService.log('info', 'sync', 'test', `Test message ${i}`);
      }

      const logs = DebugService.getLogs();
      expect(logs.length).toBeLessThanOrEqual(1000); // Should not exceed maxLogEntries
      
      // Should contain the most recent logs
      expect(logs[0]!.message).toBe('Test message 1499'); // newest first
    });

    it('should generate unique IDs for log entries', () => {
      DebugService.log('info', 'sync', 'test1', 'Message 1');
      DebugService.log('info', 'sync', 'test2', 'Message 2');

      const logs = DebugService.getLogs();
      expect(logs[0]!.id).toBeDefined();
      expect(logs[1]!.id).toBeDefined();
      expect(logs[0]!.id).not.toBe(logs[1]!.id);
    });

    it('should include timestamps', () => {
      const beforeTime = new Date().toISOString();
      
      DebugService.log('info', 'sync', 'test', 'Test message');
      
      const afterTime = new Date().toISOString();
      const logs = DebugService.getLogs();
      
      expect(logs[0]!.timestamp).toBeDefined();
      expect(logs[0]!.timestamp >= beforeTime).toBe(true);
      expect(logs[0]!.timestamp <= afterTime).toBe(true);
    });
  });

  describe('convenience logging methods', () => {
    beforeEach(() => {
      DebugService.setDebugMode(true);
    });

    it('should log sync start events', () => {
      DebugService.logSyncStart(100);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'sync',
        operation: 'start',
        message: 'Starting sync of 100 bookmarks',
        details: { total: 100 }
      });
    });

    it('should log sync progress events', () => {
      DebugService.logSyncProgress(50, 100);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'sync',
        operation: 'progress',
        message: 'Sync progress: 50/100',
        details: { current: 50, total: 100 }
      });
    });

    it('should log sync complete events', () => {
      DebugService.logSyncComplete(100);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'sync',
        operation: 'complete',
        message: 'Sync completed successfully',
        details: { processed: 100 }
      });
    });

    it('should log sync errors', () => {
      const error = new Error('Sync failed');
      const context = { reason: 'network' };

      DebugService.logSyncError(error, context);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'error',
        category: 'sync',
        operation: 'error',
        message: 'Sync failed',
        details: context,
        error
      });
    });

    it('should log API requests', () => {
      DebugService.logApiRequest('/api/bookmarks', 'GET');

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'api',
        operation: 'request',
        message: 'GET /api/bookmarks',
        details: { url: '/api/bookmarks', method: 'GET' }
      });
    });

    it('should log API responses', () => {
      DebugService.logApiResponse('/api/bookmarks', 200, 'OK');

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'api',
        operation: 'response',
        message: '200 OK for /api/bookmarks',
        details: { url: '/api/bookmarks', status: 200, statusText: 'OK' }
      });
    });

    it('should log API errors', () => {
      const error = new Error('Network error');

      DebugService.logApiError('/api/bookmarks', error);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'error',
        category: 'api',
        operation: 'error',
        message: 'API request failed: /api/bookmarks',
        details: { url: '/api/bookmarks' },
        error
      });
    });

    it('should log database operations', () => {
      DebugService.logDatabaseOperation('insert', 'bookmarks', { id: 123 });

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'database',
        operation: 'insert',
        message: 'insert on bookmarks',
        details: { table: 'bookmarks', id: 123 }
      });
    });

    it('should log database errors', () => {
      const error = new Error('Database error');

      DebugService.logDatabaseError('update', 'bookmarks', error);

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'error',
        category: 'database',
        operation: 'update',
        message: 'update failed on bookmarks',
        details: { table: 'bookmarks' },
        error
      });
    });

    it('should log app events', () => {
      DebugService.logAppEvent('startup', { version: '1.0.0' });

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'info',
        category: 'app',
        operation: 'startup',
        message: 'App event: startup',
        details: { version: '1.0.0' }
      });
    });
  });

  describe('app state collection', () => {
    it('should collect comprehensive app state', async () => {
      const mockBookmarks = [
        { id: 1, unread: true, is_archived: false },
        { id: 2, unread: false, is_archived: true },
        { id: 3, unread: true, is_archived: false }
      ];

      const mockAssets = [
        { id: 1, bookmark_id: 1 },
        { id: 2, bookmark_id: 1 },
        { id: 3, bookmark_id: 3 }
      ];

      const mockSettings: AppSettings = {
        linkding_url: 'http://example.com',
        linkding_token: 'token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      };

      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue(mockBookmarks as any);
      vi.mocked(DatabaseService.getAllAssets).mockResolvedValue(mockAssets as any);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue('2023-01-01T00:00:00Z');

      const appState = await DebugService.getAppState();

      expect(appState.bookmarks).toEqual({
        total: 3,
        unread: 2,
        archived: 1,
        withAssets: 2 // bookmarks 1 and 3 have assets
      });

      expect(appState.sync).toEqual({
        isInProgress: false,
        lastSyncAt: '2023-01-01T00:00:00Z'
      });

      expect(appState.api).toEqual({
        baseUrl: 'http://example.com',
        isConnected: undefined,
        lastTestAt: undefined
      });

      expect(appState.storage).toBeDefined();
    });

    it('should handle storage estimate if available', async () => {
      // Mock navigator.storage.estimate
      const mockEstimate = vi.fn().mockResolvedValue({
        usage: 1024 * 1024, // 1MB
        quota: 1024 * 1024 * 100 // 100MB
      });

      Object.defineProperty(navigator, 'storage', {
        value: { estimate: mockEstimate },
        configurable: true
      });

      vi.mocked(DatabaseService.getAllBookmarks).mockResolvedValue([]);
      vi.mocked(DatabaseService.getAllAssets).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);

      const appState = await DebugService.getAppState();

      expect(appState.storage).toEqual({
        sizeEstimate: 1024 * 1024,
        quotaUsed: 1024 * 1024,
        quotaAvailable: 1024 * 1024 * 100
      });
    });

    it('should handle errors when collecting app state', async () => {
      vi.mocked(DatabaseService.getAllBookmarks).mockRejectedValue(new Error('Database error'));

      DebugService.setDebugMode(true);

      await expect(DebugService.getAppState()).rejects.toThrow('Database error');

      const logs = DebugService.getLogs();
      expect(logs[0]!).toMatchObject({
        level: 'error',
        category: 'app',
        operation: 'getAppState',
        message: 'Failed to get app state'
      });
    });
  });
});