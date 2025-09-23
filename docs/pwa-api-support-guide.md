# PWA API Support Detection and Graceful Degradation Guide

## Overview

This guide provides comprehensive patterns for detecting and gracefully handling varying levels of browser API support for PWA sync functionality. It focuses on practical implementation patterns that work across different browsers with varying API support levels.

## Key APIs for PWA Sync Functionality

### 1. Web Locks API
**Purpose**: Coordinate resource access across tabs, windows, and workers to prevent race conditions during sync operations.

**Browser Support (2025)**:
- ✅ Chrome 69+, Firefox 96+, Safari 15.4+, Edge 79+
- 🔒 Requires HTTPS secure context
- ✅ Excellent support across all major browsers

**Feature Detection**:
```typescript
interface BrowserCapabilities {
  webLocks: boolean;
}

function detectWebLocksSupport(): boolean {
  return 'locks' in navigator && typeof navigator.locks.request === 'function';
}

// Usage example
const capabilities: BrowserCapabilities = {
  webLocks: detectWebLocksSupport()
};

if (capabilities.webLocks) {
  console.log('Web Locks API available - can prevent sync race conditions');
} else {
  console.log('Web Locks API not available - very old browser detected');
}
```

**Implementation**:
```typescript
class SyncCoordinator {
  #activeSync: string | null = null;

  async acquireSyncLock(syncId: string): Promise<boolean> {
    try {
      await navigator.locks.request(`sync-${syncId}`, { ifAvailable: true }, async (lock) => {
        if (lock) {
          this.#activeSync = syncId;
          return new Promise(resolve => {
            // Lock held until sync completes
            // Release via this.releaseSyncLock()
          });
        }
        throw new Error('Lock not available');
      });
      return true;
    } catch (error) {
      console.warn('Failed to acquire sync lock:', error);
      return false;
    }
  }

  releaseSyncLock(): void {
    // Lock automatically released when promise resolves
    this.#activeSync = null;
  }
}
```

### 2. Background Sync API
**Purpose**: Queue sync operations to run when network connectivity is restored.

**Browser Support (2025)**:
- ✅ Chrome 49+, Edge 79+, Android browsers
- ❌ Firefox, Safari, iOS Safari

**Feature Detection**:
```typescript
interface SyncCapabilities {
  backgroundSync: boolean;
  periodicSync: boolean;
}

async function detectSyncSupport(): Promise<SyncCapabilities> {
  const capabilities: SyncCapabilities = {
    backgroundSync: false,
    periodicSync: false
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;

      // Check Background Sync
      capabilities.backgroundSync = 'sync' in registration;

      // Check Periodic Background Sync
      capabilities.periodicSync = 'periodicSync' in registration;

    } catch (error) {
      console.warn('Service worker not available:', error);
    }
  }

  return capabilities;
}
```

**Implementation with Progressive Enhancement**:
```typescript
class SyncManager {
  #capabilities: SyncCapabilities | null = null;
  #fallbackQueue: Array<{ action: string; data: any; timestamp: number }> = [];

  async initialize(): Promise<void> {
    this.#capabilities = await detectSyncSupport();

    if (!this.#capabilities.backgroundSync) {
      console.log('Background Sync not supported, using manual sync strategy');
      this.#setupFallbackSync();
    }
  }

  async requestSync(immediate = false): Promise<void> {
    if (this.#capabilities?.backgroundSync && !immediate) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-bookmarks');
        console.log('Background sync registered');
        return;
      } catch (error) {
        console.warn('Background sync registration failed:', error);
      }
    }

    // Fallback: immediate sync or queue for later
    if (navigator.onLine) {
      await this.#performImmediateSync();
    } else {
      this.#queueSyncForWhenOnline();
    }
  }

  #setupFallbackSync(): void {
    // Listen for online events to process queued syncs
    window.addEventListener('online', () => {
      if (this.#fallbackQueue.length > 0) {
        console.log('Back online, processing queued syncs');
        this.#processFallbackQueue();
      }
    });

    // Periodic check for queued items (when Background Sync unavailable)
    setInterval(() => {
      if (navigator.onLine && this.#fallbackQueue.length > 0) {
        this.#processFallbackQueue();
      }
    }, 60000); // Check every minute
  }

  #queueSyncForWhenOnline(): void {
    this.#fallbackQueue.push({
      action: 'sync-bookmarks',
      data: { timestamp: Date.now() },
      timestamp: Date.now()
    });
    console.log('Sync queued for when online');
  }

  async #processFallbackQueue(): Promise<void> {
    while (this.#fallbackQueue.length > 0 && navigator.onLine) {
      const item = this.#fallbackQueue.shift()!;
      try {
        await this.#performImmediateSync();
        console.log('Processed queued sync item');
      } catch (error) {
        console.error('Failed to process queued sync:', error);
        // Re-queue if it's a temporary error
        if (this.#isTemporaryError(error)) {
          this.#fallbackQueue.unshift(item);
        }
        break;
      }
    }
  }

  #isTemporaryError(error: any): boolean {
    const errorMessage = error?.message?.toLowerCase() || '';
    return errorMessage.includes('network') ||
           errorMessage.includes('fetch') ||
           errorMessage.includes('timeout');
  }

  async #performImmediateSync(): Promise<void> {
    // Implement your sync logic here
    throw new Error('Not implemented - delegate to your sync service');
  }
}
```

