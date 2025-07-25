import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { ImportService } from '../../services/import-service';
import { ExportService, type ExportData } from '../../services/export-service';
import { DatabaseService } from '../../services/database';

// Mock the database module
vi.mock('../../services/database', () => ({
  DatabaseService: {
    getBookmark: vi.fn(),
    getReadProgress: vi.fn(),
    saveReadProgress: vi.fn(),
    getSettings: vi.fn(),
    saveSettings: vi.fn(),
    setLastSyncTimestamp: vi.fn()
  }
}));

// Mock the export service
vi.mock('../../services/export-service', () => ({
  ExportService: {
    validateExportData: vi.fn()
  }
}));

describe('ImportService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockExportData = (overrides: Partial<ExportData> = {}): ExportData => ({
    version: '1.0',
    export_timestamp: '2023-01-01T12:00:00Z',
    reading_progress: [
      {
        bookmark_id: 1,
        progress: 0.5,
        last_read_at: '2023-01-01T12:00:00Z',
        reading_mode: 'readability' as const,
        scroll_position: 100,
        dark_mode_override: null
      },
      {
        bookmark_id: 2,
        progress: 0.8,
        last_read_at: '2023-01-02T12:00:00Z',
        reading_mode: 'original' as const,
        scroll_position: 200,
        dark_mode_override: 'dark' as const
      }
    ],
    app_settings: {
      sync_interval: 30,
      auto_sync: false,
      reading_mode: 'original' as const,
      theme_mode: 'light' as const
    },
    sync_metadata: {
      last_sync_timestamp: '2023-01-01T10:00:00Z'
    },
    ...overrides
  });

  describe('importData', () => {
    it('should successfully import all valid data', async () => {
      const mockData = createMockExportData();
      
      // Mock validation
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      
      // Mock existing bookmarks
      vi.mocked(DatabaseService.getBookmark).mockImplementation(async (id) => 
        ({ id, url: `https://example.com/${id}`, title: `Bookmark ${id}` } as any)
      );
      
      // Mock no existing reading progress
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      
      // Mock existing settings
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'existing-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability',
        theme_mode: 'system'
      });

      const result = await ImportService.importData(mockData);

      expect(result).toEqual({
        success: true,
        imported_progress_count: 2,
        skipped_progress_count: 0,
        imported_settings: true,
        imported_sync_metadata: true,
        errors: []
      });

      // Verify reading progress was saved
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledTimes(2);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(mockData.reading_progress[0]);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(mockData.reading_progress[1]);

      // Verify settings were merged and saved
      expect(DatabaseService.saveSettings).toHaveBeenCalledWith({
        linkding_url: 'https://linkding.example.com', // Preserved
        linkding_token: 'existing-token', // Preserved
        sync_interval: 30, // From import
        auto_sync: false, // From import
        reading_mode: 'original', // From import
        theme_mode: 'light' // From import
      });

      // Verify sync metadata was saved
      expect(DatabaseService.setLastSyncTimestamp).toHaveBeenCalledWith('2023-01-01T10:00:00Z');
    });

    it('should skip orphaned reading progress (bookmark does not exist)', async () => {
      const mockData = createMockExportData();
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      
      // Mock bookmark 1 exists, bookmark 2 does not
      vi.mocked(DatabaseService.getBookmark).mockImplementation(async (id) => 
        id === 1 ? ({ id, url: `https://example.com/${id}`, title: `Bookmark ${id}` } as any) : undefined
      );
      
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'existing-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      });

      const result = await ImportService.importData(mockData);

      expect(result.imported_progress_count).toBe(1);
      expect(result.skipped_progress_count).toBe(1);
      expect(result.success).toBe(true);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledTimes(1);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(mockData.reading_progress[0]);
    });

    it('should skip reading progress when existing data is newer', async () => {
      const mockData = createMockExportData();
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      vi.mocked(DatabaseService.getBookmark).mockImplementation(async (id) => 
        ({ id, url: `https://example.com/${id}`, title: `Bookmark ${id}` } as any)
      );
      
      // Mock existing reading progress with newer timestamp
      vi.mocked(DatabaseService.getReadProgress).mockImplementation(async (bookmarkId) => {
        if (bookmarkId === 1) {
          return {
            bookmark_id: 1,
            progress: 0.6,
            last_read_at: '2023-01-01T15:00:00Z', // Newer than import (12:00:00Z)
            reading_mode: 'original',
            scroll_position: 150,
            dark_mode_override: null
          };
        }
        return undefined; // No existing progress for bookmark 2
      });
      
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'existing-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      });

      const result = await ImportService.importData(mockData);

      expect(result.imported_progress_count).toBe(1); // Only bookmark 2
      expect(result.skipped_progress_count).toBe(1); // Bookmark 1 skipped (existing newer)
      expect(result.success).toBe(true);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledTimes(1);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(mockData.reading_progress[1]);
    });

    it('should import reading progress when import data is newer', async () => {
      const mockData = createMockExportData({
        reading_progress: [{
          bookmark_id: 1,
          progress: 0.9,
          last_read_at: '2023-01-01T15:00:00Z', // Newer timestamp
          reading_mode: 'readability',
          scroll_position: 300,
          dark_mode_override: 'dark'
        }]
      });
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue({ id: 1, url: 'https://example.com/1', title: 'Bookmark 1' } as any);
      
      // Mock existing reading progress with older timestamp
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue({
        bookmark_id: 1,
        progress: 0.5,
        last_read_at: '2023-01-01T12:00:00Z', // Older than import (15:00:00Z)
        reading_mode: 'original',
        scroll_position: 100,
        dark_mode_override: null
      });
      
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'existing-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      });

      const result = await ImportService.importData(mockData);

      expect(result.imported_progress_count).toBe(1);
      expect(result.skipped_progress_count).toBe(0);
      expect(result.success).toBe(true);
      expect(DatabaseService.saveReadProgress).toHaveBeenCalledWith(mockData.reading_progress[0]);
    });

    it('should handle invalid export data', async () => {
      const invalidData = { invalid: 'data' };
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(false);

      const result = await ImportService.importData(invalidData);

      expect(result).toEqual({
        success: false,
        imported_progress_count: 0,
        skipped_progress_count: 0,
        imported_settings: false,
        imported_sync_metadata: false,
        errors: ['Invalid export data format']
      });
    });

    it('should handle missing existing settings', async () => {
      const mockData = createMockExportData();
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue({ id: 1 } as any);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue(undefined); // No existing settings

      const result = await ImportService.importData(mockData);

      expect(result.imported_settings).toBe(false);
      expect(result.errors).toContain('Failed to import settings: No existing settings found. Please configure Linkding server settings first.');
    });

    it('should handle database errors gracefully', async () => {
      const mockData = createMockExportData();
      
      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      vi.mocked(DatabaseService.getBookmark).mockRejectedValue(new Error('Database connection failed'));

      const result = await ImportService.importData(mockData);

      expect(result.success).toBe(false);
      expect(result.imported_progress_count).toBe(0);
      expect(result.skipped_progress_count).toBe(2); // Both failed
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Database connection failed');
    });
  });

  describe('importFromFile', () => {
    it('should import data from valid JSON file', async () => {
      const mockData = createMockExportData();
      const jsonString = JSON.stringify(mockData);
      const mockFile = new File([jsonString], 'export.json', { type: 'application/json' });

      vi.mocked(ExportService.validateExportData).mockReturnValue(true);
      vi.mocked(DatabaseService.getBookmark).mockResolvedValue({ id: 1 } as any);
      vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
      vi.mocked(DatabaseService.getSettings).mockResolvedValue({
        linkding_url: 'https://linkding.example.com',
        linkding_token: 'existing-token',
        sync_interval: 60,
        auto_sync: true,
        reading_mode: 'readability'
      });

      const result = await ImportService.importFromFile(mockFile);

      expect(result.success).toBe(true);
      expect(result.imported_progress_count).toBe(2);
    });

    it('should handle invalid JSON file', async () => {
      const mockFile = new File(['invalid json'], 'export.json', { type: 'application/json' });

      const result = await ImportService.importFromFile(mockFile);

      expect(result.success).toBe(false);
      expect(result.errors[0]).toContain('Failed to read file');
    });
  });

  describe('validateImportFile', () => {
    it('should validate correct JSON file', async () => {
      const mockData = createMockExportData();
      const jsonString = JSON.stringify(mockData);
      const mockFile = new File([jsonString], 'export.json', { type: 'application/json' });

      vi.mocked(ExportService.validateExportData).mockReturnValue(true);

      const result = await ImportService.validateImportFile(mockFile);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject files that are too large', async () => {
      const largeFile = new File(['x'.repeat(101 * 1024 * 1024)], 'large.json', { type: 'application/json' });

      const result = await ImportService.validateImportFile(largeFile);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File too large (max 100MB)');
    });

    it('should reject non-JSON files', async () => {
      const textFile = new File(['some text'], 'file.txt', { type: 'text/plain' });

      const result = await ImportService.validateImportFile(textFile);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('File must be a JSON file');
    });

    it('should reject files with invalid JSON content', async () => {
      const invalidJsonFile = new File(['invalid json'], 'export.json', { type: 'application/json' });

      const result = await ImportService.validateImportFile(invalidJsonFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file');
    });

    it('should reject files with invalid export data structure', async () => {
      const invalidData = { version: '1.0', but: 'missing required fields' };
      const jsonString = JSON.stringify(invalidData);
      const mockFile = new File([jsonString], 'export.json', { type: 'application/json' });

      vi.mocked(ExportService.validateExportData).mockReturnValue(false);

      const result = await ImportService.validateImportFile(mockFile);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid export file format');
    });
  });
});