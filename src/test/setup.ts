import { beforeEach, afterEach, vi } from 'vitest';
/// <reference path="./types.d.ts" />

// Setup DOM environment
import '@testing-library/jest-dom/vitest';

// Mock Dexie liveQuery globally
vi.mock('dexie', async (importOriginal) => {
  const actual = await importOriginal() as any;
  
  // Create a proper liveQuery mock that returns an observable
  const mockLiveQuery = vi.fn().mockImplementation((queryFn: () => any) => {
    const mockSubscription = { unsubscribe: vi.fn() };
    
    const mockObservable = {
      subscribe: vi.fn((observer: any) => {
        try {
          const result = queryFn();
          // Handle both sync and async query results
          if (result && typeof (result as any).then === 'function') {
            (result as Promise<any>).then((value: any) => {
              observer.next(value);
            }).catch((error: any) => {
              observer.error?.(error);
            });
          } else {
            observer.next(result);
          }
        } catch (error) {
          observer.error?.(error);
        }
        return mockSubscription;
      })
    };
    
    return mockObservable;
  });
  
  return {
    ...actual,
    liveQuery: mockLiveQuery
  };
});

// Mock console.error globally to prevent stderr output in tests
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock fetch
global.fetch = vi.fn();

// Create truly persistent mock functions that are NOT vi.fn() spies
// These are regular functions that won't be affected by vi.clearAllMocks()
const persistentObserve = () => {};
const persistentUnobserve = () => {};
const persistentDisconnect = () => {};

// Mock IntersectionObserver with persistent implementations
// Use a regular function, not vi.fn(), for the constructor itself
global.IntersectionObserver = function(_callback: IntersectionObserverCallback, _options?: IntersectionObserverInit) {
  return {
    observe: persistentObserve,
    unobserve: persistentUnobserve,
    disconnect: persistentDisconnect,
  };
} as any;

// Setup fake IndexedDB for comprehensive database testing
import 'fake-indexeddb/auto';

// Additional IndexedDB globals that might be needed
const mockIDBKeyRange = {
  bound: vi.fn(),
  only: vi.fn(),
  lowerBound: vi.fn(),
  upperBound: vi.fn(),
};

// Ensure IDBKeyRange is available for any tests that might use it directly
if (!globalThis.IDBKeyRange) {
  Object.defineProperty(globalThis, 'IDBKeyRange', {
    value: mockIDBKeyRange,
    writable: true,
  });
}

// Minimal PWA Mock Infrastructure
// Only mock essential browser APIs that are actually used by production code
const mockServiceWorkerRegistration = {
  installing: null as any,
  waiting: null as any,
  active: null as any,
  scope: '/',
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  update: vi.fn().mockResolvedValue(undefined),
  unregister: vi.fn().mockResolvedValue(true),
  sync: {
    register: vi.fn().mockResolvedValue(undefined),
  },
};

