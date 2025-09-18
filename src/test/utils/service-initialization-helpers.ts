import { vi } from 'vitest';
import { TestDatabaseService } from './test-database-service';
import { setupServiceWorkerMock } from './service-worker-test-utils';
import type { AppSettings } from '../../types';

/**
 * Service initialization helpers for workflow tests.
 * These utilities set up the application services in a predictable state
 * for testing real user workflows with minimal mocking.
 */

export interface TestAppState {
  settings?: Partial<AppSettings>;
  serviceWorkerOptions?: {
    includePeriodicSync?: boolean;
    simulateError?: boolean;
    errorMessage?: string;
  };
}

/**
 * Initialize all application services for testing
 */
export async function initializeTestServices(state: TestAppState = {}): Promise<void> {
  // Clean up any existing state
  await cleanupTestServices();

  // Initialize test database with predictable data
  await TestDatabaseService.initialize();

  // Set up specific settings if provided
  if (state.settings) {
    await TestDatabaseService.setSettings(state.settings);
  }

  // Set up service worker mock
  const swOptions = state.serviceWorkerOptions || { includePeriodicSync: true };
  setupServiceWorkerMock(swOptions);

  // Initialize real services
  const { SettingsService } = await import('../../services/settings-service');
  const { DebugService } = await import('../../services/debug-service');

  await SettingsService.initialize();
  DebugService.initialize();

  // Wait for services to stabilize
  await TestDatabaseService.waitForUpdates();
}

/**
 * Clean up all test services
 */
export async function cleanupTestServices(): Promise<void> {
  try {
    // Clean up database
    await TestDatabaseService.cleanup();

    // Clean up settings service
    const { SettingsService } = await import('../../services/settings-service');
    SettingsService.cleanup();

    // Clean up theme service if it was initialized
    try {
      const { ThemeService } = await import('../../services/theme-service');
      ThemeService.reset();
    } catch (error) {
      // Ignore if theme service is mocked
    }
  } catch (error) {
    console.warn('Error during test service cleanup:', error);
  }
}

/**
 * Wait for application to reach a stable state after changes
 */
export async function waitForAppStability(_timeoutMs: number = 2000): Promise<void> {
  await TestDatabaseService.waitForUpdates();

  // Additional wait for component updates
  await new Promise(resolve => setTimeout(resolve, 100));

  // Advance timers if using fake timers
  try {
    if (vi.getTimerCount && vi.getTimerCount() > 0) {
      vi.advanceTimersByTime(200);
    }
  } catch (error) {
    // Ignore if not using fake timers
  }
}

/**
 * Create a test environment for sync workflows
 */
export async function setupSyncTestEnvironment(options: {
  settings?: Partial<AppSettings>;
  hasPeriodicSync?: boolean;
  serviceWorkerError?: boolean;
} = {}): Promise<{
  settings: AppSettings;
  mockRegistration: any;
}> {
  const testSettings: Partial<AppSettings> = {
    linkding_url: 'https://demo.linkding.net',
    linkding_token: 'test-token-123',
    auto_sync: false,
    reading_mode: 'original' as const,
    ...options.settings
  };

  await initializeTestServices({
    settings: testSettings,
    serviceWorkerOptions: {
      includePeriodicSync: options.hasPeriodicSync !== false,
      simulateError: options.serviceWorkerError || false
    }
  });

  // Get the mock registration for assertions
  const mockRegistration = (global as any).mockServiceWorkerRegistration;

  return {
    settings: TestDatabaseService.getCurrentSettings(),
    mockRegistration
  };
}