### 3. Periodic Background Sync API
**Purpose**: Automatically sync data at regular intervals in the background.

**Browser Support (2025)**:
- ✅ Chrome 80+ (with user engagement requirements)
- ❌ Firefox, Safari, most other browsers

**Feature Detection with Permission Checking**:
```typescript
interface PeriodicSyncStatus {
  supported: boolean;
  permitted: boolean;
  requiresEngagement: boolean;
}

async function detectPeriodicSyncStatus(): Promise<PeriodicSyncStatus> {
  const status: PeriodicSyncStatus = {
    supported: false,
    permitted: false,
    requiresEngagement: false
  };

  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.ready;
      status.supported = 'periodicSync' in registration;

      if (status.supported) {
        // Chrome requires user engagement and PWA installation
        status.requiresEngagement = true;

        try {
          // Check permissions
          if ('permissions' in navigator) {
            const permission = await navigator.permissions.query({
              name: 'periodic-background-sync' as PermissionName
            });
            status.permitted = permission.state === 'granted';
          }
        } catch (error) {
          // Permission query not supported for this API
          console.warn('Could not query periodic sync permission:', error);
        }
      }
    } catch (error) {
      console.warn('Service worker not available:', error);
    }
  }

  return status;
}
```

**Implementation with Requirements Handling**:
```typescript
class PeriodicSyncManager {
  #status: PeriodicSyncStatus | null = null;
  #fallbackTimer: number | null = null;

  async initialize(): Promise<void> {
    this.#status = await detectPeriodicSyncStatus();

    if (this.#status.supported) {
      console.log('Periodic Background Sync supported');
      if (!this.#status.permitted) {
        console.log('Periodic sync requires user engagement or PWA installation');
      }
    } else {
      console.log('Periodic Background Sync not supported, using timer fallback');
      this.#setupFallbackTimer();
    }
  }

  async enablePeriodicSync(intervalMinutes = 60): Promise<boolean> {
    if (!this.#status?.supported) {
      console.log('Periodic sync not supported, fallback timer active');
      return false;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.periodicSync.register('periodic-sync', {
        minInterval: intervalMinutes * 60 * 1000 // Convert to milliseconds
      });
      console.log('Periodic sync registered successfully');
      return true;
    } catch (error) {
      console.warn('Periodic sync registration failed:', error);
      this.#setupFallbackTimer(intervalMinutes);
      return false;
    }
  }

  async disablePeriodicSync(): Promise<void> {
    if (this.#status?.supported) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.periodicSync.unregister('periodic-sync');
        console.log('Periodic sync unregistered');
      } catch (error) {
        console.warn('Failed to unregister periodic sync:', error);
      }
    }

    this.#clearFallbackTimer();
  }

  #setupFallbackTimer(intervalMinutes = 60): void {
    this.#clearFallbackTimer();

    // Only run fallback timer when page is visible
    const runSync = () => {
      if (!document.hidden && navigator.onLine) {
        console.log('Fallback timer triggered sync');
        // Trigger your sync logic here
        this.#triggerFallbackSync();
      }
    };

    this.#fallbackTimer = setInterval(runSync, intervalMinutes * 60 * 1000) as unknown as number;
    console.log(`Fallback timer set for ${intervalMinutes} minute intervals`);
  }

  #clearFallbackTimer(): void {
    if (this.#fallbackTimer !== null) {
      clearInterval(this.#fallbackTimer);
      this.#fallbackTimer = null;
    }
  }

  #triggerFallbackSync(): void {
    // Implement your sync logic or delegate to sync manager
    console.log('Triggering fallback sync operation');
  }
}
```

### 4. BroadcastChannel API
**Purpose**: Communicate sync status and updates across multiple tabs and windows.