const mockServiceWorkerContainer = {
  register: vi.fn().mockResolvedValue(mockServiceWorkerRegistration),
  ready: Promise.resolve(mockServiceWorkerRegistration),
  controller: null as any,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

// Make service worker container configurable for test customization
Object.defineProperty(navigator, 'serviceWorker', {
  value: mockServiceWorkerContainer,
  writable: true,
  configurable: true,
});

// Make essential mocks available globally for PWA tests that need them
Object.defineProperty(global, 'mockServiceWorkerRegistration', {
  value: mockServiceWorkerRegistration,
  writable: true,
});

Object.defineProperty(global, 'mockServiceWorkerContainer', {
  value: mockServiceWorkerContainer,
  writable: true,
});

// Mock matchMedia for theme service
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock Element Internals API for Material Web Components
if (!HTMLElement.prototype.attachInternals) {
  HTMLElement.prototype.attachInternals = function() {
    return {
      // Mock ElementInternals interface
      form: null,
      shadowRoot: null,
      willValidate: true,
      validity: {
        valid: true,
        valueMissing: false,
        typeMismatch: false,
        patternMismatch: false,
        tooLong: false,
        tooShort: false,
        rangeUnderflow: false,
        rangeOverflow: false,
        stepMismatch: false,
        badInput: false,
        customError: false,
      },
      validationMessage: '',
      checkValidity: () => true,
      reportValidity: () => true,
      setFormValue: () => {},
      setValidity: () => {},
      labels: [],
      ariaAtomic: null,
      ariaAutoComplete: null,
      ariaBusy: null,
      ariaChecked: null,
      ariaColCount: null,
      ariaColIndex: null,
      ariaColSpan: null,
      ariaCurrent: null,
      ariaDescription: null,
      ariaDisabled: null,
      ariaExpanded: null,
      ariaHasPopup: null,
      ariaHidden: null,
      ariaKeyShortcuts: null,
      ariaLabel: null,
      ariaLevel: null,
      ariaLive: null,
      ariaModal: null,
      ariaMultiLine: null,
      ariaMultiSelectable: null,
      ariaOrientation: null,
      ariaPlaceholder: null,
      ariaPosInSet: null,
      ariaPressed: null,
      ariaReadOnly: null,
      ariaRequired: null,
      ariaRoleDescription: null,
      ariaRowCount: null,
      ariaRowIndex: null,
      ariaRowSpan: null,
      ariaSelected: null,
      ariaSetSize: null,
      ariaSort: null,
      ariaValueMax: null,
      ariaValueMin: null,
      ariaValueNow: null,
      ariaValueText: null,
      role: null,
      // Additional properties for TypeScript compatibility
      states: new Set(),
      ariaBrailleLabel: null,
      ariaBrailleRoleDescription: null,
      ariaColIndexText: null,
      ariaRowIndexText: null,
      ariaInvalid: null,
      ariaRelevant: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    } as any;
  };
}

// Mock localStorage for comprehensive cleanup
const mockLocalStorage = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};

// Make it available globally for tests that need it
Object.defineProperty(global, 'localStorage', {
  value: mockLocalStorage,
  writable: true,
});

// Mock Web Animations API for Material Dialog components
if (!Element.prototype.animate) {
  Element.prototype.animate = function(_keyframes: any, _options?: any) {
    // Return a basic Animation-like object
    return {
      addEventListener: () => {},
      removeEventListener: () => {},
      cancel: () => {},
      finish: () => {},
      pause: () => {},
      play: () => {},
      reverse: () => {},
      updatePlaybackRate: () => {},
      currentTime: 0,
      effect: null,
      finished: Promise.resolve(),
      id: '',
      pending: false,
      playState: 'finished' as AnimationPlayState,
      playbackRate: 1,
      ready: Promise.resolve(),
      replaceState: 'active' as AnimationReplaceState,
      startTime: null,
      timeline: null,
      // Mock event listener methods
      oncancel: null,
      onfinish: null,
      onremove: null,
      // Additional methods that may be called
      commitStyles: () => {},
      persist: () => {},
    } as any;
  };
}


beforeEach(async () => {
  // Enable fake timers globally
  vi.useFakeTimers();
  
  // Clear specific mocks but don't touch IntersectionObserver since it uses persistent implementations
  if (global.fetch && vi.isMockFunction(global.fetch)) {
    (global.fetch as any).mockClear();
  }
  consoleErrorSpy.mockClear();
  
  // Always re-establish liveQuery mock to handle clearAllMocks calls in individual tests
  const { liveQuery } = await import('dexie');
  
  // Create the liveQuery mock implementation
  const liveQueryMock = vi.mocked(liveQuery);
  liveQueryMock.mockImplementation((queryFn: () => any) => {
    const mockSubscription = { unsubscribe: vi.fn() };
    
    const mockObservable = {
      subscribe: vi.fn((observer: any) => {
        try {
          const result = queryFn();
          // Handle both sync and async query results
          if (result && typeof (result as any).then === 'function') {
            (result as Promise<any>).then((value: any) => {
              observer.next(value);
            }).catch((error: any) => {
              observer.error?.(error);
            });
          } else {
            observer.next(result);
          }
        } catch (error) {
          observer.error?.(error);
        }
        return mockSubscription;
      })
    };
    
    return mockObservable as any;
  });
  
  // Note: IntersectionObserver uses persistent implementations that are immune to vi.clearAllMocks()
  // Individual test files can call vi.clearAllMocks() without breaking existing IntersectionObserver instances
});

