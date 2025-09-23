# **Pocket Ding Sync Architecture Implementation Plan**

## **Phase 1: Critical Multi-Tab Safety (HIGH PRIORITY)**

### **1.1 Web Lock API Multi-Tab Coordination**

**New Components to Create:**
- **`src/services/web-lock-coordinator.ts`**
  - Implement `WebLockCoordinator` class with methods:
    - `isLockAvailable(): Promise<boolean>` - check if sync lock is available
    - `waitForLockRelease(): Promise<void>` - wait for lock to become available
    - `acquireSyncLockInWorker(syncId: string): Promise<boolean>` - helper for worker lock acquisition
  - Include lock timeout and steal mechanisms for recovery scenarios
  - Provide utilities for lock management across worker contexts

**Components to Update:**
- **`src/controllers/sync-controller.ts`**
  - Add `#webLockCoordinator` private field
  - Modify `startSync()` to check lock availability before starting, return early if unavailable
  - Add `#syncLockStatus` reactive property for UI display (based on lock availability checks)
  - Workers will handle direct lock acquisition
  - Add periodic lock status polling for UI updates

- **`src/worker/sync-worker.ts`**
  - **CRITICAL**: Acquire Web Lock as first step in sync operation
  - Hold lock throughout entire sync process
  - Release lock on completion, cancellation, or error
  - Add lock acquisition failure handling
  - Ensure lock release in all termination scenarios

- **`src/services/sync-worker-manager.ts`**
  - Add emergency lock cleanup mechanisms
  - Monitor worker health and release orphaned locks
  - Coordinate with WebLockCoordinator for worker lock management

- **`src/components/sync-progress.ts`**
  - Add display for "Sync in progress in another tab" when lock unavailable
  - Show lock status polling from SyncController

**Testing Updates:**
- **New test file**: `src/test/integration/multi-tab-coordination.test.ts`
  - Test sync lock acquisition/release in worker contexts
  - Test lock timeout and recovery mechanisms
  - Test scenarios where SyncController dies but worker continues (zombie sync prevention)
  - Test emergency lock cleanup mechanisms
- **Update existing sync tests** to include worker-owned lock assertions

### **1.2 Visibility-Based Service Worker Coordination**

**Components to Update:**
- **`src/worker/sw.ts` (Service Worker)**
  - Add message handlers for app visibility:
    - `APP_FOREGROUND` - cancel any in-progress background sync, release Web Lock, focus on PWA duties
    - `APP_BACKGROUND` - re-enable background sync capabilities
  - Ensure sync event handlers properly acquire Web Locks before executing
  - Verify service worker can access existing sync service logic
  - Implement graceful background sync cancellation and lock release when app becomes visible
  - Add sync completion notifications to main thread
  - Add comprehensive error handling and reporting to main thread

- **`src/controllers/sync-controller.ts`**
  - Before starting foreground sync:
    - Wait for service worker to release Web Lock (using `waitForLockRelease()`)
    - Then proceed with sync worker creation and lock acquisition
  - **CRITICAL**: Add comprehensive `beforeunload` event handling:
    - Register background sync when sync is in progress
    - Preserve sync state for service worker resume
    - Handle sync worker graceful termination
  - Add service worker communication for sync results and error handling
  - No direct sync coordination messages needed - Web Locks handle exclusion

- **`src/services/page-visibility-service.ts`**
  - Add service worker messaging for visibility changes:
    - Send `APP_FOREGROUND` when app becomes visible
    - Send `APP_BACKGROUND` when app becomes hidden
  - Keep existing visibility detection logic
  - Handle service worker messaging failures gracefully

- **`src/types/sync-messages.ts`**
  - Add visibility-based message types:
    - `APP_FOREGROUND`, `APP_BACKGROUND`
  - Remove sync-specific coordination messages

