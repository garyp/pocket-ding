import { DatabaseService } from './database';
import type { ReadProgress } from '../types';

export interface ExportData {
  version: string;
  export_timestamp: string;
  reading_progress: ReadProgress[];
  app_settings: {
    sync_interval: number;
    auto_sync: boolean;
    reading_mode: 'original' | 'readability';
    theme_mode?: 'light' | 'dark' | 'system';
  };
  sync_metadata: {
    last_sync_timestamp: string | null;
  };
}

export class ExportService {
  private static readonly EXPORT_VERSION = '1.0';

  static async exportData(): Promise<ExportData> {
    try {
      // Get all reading progress records
      const readingProgress = await this.getAllReadingProgress();
      
      // Get app settings (excluding sensitive server data)
      const settings = await DatabaseService.getSettings();
      const appSettings: {
        sync_interval: number;
        auto_sync: boolean;
        reading_mode: 'original' | 'readability';
        theme_mode?: 'light' | 'dark' | 'system';
      } = {
        sync_interval: settings?.sync_interval || 60,
        auto_sync: settings?.auto_sync ?? true,
        reading_mode: settings?.reading_mode || 'readability' as const
      };
      
      if (settings?.theme_mode) {
        appSettings.theme_mode = settings.theme_mode;
      }

      // Get sync metadata
      const lastSyncTimestamp = await DatabaseService.getLastSyncTimestamp();

      const exportData: ExportData = {
        version: this.EXPORT_VERSION,
        export_timestamp: new Date().toISOString(),
        reading_progress: readingProgress,
        app_settings: appSettings,
        sync_metadata: {
          last_sync_timestamp: lastSyncTimestamp
        }
      };

      return exportData;
    } catch (error) {
      throw new Error(`Failed to export data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  static async exportToFile(): Promise<void> {
    try {
      const data = await this.exportData();
      const jsonString = JSON.stringify(data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      
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
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        // User cancelled the save dialog
        return;
      }
      throw new Error(`Failed to export to file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private static async getAllReadingProgress(): Promise<ReadProgress[]> {
    // Since there's no direct method to get all reading progress,
    // we need to query the database directly
    const { db } = await import('./database');
    return await db.readProgress.toArray();
  }

  static validateExportData(data: any): data is ExportData {
    if (!data || typeof data !== 'object') {
      return false;
    }

    // Check required fields
    if (typeof data.version !== 'string' ||
        typeof data.export_timestamp !== 'string' ||
        !Array.isArray(data.reading_progress) ||
        typeof data.app_settings !== 'object' ||
        typeof data.sync_metadata !== 'object') {
      return false;
    }

    // Validate reading progress entries
    for (const progress of data.reading_progress) {
      if (!this.isValidReadProgress(progress)) {
        return false;
      }
    }

    // Validate app settings
    const settings = data.app_settings;
    if (typeof settings.sync_interval !== 'number' ||
        typeof settings.auto_sync !== 'boolean' ||
        !['original', 'readability'].includes(settings.reading_mode)) {
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