// Global afterEach cleanup for comprehensive teardown
afterEach(() => {
  // Clear all pending timers to prevent memory leaks and cross-test interference
  vi.clearAllTimers();
  
  // Restore real timers after each test
  vi.useRealTimers();
  
  // Clean up DOM elements that might have been left behind
  const testElements = document.querySelectorAll('app-root, bookmark-reader, bookmark-list, bookmark-list-container, settings-panel, secure-iframe, md-dialog');
  testElements.forEach(element => {
    try {
      element.remove();
    } catch (error) {
      // Ignore cleanup errors for elements that might already be removed
    }
  });
  
  // Clean up any remaining children in document.body that might be test artifacts
  if (document.body && document.body.children) {
    Array.from(document.body.children).forEach(child => {
      // Only remove elements that look like test artifacts (not essential browser elements)
      if (child.tagName && !['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE'].includes(child.tagName)) {
        try {
          child.remove();
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });
  }
  
  // Clear document classes that might have been set by theme service or components
  document.documentElement.className = '';
  document.body.className = '';
  
  // Clear any style elements that might have been added by Material theme or components
  const dynamicStyles = document.querySelectorAll('style[data-material-theme], style[data-test]');
  dynamicStyles.forEach(style => {
    try {
      style.remove();
    } catch (error) {
      // Ignore cleanup errors
    }
  });
  
  // Reset any global state that might have been modified
  if (typeof window !== 'undefined') {
    // Clear any event listeners on window that might have been added
    // This is handled by components themselves during disconnection, but we ensure cleanup
    
    // Reset localStorage mock state if it was modified
    if (mockLocalStorage && typeof mockLocalStorage.clear === 'function') {
      mockLocalStorage.clear();
    }
    
    // Reset any global variables that might have been set by services
    // Most services should clean up after themselves, but we ensure global state is clean
  }
  
  // Comprehensive mock cleanup to prevent cross-test interference
  // Clear mock call history but preserve mock implementations
  if (global.fetch && vi.isMockFunction(global.fetch)) {
    (global.fetch as any).mockClear();
  }
  
  if (global.IntersectionObserver && vi.isMockFunction(global.IntersectionObserver)) {
    // Note: IntersectionObserver uses persistent implementations, so we don't clear it
    // This is intentional to prevent breaking subsequent tests
  }
  
  // Clear console mock calls
  if (consoleErrorSpy && typeof consoleErrorSpy.mockClear === 'function') {
    consoleErrorSpy.mockClear();
  }
  
  // Reset matchMedia mock if it exists
  if (window.matchMedia && vi.isMockFunction(window.matchMedia)) {
    const matchMediaMock = vi.mocked(window.matchMedia);
    matchMediaMock.mockClear();
  }

  // Reset essential PWA mocks for test isolation
  if (global.mockServiceWorkerContainer) {
    const container = global.mockServiceWorkerContainer;
    if (vi.isMockFunction(container.register)) {
      container.register.mockClear();
      container.register.mockResolvedValue(global.mockServiceWorkerRegistration);
    }
    if (vi.isMockFunction(container.addEventListener)) {
      container.addEventListener.mockClear();
    }
    if (vi.isMockFunction(container.removeEventListener)) {
      container.removeEventListener.mockClear();
    }

    // Reset controller state
    container.controller = null;
  }

  if (global.mockServiceWorkerRegistration) {
    const registration = global.mockServiceWorkerRegistration;
    if (vi.isMockFunction(registration.addEventListener)) {
      registration.addEventListener.mockClear();
    }
    if (vi.isMockFunction(registration.removeEventListener)) {
      registration.removeEventListener.mockClear();
    }
    if (vi.isMockFunction(registration.update)) {
      registration.update.mockClear();
      registration.update.mockResolvedValue(undefined);
    }
    if (vi.isMockFunction(registration.unregister)) {
      registration.unregister.mockClear();
      registration.unregister.mockResolvedValue(true);
    }

    // Reset service worker states
    registration.installing = null;
    registration.waiting = null;
    registration.active = null;
  }
  
  // Ensure no pending timers remain (this is also handled by vi.clearAllTimers but double-check)
  // Only check timer count if fake timers are currently active
  try {
    if (vi.getTimerCount && vi.getTimerCount() > 0) {
      vi.runAllTimers();
      vi.clearAllTimers();
    }
  } catch (error) {
    // vi.getTimerCount() throws when timers are not mocked, which is fine
    // Just ensure we clear any timers that might exist
    vi.clearAllTimers();
  }
});

