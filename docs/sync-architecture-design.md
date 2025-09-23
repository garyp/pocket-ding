# Pocket Ding Sync Architecture Design

## Overview

The app uses a service worker for typical PWA caching, while a sync worker handles background synchronization tasks. The sync worker runs in the background, can be manually initiated, and automatically resumes after app closure (if background sync API is supported). The app manages lifecycle events like app closure and multiple tabs using the Web Lock API to prevent conflicts and ensure data integrity.

## Architecture Components

### Service Worker
- **Purpose**: Typical PWA functionality (network caching, etc.)
- **Scope**: Does NOT handle synchronization
- **Responsibility**: Standard PWA operations only

### Sync Worker
- **Purpose**: Handles all synchronization with Linkding server
- **Type**: Web Worker (dedicated to sync operations)
- **Lifecycle**: Runs in background while app is active

### Sync Controller
- **Location**: Main application thread
- **Purpose**: Manages sync worker lifecycle and coordinates sync operations
- **Initialization**: Starts when app loads and user is on screen

## Lifecycle Management

### Application Startup
1. App loads as PWA with service worker for caching
2. User appears on screen, sync controller initializes
3. Sync controller kicks off sync using sync worker
4. Sync worker runs in background during app interaction

### Auto-Sync vs Manual Sync
- **Auto-sync enabled**: Sync controller starts sync automatically when app loads
- **Auto-sync disabled**: Sync controller doesn't start sync automatically
- **Manual sync**: Always available regardless of auto-sync setting

### Application Closure
- Sync worker gets automatically killed when user closes app
- If sync is in middle of operation, it gets interrupted
- Sync can resume later (functionality already implemented in sync code)

## Background Sync Strategies

### Periodic Background Sync (Primary)
- **Condition**: Browser supports Periodic Background Sync API
- **Registration**: App registers for periodic sync during initialization
- **Execution**: When user doesn't have app open, browser runs service worker
- **Process**: Service worker spawns sync, completes or interrupts as needed

### Background Sync (Fallback)
- **Condition**: Browser supports Background Sync API but not Periodic Sync
- **Trigger**: App is suddenly closed while sync is running
- **Registration**: App registers background sync task on closure
- **Execution**: Service worker handles one-off background sync
- **Resumption**: Sync automatically resumes from where it left off

### API Registration Details
**Background Sync (One-off):**
- CAN be registered during app closure/beforeunload events - this is a key feature
- Registration typically happens when operations fail due to network issues
- Best practice: Register when sync is interrupted by app closure
- Browser support: Chromium-based browsers only (Chrome, Edge)

**Periodic Background Sync:**
- MUST be registered during app initialization after user permission
- Requires installed PWA and explicit user permission
- Best practice: Register once after PWA installation with 24-hour minimum interval
- Browser support: Chromium-based browsers only (Chrome, Edge)

## Multi-Tab Coordination

### Problem
If app is loaded in multiple tabs simultaneously, both in foreground, we don't want two sync operations running concurrently.

### Web Worker Sharing Research Findings
- **Regular Web Workers**: NOT shared across tabs - each tab gets its own dedicated instance
- **Shared Workers**: Designed for cross-tab coordination but have limited browser support:
  - Desktop: Good support (Chrome, Firefox, Safari 16+, Edge)
  - Mobile: Poor support (Chrome Android: no support, iOS Safari 16+ only)
  - Global compatibility: ~43% due to mobile limitations

### Solution: Web Lock API
**Implementation approach:**
- Use Web Lock API for exclusive sync access across tabs
- Excellent browser support including mobile (Chrome 69+, Firefox 96+, Safari 15.4+)
- Automatic lock release when tabs close/crash - solves sudden closure problem
- Clean mutual exclusion prevents concurrent sync operations

```javascript
// Only one tab can hold sync lock at a time
await navigator.locks.request('sync-operation', async (lock) => {
  await performSyncAndUpdateDatabase();
  // Lock automatically released when complete or tab closes
});
```

**Key benefits:**
- Automatic cleanup on tab closure/crash
- No manual heartbeat or liveness detection needed
- Simple exclusive access pattern
- Robust error handling with guaranteed lock release

### Sync Progress Display Strategy
**Active sync tab (holding the lock):**
- Displays full sync progress with real-time updates
- Shows detailed progress from sync worker
- Full UI controls and status information

