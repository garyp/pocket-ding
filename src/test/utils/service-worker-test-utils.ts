import { vi } from 'vitest';

/**
 * Service Worker testing utilities for workflow tests.
 * Provides helpers for setting up service worker mocks that can be customized per test.
 */

export interface ServiceWorkerRegistrationMock {
  sync: {
    register: ReturnType<typeof vi.fn>;
    getTags: ReturnType<typeof vi.fn>;
  };
  periodicSync?: {
    register: ReturnType<typeof vi.fn>;
    unregister: ReturnType<typeof vi.fn>;
    getTags: ReturnType<typeof vi.fn>;
  };
  active: {
    postMessage: ReturnType<typeof vi.fn>;
  };
  installing: any;
  waiting: any;
  scope: string;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  unregister: ReturnType<typeof vi.fn>;
}

export interface ServiceWorkerContainerMock {
  ready: Promise<ServiceWorkerRegistrationMock>;
  register: ReturnType<typeof vi.fn>;
  controller: any;
  addEventListener: ReturnType<typeof vi.fn>;
  removeEventListener: ReturnType<typeof vi.fn>;
}

/**
 * Create a fresh service worker registration mock for testing
 */
export function createServiceWorkerRegistrationMock(options: {
  includePeriodicSync?: boolean;
} = {}): ServiceWorkerRegistrationMock {
  const registration: ServiceWorkerRegistrationMock = {
    sync: {
      register: vi.fn().mockResolvedValue(undefined),
      getTags: vi.fn().mockResolvedValue([]),
    },
    active: {
      postMessage: vi.fn(),
    },
    installing: null,
    waiting: null,
    scope: '/',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    update: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(true),
  };

  if (options.includePeriodicSync !== false) {
    registration.periodicSync = {
      register: vi.fn().mockResolvedValue(undefined),
      unregister: vi.fn().mockResolvedValue(undefined),
      getTags: vi.fn().mockResolvedValue([]),
    };
  }

  return registration;
}

/**
 * Create a service worker container mock with custom registration
 */
export function createServiceWorkerContainerMock(
  registration: ServiceWorkerRegistrationMock
): ServiceWorkerContainerMock {
  return {
    ready: Promise.resolve(registration),
    register: vi.fn().mockResolvedValue(registration),
    controller: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
}

/**
 * Setup service worker mocks for a specific test scenario
 */
export function setupServiceWorkerMock(options: {
  includePeriodicSync?: boolean;
  simulateError?: boolean;
  errorMessage?: string;
} = {}): {
  registration: ServiceWorkerRegistrationMock;
  container: ServiceWorkerContainerMock;
} {
  const mockOptions: any = {};
  if (options.includePeriodicSync !== undefined) {
    mockOptions.includePeriodicSync = options.includePeriodicSync;
  }
  const registration = createServiceWorkerRegistrationMock(mockOptions);

  let container: ServiceWorkerContainerMock;

  if (options.simulateError) {
    const errorMessage = options.errorMessage || 'Service Worker not available';
    const rejectedPromise = Promise.reject(new Error(errorMessage));
    // Handle the rejection to prevent unhandled promise rejection
    rejectedPromise.catch(() => {
      // Intentionally empty - we want this to be rejected but handled
    });

    container = {
      ready: rejectedPromise,
      register: vi.fn().mockRejectedValue(new Error(errorMessage)),
      controller: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
  } else {
    container = createServiceWorkerContainerMock(registration);
  }

  // Replace the global navigator.serviceWorker
  Object.defineProperty(navigator, 'serviceWorker', {
    value: container,
    writable: true,
    configurable: true,
  });

  return { registration, container };
}

/**
 * Setup service worker for browser without Periodic Sync API
 */
export function setupLimitedServiceWorkerMock(): {
  registration: ServiceWorkerRegistrationMock;
  container: ServiceWorkerContainerMock;
} {
  return setupServiceWorkerMock({ includePeriodicSync: false });
}

/**
 * Setup service worker that fails to register
 */
export function setupFailingServiceWorkerMock(errorMessage?: string): {
  registration: ServiceWorkerRegistrationMock;
  container: ServiceWorkerContainerMock;
} {
  const mockOptions: any = {
    simulateError: true
  };
  if (errorMessage !== undefined) {
    mockOptions.errorMessage = errorMessage;
  }
  return setupServiceWorkerMock(mockOptions);
}