**Browser Support (2025)**:
- ✅ Chrome 54+, Firefox 38+, Safari 15.5+, Edge 79+
- ✅ Excellent support across all major browsers
- ❌ Only older browsers lack support

**Feature Detection**:
```typescript
function detectBroadcastChannelSupport(): boolean {
  return typeof BroadcastChannel !== 'undefined';
}
```

**Implementation**:
```typescript
class CrossTabCommunicator {
  #channel: BroadcastChannel;
  #listeners = new Map<string, Set<(data: any) => void>>();

  constructor(channelName: string) {
    this.#channel = new BroadcastChannel(channelName);
    this.#channel.addEventListener('message', this.#handleBroadcastMessage.bind(this));
  }

  broadcast(type: string, data: any): void {
    const message = { type, data, timestamp: Date.now() };
    this.#channel.postMessage(message);
  }

  subscribe(type: string, callback: (data: any) => void): () => void {
    if (!this.#listeners.has(type)) {
      this.#listeners.set(type, new Set());
    }
    this.#listeners.get(type)!.add(callback);

    // Return unsubscribe function
    return () => {
      this.#listeners.get(type)?.delete(callback);
    };
  }

  close(): void {
    this.#channel.close();
    this.#listeners.clear();
  }

  #handleBroadcastMessage(event: MessageEvent): void {
    this.#dispatchToListeners(event.data);
  }

  #dispatchToListeners(message: { type: string; data: any; timestamp: number }): void {
    const listeners = this.#listeners.get(message.type);
    if (listeners) {
      listeners.forEach(callback => {
        try {
          callback(message.data);
        } catch (error) {
          console.error('Error in message listener:', error);
        }
      });
    }
  }
}

// Usage example
const communicator = new CrossTabCommunicator('sync-updates');

// Listen for sync status updates
const unsubscribe = communicator.subscribe('sync-status', (status) => {
  console.log('Sync status update:', status);
});

// Broadcast sync completion
communicator.broadcast('sync-status', { status: 'completed', processed: 42 });

// Clean up when done
// unsubscribe();
// communicator.close();
```

## Comprehensive Feature Detection Service

```typescript
interface PWACapabilities {
  serviceWorker: boolean;
  webLocks: boolean;
  backgroundSync: boolean;
  periodicSync: boolean;
  broadcastChannel: boolean;
  pushNotifications: boolean;
  permissions: boolean;
}

interface PWALimitations {
  requiresHTTPS: boolean;
  requiresUserEngagement: boolean;
  requiresPWAInstallation: boolean;
}

class PWACapabilityDetector {
  #capabilities: PWACapabilities | null = null;
  #limitations: PWALimitations | null = null;

  async detectCapabilities(): Promise<{ capabilities: PWACapabilities; limitations: PWALimitations }> {
    if (this.#capabilities && this.#limitations) {
      return { capabilities: this.#capabilities, limitations: this.#limitations };
    }

    const capabilities: PWACapabilities = {
      serviceWorker: 'serviceWorker' in navigator,
      webLocks: detectWebLocksSupport(),
      backgroundSync: false,
      periodicSync: false,
      broadcastChannel: detectBroadcastChannelSupport(),
      pushNotifications: 'Notification' in window && 'PushManager' in window,
      permissions: 'permissions' in navigator
    };

    const limitations: PWALimitations = {
      requiresHTTPS: location.protocol !== 'https:' && location.hostname !== 'localhost',
      requiresUserEngagement: false,
      requiresPWAInstallation: false
    };

    // Detect sync capabilities
    if (capabilities.serviceWorker) {
      try {
        const registration = await navigator.serviceWorker.ready;
        capabilities.backgroundSync = 'sync' in registration;
        capabilities.periodicSync = 'periodicSync' in registration;

        if (capabilities.periodicSync) {
          limitations.requiresUserEngagement = true;
          limitations.requiresPWAInstallation = true; // Chrome requirement
        }
      } catch (error) {
        console.warn('Service worker not ready:', error);
      }
    }

    this.#capabilities = capabilities;
    this.#limitations = limitations;

    return { capabilities, limitations };
  }

  async generateCapabilityReport(): Promise<string> {
    const { capabilities, limitations } = await this.detectCapabilities();

    const report = [
      '=== PWA Capability Report ===',
      `Service Worker: ${capabilities.serviceWorker ? '✅' : '❌'}`,
      `Web Locks API: ${capabilities.webLocks ? '✅' : '❌'} ${!capabilities.webLocks ? '(very old browser)' : ''}`,
      `Background Sync: ${capabilities.backgroundSync ? '✅' : '❌'} ${!capabilities.backgroundSync ? '(will use online/offline events)' : ''}`,
      `Periodic Sync: ${capabilities.periodicSync ? '✅' : '❌'} ${!capabilities.periodicSync ? '(will use timer fallback)' : ''}`,
      `BroadcastChannel: ${capabilities.broadcastChannel ? '✅' : '❌'} ${!capabilities.broadcastChannel ? '(very old browser)' : ''}`,
      '',
      '=== Limitations ===',
      limitations.requiresHTTPS ? '⚠️  HTTPS required for full PWA functionality' : '✅ HTTPS available',
      limitations.requiresUserEngagement ? '⚠️  Some features require user engagement' : '',
      limitations.requiresPWAInstallation ? '⚠️  Periodic sync requires PWA installation' : '',
      '',
      '=== Fallback Strategies Active ===',
      !capabilities.webLocks ? '• Web Locks not supported (very old browser)' : '',
      !capabilities.backgroundSync ? '• Using online/offline event handling' : '',
      !capabilities.periodicSync ? '• Using timer-based periodic sync' : '',
      !capabilities.broadcastChannel ? '• BroadcastChannel not supported (very old browser)' : ''
    ].filter(line => line !== '').join('\n');

    return report;
  }
}
```

