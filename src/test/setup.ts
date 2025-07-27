import { beforeEach, vi } from 'vitest';

// Setup DOM environment
import '@testing-library/jest-dom/vitest';

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

// Mock IndexedDB
const mockIDBKeyRange = {
  bound: vi.fn(),
  only: vi.fn(),
  lowerBound: vi.fn(),
  upperBound: vi.fn(),
};

Object.defineProperty(globalThis, 'IDBKeyRange', {
  value: mockIDBKeyRange,
  writable: true,
});

// Mock service worker registration
Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    register: vi.fn().mockResolvedValue({}),
  },
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

beforeEach(() => {
  // Clear specific mocks but don't touch IntersectionObserver since it uses persistent implementations
  if (global.fetch && vi.isMockFunction(global.fetch)) {
    (global.fetch as any).mockClear();
  }
  consoleErrorSpy.mockClear();
  
  // Note: IntersectionObserver uses persistent implementations that are immune to vi.clearAllMocks()
  // Individual test files can call vi.clearAllMocks() without breaking existing IntersectionObserver instances
});