**Testing Updates:**
- **New test file**: `src/test/integration/visibility-service-worker-coordination.test.ts`
  - Test service worker background sync cancellation on `APP_FOREGROUND`
  - Test Web Lock release by service worker when app becomes visible
  - Test SyncController waiting for lock release before starting sync
  - Test visibility message handling and error cases
- **Update service worker tests** to include visibility-based coordination behavior

### **1.3 API Support Detection and Graceful Degradation**

**New Components to Create:**
- **`src/utils/pwa-capabilities.ts`**
  - Simple utility functions (no class needed):
    - `detectCapabilities(): PWACapabilities` - detect all API support
    - `hasWebLocks(): boolean`, `hasBackgroundSync(): boolean`, etc. - individual checks
  - Define `PWACapabilities` interface
  - Pure functions, no state management

**Components to Update:**
- **`src/controllers/sync-controller.ts`**
  - Use capability detection functions during initialization
  - **App initialization**: Register periodic background sync if PWA installed, user consents, and API available
  - **During sync**: Register background sync on interruption/closure scenarios if API available
  - Add `beforeunload` event listener to register background sync when sync active
  - Display user-friendly messages for browser limitations and fallback usage

- **`src/worker/sw.ts`**
  - Use capability detection for conditional background sync registration
  - **Registration timing**: Follow design doc requirements for periodic (initialization) vs one-off (beforeunload) registration
  - **Background Sync fallback**: Online/offline event listeners + manual retry queue when API unavailable
  - **Periodic Sync fallback**: Timer-based sync (`setInterval`) when app is visible and API unavailable

**Explicit Fallback Implementations:**
- **Background Sync API** (missing in Firefox/Safari):
  - Listen for `online` events to retry failed operations
  - Maintain retry queue in IndexedDB with exponential backoff
  - Process queue when network restored with retry attempt limits
  - Implement queue cleanup and maximum retry policies
- **Periodic Background Sync** (missing in Firefox/Safari):
  - Use `setInterval` for periodic sync when app visible
  - Disable timer when app goes to background
  - Respect user's sync interval preferences
  - Coordinate with visibility service for timer management

**Testing Updates:**
- **New test file**: `src/test/unit/pwa-capabilities.test.ts`
  - Test capability detection utility functions
  - Test fallback behavior for Background Sync and Periodic Sync
- **Update integration tests** to verify graceful degradation scenarios

## **Phase 2: Offline Handling (MEDIUM PRIORITY)**

### **2.1 Network Interruption and Recovery**

**New Components to Create:**
- **`src/services/offline-manager.ts`**
  - Implement `OfflineManager` class with methods:
    - `startMonitoring(): void` - begin online/offline event monitoring
    - `pauseSyncForOffline(): Promise<void>` - pause current sync gracefully
    - `resumeSyncWhenOnline(): Promise<void>` - resume interrupted sync
    - `isOnline(): boolean` - current network status
  - Add event listeners for online/offline events
  - Implement state preservation for sync resume capability

**Components to Update:**
- **`src/worker/sync-service.ts`**
  - Add network failure detection in fetch operations (if not already implemented)
  - Implement pause/resume checkpoints throughout sync phases (if not already implemented)
  - Add state preservation logic for interrupted syncs (if not already implemented)
  - Integrate with OfflineManager for automatic pause/resume

- **`src/controllers/sync-controller.ts`**
  - Integrate with OfflineManager for network status awareness
  - Update sync state to include offline/paused status
  - Add user controls for sync cancellation during offline periods

- **`src/components/sync-progress.ts`**
  - Add offline indicators and paused sync status display
  - Show "will resume when online" messaging
  - Update progress indicators for paused state

**Testing Updates:**
- **New test file**: `src/test/integration/offline-sync-handling.test.ts`
  - Test sync pause/resume during network interruptions
  - Test state preservation and recovery scenarios
  - Test user experience during offline periods

## **Future Work (Not in This Plan)**

