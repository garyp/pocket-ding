import { type ReactiveController, type ReactiveControllerHost } from 'lit';
import { ExportService } from '../services/export-service';
import { ImportService, type ImportResult } from '../services/import-service';

export interface DataManagementState {
  isExporting: boolean;
  isImporting: boolean;
  importResult: ImportResult | null;
  importFileInput: HTMLInputElement | null;
  testStatus: 'idle' | 'testing' | 'success' | 'error';
  testMessage: string;
}

export class DataManagementController implements ReactiveController {
  private host: ReactiveControllerHost;
  
  public state: DataManagementState = {
    isExporting: false,
    isImporting: false,
    importResult: null,
    importFileInput: null,
    testStatus: 'idle',
    testMessage: ''
  };

  constructor(host: ReactiveControllerHost) {
    this.host = host;
    host.addController(this);
  }

  hostConnected() {
    // Controller lifecycle - called when host connects
  }

  hostDisconnected() {
    // Clean up file input if it exists
    if (this.state.importFileInput) {
      this.state.importFileInput.remove();
      this.state.importFileInput = null;
    }
  }

  private updateState(updates: Partial<DataManagementState>) {
    Object.assign(this.state, updates);
    this.host.requestUpdate();
  }

  async exportData(): Promise<void> {
    this.updateState({
      isExporting: true,
      testStatus: 'idle',
      importResult: null
    });

    try {
      await ExportService.exportToFile();
      this.updateState({
        testStatus: 'success',
        testMessage: 'Data exported successfully!'
      });
    } catch (error) {
      console.error('Export failed:', error);
      this.updateState({
        testStatus: 'error',
        testMessage: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      });
    } finally {
      this.updateState({ isExporting: false });
    }
  }

  startImport(): void {
    // Create a hidden file input if it doesn't exist
    if (!this.state.importFileInput) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,application/json';
      input.style.display = 'none';
      input.addEventListener('change', this.handleFileSelected.bind(this));
      
      // Append to the host element's shadow root or document body
      const hostElement = this.host as any;
      if (hostElement.shadowRoot) {
        hostElement.shadowRoot.appendChild(input);
      } else {
        document.body.appendChild(input);
      }
      
      this.updateState({ importFileInput: input });
    }
    
    this.state.importFileInput?.click();
  }

  private async handleFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    
    if (!file) return;

    this.updateState({
      isImporting: true,
      testStatus: 'idle',
      importResult: null
    });

    try {
      // Validate file first
      const validation = await ImportService.validateImportFile(file);
      if (!validation.valid) {
        this.updateState({
          testStatus: 'error',
          testMessage: validation.error || 'Invalid file'
        });
        return;
      }

      // Perform import
      const result = await ImportService.importFromFile(file);
      this.updateState({ importResult: result });

      if (result.success) {
        this.updateState({
          testStatus: 'success',
          testMessage: 'Data imported successfully!'
        });
        
        // Trigger settings refresh if settings were imported
        if (result.imported_settings) {
          this.dispatchSettingsUpdated();
        }
      } else {
        this.updateState({
          testStatus: 'error',
          testMessage: 'Import completed with errors'
        });
      }
    } catch (error) {
      console.error('Import failed:', error);
      this.updateState({
        testStatus: 'error',
        testMessage: `Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        importResult: {
          success: false,
          imported_progress_count: 0,
          skipped_progress_count: 0,
          orphaned_progress_count: 0,
          imported_settings: false,
          imported_sync_metadata: false,
          errors: [error instanceof Error ? error.message : 'Unknown error']
        }
      });
    } finally {
      this.updateState({ isImporting: false });
      // Clear the input value so the same file can be selected again
      if (input) {
        input.value = '';
      }
    }
  }

  private dispatchSettingsUpdated(): void {
    const hostElement = this.host as any;
    if (hostElement.dispatchEvent) {
      hostElement.dispatchEvent(new CustomEvent('settings-updated', {
        bubbles: true,
        composed: true
      }));
    }
  }

  clearMessages(): void {
    this.updateState({
      testStatus: 'idle',
      testMessage: '',
      importResult: null
    });
  }
}