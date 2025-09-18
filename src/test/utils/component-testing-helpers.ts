import { LitElement } from 'lit';
import { waitForComponent, waitForComponentReady } from './component-aware-wait-for';
import { initializeTestServices, cleanupTestServices, waitForAppStability } from './service-initialization-helpers';
import type { AppSettings } from '../../types';

/**
 * Streamlined component testing helpers for workflow tests.
 * These utilities provide a simplified API for testing components with real services.
 */

export interface ComponentTestEnvironment {
  appRoot: import('../../components/app-root').AppRoot;
  settingsPanel: import('../../components/settings-panel').SettingsPanel | null;
  navigate: (view: 'bookmarks' | 'settings' | 'reader' | 'debug') => Promise<void>;
  cleanup: () => Promise<void>;
}

/**
 * Create a complete test environment with real components and services
 */
export async function createTestEnvironment(initialState?: {
  settings?: Partial<AppSettings>;
  view?: 'bookmarks' | 'settings' | 'reader' | 'debug';
  serviceWorkerOptions?: any;
}): Promise<ComponentTestEnvironment> {

  // Initialize services first
  const testAppState: any = {};
  if (initialState?.settings !== undefined) {
    testAppState.settings = initialState.settings;
  }
  if (initialState?.serviceWorkerOptions !== undefined) {
    testAppState.serviceWorkerOptions = initialState.serviceWorkerOptions;
  }
  await initializeTestServices(testAppState);

  // Create app root component
  const appRoot = document.createElement('app-root') as import('../../components/app-root').AppRoot;
  document.body.appendChild(appRoot);

  // Wait for initial render
  await waitForComponentReady(appRoot);
  await waitForAppStability();

  let settingsPanel: import('../../components/settings-panel').SettingsPanel | null = null;

  const navigate = async (view: 'bookmarks' | 'settings' | 'reader' | 'debug') => {
    // Set the view
    (appRoot as any).currentView = view;
    await appRoot.updateComplete;

    // If navigating to settings, wait for settings panel to be available
    if (view === 'settings') {
      await waitForComponent(() => {
        const panel = appRoot.shadowRoot?.querySelector('settings-panel');
        if (!panel) {
          throw new Error('Settings panel not found');
        }
        return panel;
      });

      settingsPanel = appRoot.shadowRoot?.querySelector('settings-panel') as import('../../components/settings-panel').SettingsPanel;
      if (settingsPanel) {
        await waitForComponentReady(settingsPanel);
      }
    } else {
      settingsPanel = null;
    }

    await waitForAppStability();
  };

  const cleanup = async () => {
    try {
      if (appRoot && appRoot.parentNode) {
        appRoot.parentNode.removeChild(appRoot);
      }
    } catch (error) {
      // Ignore cleanup errors
    }
    await cleanupTestServices();
  };

  // Navigate to initial view if specified
  if (initialState?.view) {
    await navigate(initialState.view);
  }

  return {
    appRoot,
    settingsPanel,
    navigate,
    cleanup
  };
}

/**
 * Simulate user input on a form field
 */
export async function simulateUserInput(element: HTMLInputElement | HTMLTextAreaElement, value: string): Promise<void> {
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));

  // Wait for any reactive updates
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Simulate user checkbox interaction
 */
export async function simulateCheckboxToggle(element: HTMLInputElement, checked: boolean): Promise<void> {
  element.checked = checked;
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Wait for any reactive updates
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Simulate user button click
 */
export async function simulateButtonClick(element: HTMLButtonElement): Promise<void> {
  element.click();

  // Wait for any reactive updates
  await new Promise(resolve => setTimeout(resolve, 10));
}

/**
 * Wait for a specific condition to be met in the component
 */
export async function waitForCondition<T>(
  condition: () => T | null | undefined,
  options: {
    timeout?: number;
    interval?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  const timeout = options.timeout || 5000;
  const interval = options.interval || 50;
  const errorMessage = options.errorMessage || 'Condition not met within timeout';

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const check = () => {
      const result = condition();
      if (result !== null && result !== undefined) {
        resolve(result);
        return;
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(errorMessage));
        return;
      }

      setTimeout(check, interval);
    };

    check();
  });
}

/**
 * Get an element from component shadow DOM with retry logic
 */
export async function getElementFromShadow<T extends Element>(
  component: LitElement,
  selector: string,
  options: {
    timeout?: number;
    errorMessage?: string;
  } = {}
): Promise<T> {
  return waitForCondition(
    () => component.shadowRoot?.querySelector(selector) as T,
    {
      ...options,
      errorMessage: options.errorMessage || `Element with selector "${selector}" not found`
    }
  );
}