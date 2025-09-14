/// <reference lib="webworker" />

// Extend ServiceWorkerRegistration with sync APIs
interface ServiceWorkerRegistration {
  sync?: SyncManager;
  periodicSync?: PeriodicSyncManager;
}

interface SyncManager {
  register(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
  getTags(): Promise<string[]>;
}

interface SyncEvent extends ExtendableEvent {
  tag: string;
  lastChance: boolean;
}

interface PeriodicSyncEvent extends ExtendableEvent {
  tag: string;
}

// Extend ServiceWorkerGlobalScope with sync event listeners
interface ServiceWorkerGlobalScopeEventMap {
  'sync': SyncEvent;
  'periodicsync': PeriodicSyncEvent;
}

// Export to make this a module
export {};