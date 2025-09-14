/**
 * Message types for communication between main app and service worker
 */

export type SyncMessageType = 
  | 'REQUEST_SYNC'
  | 'CANCEL_SYNC'
  | 'SYNC_STATUS'
  | 'SYNC_PROGRESS'
  | 'SYNC_COMPLETE'
  | 'SYNC_ERROR'
  | 'REGISTER_PERIODIC_SYNC'
  | 'CHECK_SYNC_PERMISSION';

export interface SyncRequestMessage {
  type: 'REQUEST_SYNC';
  immediate: boolean;
  priority: 'high' | 'normal' | 'low';
  fullSync?: boolean;
}

export interface CancelSyncMessage {
  type: 'CANCEL_SYNC';
  reason: string;
}

export interface SyncStatusMessage {
  type: 'SYNC_STATUS';
  status: 'idle' | 'starting' | 'syncing' | 'completed' | 'failed' | 'cancelled';
  timestamp: number;
}

export interface SyncProgressMessage {
  type: 'SYNC_PROGRESS';
  current: number;
  total: number;
  phase: 'init' | 'bookmarks' | 'assets' | 'read-status' | 'complete';
  timestamp: number;
}

export interface SyncCompleteMessage {
  type: 'SYNC_COMPLETE';
  success: boolean;
  processed: number;
  duration: number;
  timestamp: number;
  error?: string;
}

export interface SyncErrorMessage {
  type: 'SYNC_ERROR';
  error: string;
  recoverable: boolean;
  timestamp: number;
}

export interface RegisterPeriodicSyncMessage {
  type: 'REGISTER_PERIODIC_SYNC';
  enabled: boolean;
  minInterval?: number;
}

export interface CheckSyncPermissionMessage {
  type: 'CHECK_SYNC_PERMISSION';
}

export type SyncMessage = 
  | SyncRequestMessage
  | CancelSyncMessage
  | SyncStatusMessage
  | SyncProgressMessage
  | SyncCompleteMessage
  | SyncErrorMessage
  | RegisterPeriodicSyncMessage
  | CheckSyncPermissionMessage;

/**
 * Helper functions for message creation
 */
export const SyncMessages = {
  requestSync(immediate = true, fullSync = false): SyncRequestMessage {
    return {
      type: 'REQUEST_SYNC',
      immediate,
      priority: immediate ? 'high' : 'normal',
      fullSync
    };
  },
  
  cancelSync(reason: string): CancelSyncMessage {
    return {
      type: 'CANCEL_SYNC',
      reason
    };
  },
  
  syncStatus(status: SyncStatusMessage['status']): SyncStatusMessage {
    return {
      type: 'SYNC_STATUS',
      status,
      timestamp: Date.now()
    };
  },
  
  syncProgress(current: number, total: number, phase: SyncProgressMessage['phase']): SyncProgressMessage {
    return {
      type: 'SYNC_PROGRESS',
      current,
      total,
      phase,
      timestamp: Date.now()
    };
  },
  
  syncComplete(success: boolean, processed: number, duration: number, error?: string): SyncCompleteMessage {
    return {
      type: 'SYNC_COMPLETE',
      success,
      processed,
      duration,
      timestamp: Date.now(),
      error
    };
  },
  
  syncError(error: string, recoverable = false): SyncErrorMessage {
    return {
      type: 'SYNC_ERROR',
      error,
      recoverable,
      timestamp: Date.now()
    };
  },
  
  registerPeriodicSync(enabled: boolean, minInterval?: number): RegisterPeriodicSyncMessage {
    return {
      type: 'REGISTER_PERIODIC_SYNC',
      enabled,
      minInterval
    };
  },
  
  checkSyncPermission(): CheckSyncPermissionMessage {
    return {
      type: 'CHECK_SYNC_PERMISSION'
    };
  }
};