import { DatabaseService } from './database';
import { ExportService, type ExportData } from './export-service';
import type { ReadProgress, AppSettings } from '../types';

export interface ImportResult {
  success: boolean;
  imported_progress_count: number;
  skipped_progress_count: number;
  orphaned_progress_count: number;
  imported_settings: boolean;
  imported_sync_metadata: boolean;
  errors: string[];
}

export class ImportService {
  static async importFromFile(file: File): Promise<ImportResult> {
    try {
      const jsonText = await this.readFileAsText(file);
      const data = JSON.parse(jsonText);
      return await this.importData(data);
    } catch (error) {
      return {
        success: false,
        imported_progress_count: 0,
        skipped_progress_count: 0,
        orphaned_progress_count: 0,
        imported_settings: false,
        imported_sync_metadata: false,
        errors: [`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  static async importData(data: any): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      imported_progress_count: 0,
      skipped_progress_count: 0,
      orphaned_progress_count: 0,
      imported_settings: false,
      imported_sync_metadata: false,
      errors: []
    };

    try {
      // Validate export data format
      if (!ExportService.validateExportData(data)) {
        result.errors.push('Invalid export data format');
        return result;
      }

      const exportData = data as ExportData;

      // Import reading progress with timestamp precedence
      const progressResult = await this.importReadingProgress(exportData.reading_progress);
      result.imported_progress_count = progressResult.imported;
      result.skipped_progress_count = progressResult.skipped;
      result.orphaned_progress_count = progressResult.orphaned;
      result.errors.push(...progressResult.errors);

      // Import app settings (excluding server configuration)
      try {
        await this.importAppSettings(exportData.app_settings);
        result.imported_settings = true;
      } catch (error) {
        result.errors.push(`Failed to import settings: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      // Import sync metadata (if present in legacy exports)
      try {
        const legacyData = data as any;
        if (legacyData.sync_metadata?.last_sync_timestamp) {
          await DatabaseService.setLastSyncTimestamp(legacyData.sync_metadata.last_sync_timestamp);
          result.imported_sync_metadata = true;
        }
      } catch (error) {
        result.errors.push(`Failed to import sync metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      result.errors.push(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return result;
    }
  }

  private static async importReadingProgress(progressList: ReadProgress[]): Promise<{
    imported: number;
    skipped: number;
    orphaned: number;
    errors: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    let orphaned = 0;
    const errors: string[] = [];

    for (const importProgress of progressList) {
      try {
        // Check if bookmark exists in the database
        const bookmark = await DatabaseService.getBookmark(importProgress.bookmark_id);
        if (!bookmark) {
          // Track orphaned progress separately (bookmark doesn't exist)
          orphaned++;
          continue;
        }

        // Get existing reading progress for this bookmark
        const existingProgress = await DatabaseService.getReadProgress(importProgress.bookmark_id);

        if (existingProgress) {
          // Compare timestamps to decide whether to import
          const existingTimestamp = new Date(existingProgress.last_read_at).getTime();
          const importTimestamp = new Date(importProgress.last_read_at).getTime();

          if (importTimestamp <= existingTimestamp) {
            // Import data is older or same age, skip
            skipped++;
            continue;
          }
        }

        // Import the reading progress (either no existing data or import is newer)
        await DatabaseService.saveReadProgress(importProgress);
        imported++;
      } catch (error) {
        errors.push(`Failed to import progress for bookmark ${importProgress.bookmark_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        skipped++;
      }
    }

    return { imported, skipped, orphaned, errors };
  }

  private static async importAppSettings(importSettings: ExportData['app_settings']): Promise<void> {
    // Get current settings to preserve server configuration
    const currentSettings = await DatabaseService.getSettings();

    if (!currentSettings) {
      throw new Error('No existing settings found. Please configure Linkding server settings first.');
    }

    // Merge import settings with existing server configuration
    const mergedSettings: AppSettings = {
      ...currentSettings // Preserve linkding_url and linkding_token
    };

    // Only update settings that are present in the import
    if (importSettings.auto_sync !== undefined) {
      mergedSettings.auto_sync = importSettings.auto_sync;
    }
    if (importSettings.reading_mode !== undefined) {
      mergedSettings.reading_mode = importSettings.reading_mode;
    }
    if (importSettings.theme_mode !== undefined) {
      mergedSettings.theme_mode = importSettings.theme_mode;
    }

    await DatabaseService.saveSettings(mergedSettings);
  }

  private static async readFileAsText(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          resolve(e.target.result);
        } else {
          reject(new Error('Failed to read file as text'));
        }
      };
      reader.onerror = () => reject(new Error('File reading error'));
      reader.readAsText(file);
    });
  }

  static async validateImportFile(file: File): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check file size (reasonable limit for JSON)
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (file.size > maxSize) {
        return { valid: false, error: 'File too large (max 100MB)' };
      }

      // Check file type
      if (file.type !== 'application/json' && !file.name.toLowerCase().endsWith('.json')) {
        return { valid: false, error: 'File must be a JSON file' };
      }

      // Try to parse as JSON and validate structure
      const text = await this.readFileAsText(file);
      const data = JSON.parse(text);
      
      if (!ExportService.validateExportData(data)) {
        return { valid: false, error: 'Invalid export file format' };
      }

      return { valid: true };
    } catch (error) {
      return { 
        valid: false, 
        error: `Invalid file: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }
}