## Integration Example

```typescript
// Complete integration example showing how to use all APIs together
class RobustSyncManager {
  #detector = new PWACapabilityDetector();
  #syncCoordinator?: SyncCoordinator;
  #syncManager?: SyncManager;
  #periodicSyncManager?: PeriodicSyncManager;
  #communicator?: CrossTabCommunicator;

  async initialize(): Promise<void> {
    const { capabilities, limitations } = await this.#detector.detectCapabilities();

    // Log capability report
    const report = await this.#detector.generateCapabilityReport();
    console.log(report);

    // Initialize components based on capabilities
    this.#syncCoordinator = new SyncCoordinator();
    this.#syncManager = new SyncManager();
    this.#periodicSyncManager = new PeriodicSyncManager();
    this.#communicator = new CrossTabCommunicator('sync-updates');

    await this.#syncManager.initialize();
    await this.#periodicSyncManager.initialize();

    // Warn about limitations
    if (limitations.requiresHTTPS) {
      console.warn('PWA features limited - HTTPS required for full functionality');
    }
  }

  async performSync(immediate = false): Promise<void> {
    const syncId = crypto.randomUUID();

    // Coordinate across tabs
    const lockAcquired = await this.#syncCoordinator?.acquireSyncLock(syncId);
    if (!lockAcquired) {
      console.log('Sync already in progress in another tab');
      return;
    }

    try {
      // Broadcast sync start
      this.#communicator?.broadcast('sync-status', { status: 'starting', syncId });

      // Perform sync using appropriate strategy
      await this.#syncManager?.requestSync(immediate);

      // Broadcast sync completion
      this.#communicator?.broadcast('sync-status', { status: 'completed', syncId });

    } finally {
      // Always release lock
      this.#syncCoordinator?.releaseSyncLock();
    }
  }

  async enablePeriodicSync(): Promise<boolean> {
    return this.#periodicSyncManager?.enablePeriodicSync() ?? false;
  }

  destroy(): void {
    this.#communicator?.close();
    this.#periodicSyncManager?.disablePeriodicSync();
  }
}

// Usage
const syncManager = new RobustSyncManager();
await syncManager.initialize();
await syncManager.performSync();
```

## Best Practices Summary

### 1. Always Use Feature Detection
- Never rely on user agent strings
- Test for specific API availability, not browser names
- Check for both API existence and permission states

### 2. Implement Progressive Enhancement
- Start with a baseline experience that works everywhere
- Layer on advanced features for supporting browsers
- Ensure core functionality never depends on modern APIs

### 3. Provide Meaningful Fallbacks
- Timer-based sync for Periodic Background Sync
- Online/offline events for Background Sync
- Note: Web Locks and BroadcastChannel have excellent support and don't need fallbacks

### 4. Handle Partial Support Gracefully
- APIs may exist but be denied permission
- Network conditions may cause APIs to fail
- User engagement requirements may not be met

### 5. Educate Users About Limitations
- Show clear indicators when features are unavailable
- Explain how to enable advanced features (PWA installation, etc.)
- Provide alternative workflows when APIs are limited

This approach ensures your PWA provides a robust experience across all browsers while taking advantage of advanced features where available.