**Other tabs (not holding the lock):**
- Display limited sync progress UI using IndexedDB status
- Show basic information: "Sync in progress in another tab"
- Include available phase information from database
- No real-time progress updates, only database-persisted status
- Cannot initiate new sync while lock is held by another tab

### Future Enhancement: BroadcastChannel Integration
- Add BroadcastChannel for real-time progress sharing between tabs
- Enable all tabs to show detailed sync progress
- Maintain Web Lock API for exclusive sync execution

## Worker Communication & Coordination

### Service Worker ↔ Main Thread
- **Background sync start**: Service worker notifies main thread when background sync begins
- **Interruption request**: Main thread tells service worker to interrupt any in-progress sync
- **Handoff coordination**: When background sync is in progress and user opens app

### Cross-Worker Coordination
- **Mutual exclusion**: Prevent sync worker and service worker from running sync simultaneously
- **Interruption mechanism**: Service worker can interrupt sync worker when needed
- **Delayed startup**: Main thread delays sync worker start until service worker sync completes
- **Notification system**: Service worker notifies when interruption is complete and sync worker can start

### Main Thread ↔ Sync Worker
- Standard worker communication for sync control and progress updates
- Worker lifecycle management (start/stop/interrupt)

## Current Implementation Integration

The main sync functionality for interruption and resumption is already implemented in the existing sync code. The architecture builds on this foundation by adding:
- Proper lifecycle management
- Multi-context coordination (service worker vs sync worker)
- Multi-tab handling
- Background sync API integration

## Offline Handling Strategy

### Device Goes Offline During Foreground Sync

**Immediate Response:**
- Sync worker detects network failure via fetch errors
- Sync operation pauses immediately and preserves current state
- UI displays offline indicator and paused sync status
- User can continue browsing cached content

**State Preservation:**
- Current sync progress stored in IndexedDB
- Partial bookmark data committed to prevent data loss
- Sync resume point marked for continuation when online
- Web Lock maintained to prevent other tabs from interfering

**User Experience:**
- Clear offline notification: "Sync paused - will resume when online"
- Option to cancel sync if user wants to free resources
- Cached content remains fully functional
- Progress indicator shows "paused" state rather than failure

**Resume Strategy:**
- Listen for online events via `navigator.onLine` and `online` event
- Automatically resume sync when connection restored
- Background Sync API registration as fallback if app is closed while offline
- Incremental resume from last successful checkpoint

### Network Quality Adaptation

**Connection Monitoring:**
- Detect slow connections via Navigator.connection API
- Reduce sync scope for poor network conditions
- Implement adaptive timeout values based on connection quality

**Adaptive Sync Behavior:**
- **Good connection**: Full sync with all content fetching
- **Slow connection**: Metadata-only sync, defer content fetching
- **Very slow/unstable**: Cancel current sync, register for Background Sync

### Implementation Pattern

**Sync Worker Offline Detection:**
```javascript
// In sync worker
try {
  const response = await fetch(bookmarkUrl);
  // Handle successful fetch
} catch (error) {
  if (!navigator.onLine || error.name === 'TypeError') {
    // Network offline - pause sync
    await this.pauseSyncForOffline();
    this.listenForOnlineResume();
  } else {
    // Other error - retry logic
    throw error;
  }
}
```

**Main Thread Coordination:**
```javascript
// In sync controller
window.addEventListener('online', () => {
  if (this.syncState === 'paused-offline') {
    this.resumeSync();
  }
});

window.addEventListener('offline', () => {
  if (this.syncState === 'running') {
    this.pauseSync();
  }
});
```

## Implementation Considerations

### Browser API Support Detection Strategy
**Feature Detection Pattern:**
```javascript
// Detect Web Lock API support
const hasWebLocks = 'locks' in navigator;

// Detect Background Sync support
const hasBackgroundSync = 'serviceWorker' in navigator && 'sync' in window.ServiceWorkerRegistration.prototype;

// Detect Periodic Background Sync support
const hasPeriodicSync = 'serviceWorker' in navigator && 'periodicSync' in window.ServiceWorkerRegistration.prototype;
```

