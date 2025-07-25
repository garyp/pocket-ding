import { DatabaseService } from './database';
import type { ReadProgress } from '../types';

export interface ExportData {
  version: string;
  export_timestamp: string;
  reading_progress: ReadProgress[];
  app_settings: {
    sync_interval?: number;
    auto_sync?: boolean;
    reading_mode?: 'original' | 'readability';
    theme_mode?: 'light' | 'dark' | 'system';
  };
}

export interface ExportResult {
  success: boolean;
  warnings: string[];
}

export class ExportService {
  private static readonly EXPORT_VERSION = '1.0';

  static async exportData(): Promise<ExportData> {
    try {
      // Get all reading progress records using the data abstraction
      const readingProgress = await DatabaseService.getAllReadProgress();
      
      // Get app settings (excluding sensitive server data and default values)
      const settings = await DatabaseService.getSettings();
      const appSettings: {
        sync_interval?: number;
        auto_sync?: boolean;
        reading_mode?: 'original' | 'readability';
        theme_mode?: 'light' | 'dark' | 'system';
      } = {};
      
      // Only export settings that are explicitly set (not defaults)
      if (settings?.sync_interval !== undefined && settings.sync_interval !== 60) {
        appSettings.sync_interval = settings.sync_interval;
      }
      if (settings?.auto_sync !== undefined && settings.auto_sync !== true) {
        appSettings.auto_sync = settings.auto_sync;
      }
      if (settings?.reading_mode !== undefined && settings.reading_mode !== 'readability') {
        appSettings.reading_mode = settings.reading_mode;
      }
      if (settings?.theme_mode !== undefined && settings.theme_mode !== 'system') {
        appSettings.theme_mode = settings.theme_mode;
      }

      const exportData: ExportData = {
        version: this.EXPORT_VERSION,
        export_timestamp: new Date().toISOString(),
        reading_progress: readingProgress,
        app_settings: appSettings
      };

      return exportData;
    } catch (error) {
      throw new Error(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async exportToFile(): Promise<ExportResult> {
    const warnings: string[] = [];
    
    try {
      const data = await this.exportData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
      // Check file size and warn if over 100MB
      const maxSize = 100 * 1024 * 1024; // 100MB
      if (blob.size > maxSize) {
        const fileSizeMB = (blob.size / (1024 * 1024)).toFixed(1);
        warnings.push(`Export file size is ${fileSizeMB}MB, which exceeds the recommended 100MB limit for imports. The file may be difficult to import.`);
      }
      
      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `pocket-ding-export-${timestamp}.json`;
      
      // Use modern File API to download
      if ('showSaveFilePicker' in window) {
        // Use File System Access API if available
        const fileHandle = await (window as any).showSaveFilePicker({
          suggestedName: filename,
          types: [{
            description: 'JSON files',
            accept: { 'application/json': ['.json'] }
          }]
        });
        
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
      } else {
        // Fallback to download link
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
      
      return { success: true, warnings };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled the save dialog - treat as successful no-op
        return { success: true, warnings: [] };
      }
      throw new Error(`Failed to export to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }


  static validateExportData(data: any): data is ExportData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required fields
    if (typeof data.version !== 'string' ||
        typeof data.export_timestamp !== 'string' ||
        !Array.isArray(data.reading_progress) ||
        typeof data.app_settings !== 'object') {
      return false;
    }

    // Validate reading progress entries
    for (const progress of data.reading_progress) {
      if (!this.isValidReadProgress(progress)) {
        return false;
      }
    }

    // Validate app settings (all fields are optional)
    const settings = data.app_settings;
    if (settings.sync_interval !== undefined && typeof settings.sync_interval !== 'number') {
      return false;
    }
    if (settings.auto_sync !== undefined && typeof settings.auto_sync !== 'boolean') {
      return false;
    }
    if (settings.reading_mode !== undefined && !['original', 'readability'].includes(settings.reading_mode)) {
      return false;
    }
    if (settings.theme_mode !== undefined && !['light', 'dark', 'system'].includes(settings.theme_mode)) {
      return false;
    }

    return true;
  }

  private static isValidReadProgress(progress: any): progress is ReadProgress {
    return (
      typeof progress === 'object' &&
      typeof progress.bookmark_id === 'number' &&
      typeof progress.progress === 'number' &&
      typeof progress.last_read_at === 'string' &&
      ['original', 'readability'].includes(progress.reading_mode) &&
      typeof progress.scroll_position === 'number' &&
      (progress.dark_mode_override === null || 
       progress.dark_mode_override === undefined ||
       ['light', 'dark'].includes(progress.dark_mode_override))
    );
  }
}