### **Advanced Features (Future)**
- **BroadcastChannel Implementation**: Real-time progress sharing across tabs
- **Network Quality Adaptation**: Adaptive sync behavior based on connection quality
- **Enhanced Error Recovery**: Sophisticated retry strategies and worker health checks

## **Architectural Refactoring Requirements**

### **PageVisibilityService Refactoring**
**Current Issues:**
- Handles some sync-specific responsibilities that belong elsewhere

**Refactoring Plan:**
- **Keep in PageVisibilityService**: Visibility detection, event emission, and service worker visibility messaging
- **Move to SyncController**: Auto-sync behavior and user preference handling
- **Enhanced responsibility**: Send `APP_FOREGROUND`/`APP_BACKGROUND` messages to service worker
- **Simplified sync logic**: Remove complex sync coordination, focus on visibility and messaging

### **Service Layer Organization**
**New Service Hierarchy:**
```
src/services/
├── coordination/
│   ├── web-lock-coordinator.ts
│   └── offline-manager.ts
└── existing services...

src/utils/
└── pwa-capabilities.ts
```
*Note: No separate worker-coordinator needed - coordination handled via direct message passing*
*Note: Capability detection moved to utils as simple functions*
*Note: No sync-registration-manager needed - registration handled directly in SyncController*

### **Dependency Injection Updates**
**Components to Update:**
- **`src/controllers/sync-controller.ts`** - inject web lock coordinator for status checking, handle direct service worker messaging
- **`src/services/sync-worker-manager.ts`** - inject web lock coordinator for emergency cleanup
- **`src/worker/sync-worker.ts`** - directly access Web Lock API for lock acquisition
- **`src/worker/sw.ts`** - directly access Web Lock API, handle coordination via message passing

## **Testing Strategy Updates**

### **New Testing Categories:**
- **Multi-tab coordination tests**: Focus on Web Lock API usage and worker lock ownership
- **Visibility-based coordination tests**: Verify service worker responds to app visibility changes
- **Lock waiting tests**: Test SyncController waiting for service worker lock release
- **Browser compatibility tests**: Test graceful degradation across API support levels
- **Offline workflow tests**: Validate pause/resume user experience

### **Testing Guidelines Compliance:**
- **Focus on user workflows**: Test complete sync scenarios across tabs and network conditions
- **Integration over units**: Test coordination between multiple services and workers
- **Error scenario coverage**: Test network failures, browser crashes, and API limitations
- **User-visible behavior**: Verify UI updates correctly reflect coordination states

### **Test File Organization:**
```
src/test/
├── integration/
│   ├── multi-tab-coordination.test.ts
│   ├── visibility-service-worker-coordination.test.ts
│   └── offline-sync-handling.test.ts
├── unit/
│   ├── web-lock-coordinator.test.ts
│   └── pwa-capabilities.test.ts
└── workflows/
    ├── cross-tab-sync-workflows.test.ts
    ├── visibility-coordination-workflows.test.ts
    └── network-interruption-workflows.test.ts
```

## **Implementation Notes**

- Web Lock API has excellent browser support (Chrome 69+, Firefox 96+, Safari 15.4+, Edge 79+) - no fallback needed
- **Critical Architecture Decision**: Workers own and manage Web Locks to prevent "zombie sync" scenarios
- **Key Insight**: Web Locks eliminate need for complex database coordination - only one sync runs at a time
- **Focus**: This plan addresses gaps and refactoring needs, not re-implementing existing functionality
- Focus on user-behavior-focused testing following project guidelines
- Maintain backward compatibility throughout implementation
- Each phase can be implemented and tested independently
- Critical safety features (Phase 1) take priority over user experience improvements

## **Key Architectural Principles**

### **Worker-Owned Lock Management**
- **SyncWorker and Service Worker**: Acquire and hold Web Locks during sync operations
- **SyncController**: Checks lock availability for UI display, does not acquire locks
- **SyncWorkerManager**: Emergency cleanup and monitoring only
- **Benefit**: Lock lifetime matches worker lifetime, preventing orphaned sync operations
