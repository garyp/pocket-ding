import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ExportService, type ExportData } from '../../services/export-service';
import { DatabaseService } from '../../services/database';

// Mock the database module
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getSettings: vi.fn(),
    getAllReadProgress: vi.fn(),
    getLastSyncTimestamp: vi.fn()
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

      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue(mockReadProgress);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mockSettings);

      const result = await ExportService.exportData();

      // Verify structure
      expect(result).toMatchObject({
        version: '1.0',
        export_timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
        reading_progress: mockReadProgress,
        app_settings: {
          sync_interval: 30,  // Different from default (60)
          auto_sync: false,   // Different from default (true)
          reading_mode: 'original',  // Different from default ('readability')
          theme_mode: 'dark'  // Different from default ('system')
        }
      });
      
      // Verify sync_metadata is not present
      expect(result).not.toHaveProperty('sync_metadata');

      // Verify sensitive data is excluded
      expect((result.app_settings as any).linkding_url).toBeUndefined();
      expect((result.app_settings as any).linkding_token).toBeUndefined();
    });

    it('should handle missing settings gracefully', async () => {
      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      const result = await ExportService.exportData();

      // When no settings exist, app_settings should be empty (no defaults exported)
      expect(result.app_settings).toEqual({});
      
      // Verify sync_metadata is not present
      expect(result).not.toHaveProperty('sync_metadata');
    });

    it('should throw error on database failure', async () => {
      vi.mocked(DatabaseService.getAllReadProgress).mockRejectedValue(new Error('Database error'));

      await expect(ExportService.exportData()).rejects.toThrow('Failed to export data: Database error');
    });
  });

  describe('exportToFile', () => {
    it('should use File System Access API when available', async () => {
      // Mock window.showSaveFilePicker
      (global as any).window = { showSaveFilePicker: mockShowSaveFilePicker };

      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

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

      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

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

      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      // Should not throw and return success
      const result = await ExportService.exportToFile();
      expect(result.success).toBe(true);
      expect(result.warnings).toEqual([]);
    });

    it('should warn when export file exceeds 100MB', async () => {
      (global as any).window = { showSaveFilePicker: mockShowSaveFilePicker };
      
      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined);

      // Mock Blob constructor to simulate large file
      const originalBlob = global.Blob;
      const mockBlob = vi.fn().mockImplementation((array, options) => {
        const blob = new originalBlob(array, options);
        // Override the size property to simulate a large file
        Object.defineProperty(blob, 'size', {
          value: 110 * 1024 * 1024, // 110MB
          writable: false
        });
        return blob;
      });
      global.Blob = mockBlob as any;

      const result = await ExportService.exportToFile();

      // Verify warning was returned in result
      expect(result.success).toBe(true);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toMatch(/Export file size is \d+\.\d+MB, which exceeds the recommended 100MB limit/);

      // Restore original Blob
      global.Blob = originalBlob;
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

    it('should validate data with optional app_settings fields', () => {
      const dataWithOptionalFields = {
        ...validExportData,
        app_settings: {
          sync_interval: 30
          // Only sync_interval provided, others optional
        }
      };
      expect(ExportService.validateExportData(dataWithOptionalFields)).toBe(true);
    });

    it('should validate data with empty app_settings', () => {
      const dataWithEmptySettings = {
        ...validExportData,
        app_settings: {}
      };
      expect(ExportService.validateExportData(dataWithEmptySettings)).toBe(true);
    });

    it('should reject invalid optional theme_mode values', () => {
      const invalidData = {
        ...validExportData,
        app_settings: {
          theme_mode: 'invalid-theme'
        }
      };
      expect(ExportService.validateExportData(invalidData)).toBe(false);
    });
    
    it('should only export non-default settings values', async () => {
      // Test with settings that have mix of default and non-default values
      const mixedSettings = {
        linkding_url: 'https://example.com',
        linkding_token: 'secret-token',
        sync_interval: 60,        // Default value
        auto_sync: false,         // Non-default value
        reading_mode: 'readability' as const, // Default value
        theme_mode: 'dark' as const          // Non-default value
      };

      vi.mocked(DatabaseService.getAllReadProgress).mockResolvedValue([]);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(mixedSettings);

      const result = await ExportService.exportData();

      // Should only export non-default values
      expect(result.app_settings).toEqual({
        auto_sync: false,    // Different from default (true)
        theme_mode: 'dark'   // Different from default ('system')
      });
      
      // Should not include default values
      expect(result.app_settings).not.toHaveProperty('sync_interval');
      expect(result.app_settings).not.toHaveProperty('reading_mode');
    });
  });
});