**API Support Levels:**
- **Web Lock API**: Chrome 69+, Firefox 96+, Safari 15.4+, Edge 79+ (excellent support)
- **Background Sync**: Chromium-based browsers only (Chrome, Edge)
- **Periodic Background Sync**: Chromium-based browsers only (Chrome, Edge)
- **BroadcastChannel**: Chrome 54+, Firefox 38+, Safari 15.5+, Edge 79+ (excellent support)

**Graceful Degradation Strategy:**
- **Background Sync not available**: Manual sync only when app is open
- **Periodic Sync not available**: User-initiated sync or timer-based sync when app is visible

### Database Coordination
- Use IndexedDB for sync status persistence
- Store sync progress phases for cross-tab status display
- Implement proper transaction handling for concurrent access

### Performance
- Sync worker runs independently of UI thread
- Progress updates don't block main application
- Efficient resource cleanup on worker termination

## Open Questions

### Resolved Questions
1. **Web Worker Sharing**: ✅ **RESOLVED** - Regular Web Workers are NOT shared across tabs (each tab gets its own instance). Shared Workers ARE designed for cross-tab coordination but have poor mobile support. **Solution**: Use Web Lock API for coordination instead of relying on worker sharing.

2. **Background Sync API Details**: ✅ **RESOLVED** - Background Sync CAN be registered during app closure (key feature). Periodic Background Sync must be registered at initialization with user permission. Both APIs only work in Chromium browsers. **Solution**: Register periodic sync at app initialization, register background sync when sync is interrupted by closure.

3. **Tab Closure Detection**: ✅ **RESOLVED** - Web Lock API automatically handles tab closure and crash scenarios by releasing locks. No manual detection needed.

4. **Storage Mechanism**: ✅ **RESOLVED** - Use Web Lock API for multi-tab coordination instead of database locking or shared storage with tab IDs.

5. **API Support Detection**: ✅ **RESOLVED** - Use feature detection pattern to check for API availability. Implement graceful degradation for unsupported browsers. **Solution**: Detect each API individually and provide appropriate fallbacks.

6. **Error Recovery**: ✅ **RESOLVED** - Implement timeout handling, retry mechanisms with exponential backoff, worker health checks, and cross-worker error coordination. Use Web Lock API's steal option for recovery scenarios. **Solution**: Layer error recovery strategies with proper logging and user notifications.

7. **Offline Handling**: ✅ **RESOLVED** - Implement pause/resume strategy for network interruptions. Use online/offline event listeners with state preservation in IndexedDB. Provide clear user feedback and automatic resumption. **Solution**: Detect network failures, pause sync gracefully, maintain Web Lock, and resume automatically when online.

### Remaining Considerations
1. **Sync State Persistence**: How much sync state needs to be persisted to enable proper resumption across different worker contexts?

## Edge Cases and Additional Scenarios

### Browser Memory Pressure
**Scenario**: Browser terminates sync worker due to memory constraints
**Response**:
- Service worker detects worker termination
- Sync state preserved in IndexedDB allows resumption
- New sync worker spawned automatically when resources available
- User notified of temporary interruption

### Multiple Browser Windows
**Scenario**: User opens app in multiple browser windows (not just tabs)
**Response**:
- Web Lock API works across windows within same origin
- Same coordination strategy as multi-tab scenario
- Cross-window progress sharing via BroadcastChannel (future enhancement)

### Rapid Online/Offline Transitions
**Scenario**: Unstable network causing rapid connectivity changes
**Response**:
- Implement debouncing for online/offline events (2-3 second delay)
- Avoid rapid sync start/stop cycles that waste resources
- Use connection quality detection to determine sync strategy

### Service Worker Update During Sync
**Scenario**: Service worker updates while sync is in progress
**Response**:
- Current sync completes under old service worker
- New service worker takes over after sync completion
- Handoff coordination ensures no sync interruption
- User notified if manual restart required

### Large Dataset Sync Timeout
**Scenario**: Very large bookmark collection exceeds reasonable sync time
**Response**:
- Implement chunked sync with periodic progress saves
- Allow user to cancel long-running syncs
- Resume from last successful chunk on next sync
- Consider background-only mode for large datasets

### Concurrent API Changes
**Scenario**: Bookmarks modified on server during sync
**Response**:
- Use timestamp-based conflict detection
- Implement last-write-wins or user-choice conflict resolution
- Partial sync rollback if major conflicts detected
- User notification for conflicts requiring attention