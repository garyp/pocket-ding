import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ExportService, type ExportData } from '../../services/export-service';
import { DatabaseService } from '../../services/database';

// Mock the database module
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getLastSyncTimestamp: vi.fn()
  },
  db: {
    readProgress: {
      toArray: vi.fn()
    }
  }
}));

// Mock file system access APIs
const mockShowSaveFilePicker = vi.fn();
const mockCreateWritable = vi.fn();
const mockWrite = vi.fn();
const mockClose = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  
  // Mock File System Access API
  mockCreateWritable.mockReturnValue({
    write: mockWrite,
    close: mockClose
  });
  mockShowSaveFilePicker.mockReturnValue({
    createWritable: mockCreateWritable
  });
  
  // Mock URL.createObjectURL
  global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  global.URL.revokeObjectURL = vi.fn();
  
  // Mock document methods
  global.document.createElement = vi.fn().mockReturnValue({
    href: '',
    download: '',
    click: vi.fn(),
    remove: vi.fn()
  } as any);
  
  // Mock document.body methods
  const mockAppendChild = vi.fn();
  const mockRemoveChild = vi.fn();
  Object.defineProperty(global.document, 'body', {
    value: {
      appendChild: mockAppendChild,
      removeChild: mockRemoveChild
    },
    writable: true
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ExportService', () => {
  describe('exportData', () => {
    it('should export all non-Linkding state data', async () => {
      // Mock database responses
      const mockReadProgress = [
        {
          bookmark_id: 1,
          progress: 0.5,
          last_read_at: '2023-01-01T12:00:00Z',
          reading_mode: 'readability' as const,
          scroll_position: 100,
          dark_mode_override: 'dark' as const
        },
        {
          bookmark_id: 2,
          progress: 0.8,
          last_read_at: '2023-01-02T12:00:00Z',
          reading_mode: 'original' as const,
          scroll_position: 200,
          dark_mode_override: null
        }
      ];

      const mockSettings = {
        linkding_url: 'https://example.com',
        linkding_token: 'secret-token',
        sync_interval: 30,
        auto_sync: false,
        reading_mode: 'original' as const,
        theme_mode: 'dark' as const
      };

      const mockSyncTimestamp = '2023-01-01T10:00:00Z';

      // Mock database module import
      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockResolvedValue(mockReadProgress);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(mockSyncTimestamp);

      const result = await ExportService.exportData();

      // Verify structure
      expect(result).toMatchObject({
        version: '1.0',
        export_timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        reading_progress: mockReadProgress,
        app_settings: {
          sync_interval: 30,
          auto_sync: false,
          reading_mode: 'original',
          theme_mode: 'dark'
        },
        sync_metadata: {
          last_sync_timestamp: mockSyncTimestamp
        }
      });

      // Verify sensitive data is excluded
      expect((result.app_settings as any).linkding_url).toBeUndefined();
      expect((result.app_settings as any).linkding_token).toBeUndefined();
    });

    it('should handle missing settings gracefully', async () => {
      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);

      const result = await ExportService.exportData();

      expect(result.app_settings).toEqual({
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
        theme_mode: undefined
      });
      expect(result.sync_metadata.last_sync_timestamp).toBeNull();
    });

    it('should throw error on database failure', async () => {
      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockRejectedValue(new Error('Database error'));

      await expect(ExportService.exportData()).rejects.toThrow('Failed to export data: Database error');
    });
  });

  describe('exportToFile', () => {
    it('should use File System Access API when available', async () => {
      // Mock window.showSaveFilePicker
      (global as any).window = { showSaveFilePicker: mockShowSaveFilePicker };

      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);

      await ExportService.exportToFile();

      expect(mockShowSaveFilePicker).toHaveBeenCalledWith({
        suggestedName: expect.stringMatching(/^pocket-ding-export-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}\.json$/),
        types: [{
          description: 'JSON files',
          accept: { 'application/json': ['.json'] }
        }]
      });
      expect(mockWrite).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });

    it('should fallback to download link when File System Access API not available', async () => {
      // No showSaveFilePicker available
      (global as any).window = {};

      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);

      const mockAnchor = {
        href: '',
        download: '',
        click: vi.fn(),
        remove: vi.fn()
      };
      vi.mocked(document.createElement).mockReturnValue(mockAnchor as any);

      await ExportService.exportToFile();

      expect(document.createElement).toHaveBeenCalledWith('a');
      expect(mockAnchor.click).toHaveBeenCalled();
      expect(global.URL.createObjectURL).toHaveBeenCalled();
      expect(global.URL.revokeObjectURL).toHaveBeenCalled();
    });

    it('should handle user cancellation gracefully', async () => {
      (global as any).window = { showSaveFilePicker: mockShowSaveFilePicker };
      
      // Create an error with the name property set to 'AbortError'
      const abortError = new Error('User cancelled');
      abortError.name = 'AbortError';
      mockShowSaveFilePicker.mockRejectedValue(abortError);

      const mockDb = await import('../../services/database');
      vi.mocked(mockDb.db.readProgress.toArray).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getLastSyncTimestamp).mockResolvedValue(null);

      // Should not throw
      await expect(ExportService.exportToFile()).resolves.toBeUndefined();
    });
  });

  describe('validateExportData', () => {
    const validExportData: ExportData = {
      version: '1.0',
      export_timestamp: '2023-01-01T12:00:00Z',
      reading_progress: [{
        bookmark_id: 1,
        progress: 0.5,
        last_read_at: '2023-01-01T12:00:00Z',
        reading_mode: 'readability',
        scroll_position: 100,
        dark_mode_override: null
      }],
      app_settings: {
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      },
      sync_metadata: {
        last_sync_timestamp: '2023-01-01T10:00:00Z'
      }
    };

    it('should validate correct export data', () => {
      expect(ExportService.validateExportData(validExportData)).toBe(true);
    });

    it('should reject null or non-object data', () => {
      expect(ExportService.validateExportData(null)).toBe(false);
      expect(ExportService.validateExportData('string')).toBe(false);
      expect(ExportService.validateExportData(123)).toBe(false);
    });

    it('should reject data missing required fields', () => {
      const incompleteData = { ...validExportData };
      delete (incompleteData as any).version;
      expect(ExportService.validateExportData(incompleteData)).toBe(false);
    });

    it('should reject invalid reading progress entries', () => {
      const invalidData = {
        ...validExportData,
        reading_progress: [{
          bookmark_id: 'not-a-number',
          progress: 0.5,
          last_read_at: '2023-01-01T12:00:00Z',
          reading_mode: 'readability',
          scroll_position: 100
        }]
      };
      expect(ExportService.validateExportData(invalidData)).toBe(false);
    });

    it('should reject invalid app settings', () => {
      const invalidData = {
        ...validExportData,
        app_settings: {
          sync_interval: 'not-a-number',
          auto_sync: true,
          reading_mode: 'readability'
        }
      };
      expect(ExportService.validateExportData(invalidData)).toBe(false);
    });

    it('should accept valid dark mode override values', () => {
      const validValues = [null, undefined, 'light', 'dark'];
      
      validValues.forEach(value => {
        const testData = {
          ...validExportData,
          reading_progress: [{
            ...validExportData.reading_progress[0],
            dark_mode_override: value
          }]
        };
        expect(ExportService.validateExportData(testData)).toBe(true);
      });
    });

    it('should reject invalid dark mode override values', () => {
      const invalidData = {
        ...validExportData,
        reading_progress: [{
          ...validExportData.reading_progress[0],
          dark_mode_override: 'invalid-mode'
        }]
      };
      expect(ExportService.validateExportData(invalidData)).toBe(false);
    });
  });
});