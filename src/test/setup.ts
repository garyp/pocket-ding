import { beforeEach, vi } from 'vitest';

// Setup DOM environment
import '@testing-library/jest-dom/vitest';

// Mock console.error globally to prevent stderr output in tests
const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

// Mock fetch
global.fetch = vi.fn();

// Mock IntersectionObserver
global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

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

// Mock localStorage with actual storage behavior
const createLocalStorageMock = () => {
  let store: { [key: string]: string } = {};

  const getItem = vi.fn((key: string) => store[key] || null);
  const setItem = vi.fn((key: string, value: string) => {
    store[key] = value.toString();
  });
  const removeItem = vi.fn((key: string) => {
    delete store[key];
  });
  const clear = vi.fn(() => {
    store = {};
  });
  const key = vi.fn((index: number) => {
    const keys = Object.keys(store);
    return keys[index] || null;
  });

  return {
    getItem,
    setItem,
    removeItem,
    clear,
    key,
    get length() {
      return Object.keys(store).length;
    },
  };
};

const localStorageMock = createLocalStorageMock();
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

beforeEach(() => {
  vi.clearAllMocks();
  consoleErrorSpy.mockClear();
  
  // Reset localStorage mock state  
  localStorageMock.clear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
  localStorageMock.removeItem.mockClear();
  localStorageMock.clear.mockClear();
});