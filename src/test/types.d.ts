/// <reference types="vitest/globals" />

// Test environment type extensions
declare global {
  // PWA Mock types for test environment
  var mockServiceWorkerRegistration: {
    installing: any;
    waiting: any;
    active: any;
    scope: string;
    addEventListener: any;
    removeEventListener: any;
    update: any;
    unregister: any;
    pushManager: any;
    sync: any;
    navigationPreload: any;
  };

  var mockServiceWorkerContainer: {
    register: any;
    ready: Promise<any>;
    controller: any;
    addEventListener: any;
    removeEventListener: any;
    getRegistration: any;
    getRegistrations: any;
    startMessages: any;
  };

  var mockCache: {
    match: any;
    matchAll: any;
    add: any;
    addAll: any;
    put: any;
    delete: any;
    keys: any;
  };

  var mockCacheStorage: {
    open: any;
    delete: any;
    has: any;
    keys: any;
    match: any;
  };

  var mockStorageManager: {
    estimate: any;
    persist: any;
    persisted: any;
    getDirectory: any;
  };
}

export {};