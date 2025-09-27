/**
 * Message types for communication between main app and service worker
 */

import type { SyncPhase } from './index.js';

export type SyncMessageType =
  | 'REQUEST_SYNC'
  | 'CANCEL_SYNC'
  | 'SYNC_STATUS'
  | 'SYNC_PROGRESS'
  | 'SYNC_COMPLETE'
  | 'SYNC_ERROR'
  | 'REGISTER_PERIODIC_SYNC'
  | 'CHECK_SYNC_PERMISSION'
  | 'REQUEST_VERSION'
  | 'VERSION_INFO'
  | 'SW_LOG'
  | 'APP_FOREGROUND'
  | 'APP_BACKGROUND';

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
  status: 'idle' | 'starting' | 'syncing' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  timestamp: number;
}

export interface SyncProgressMessage {
  type: 'SYNC_PROGRESS';
  current: number;
  total: number;
  phase: SyncPhase;
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
}

export interface CheckSyncPermissionMessage {
  type: 'CHECK_SYNC_PERMISSION';
}

export interface ServiceWorkerLogMessage {
  type: 'SW_LOG';
  level: 'info' | 'warn' | 'error';
  operation: string;
  message: string;
  details?: any;
  error?: string;
}

export interface RequestVersionMessage {
  type: 'REQUEST_VERSION';
}

export interface VersionInfoMessage {
  type: 'VERSION_INFO';
  version: import('./version').VersionInfo;
}

export interface AppForegroundMessage {
  type: 'APP_FOREGROUND';
  timestamp: number;
}

export interface AppBackgroundMessage {
  type: 'APP_BACKGROUND';
  timestamp: number;
}

export type SyncMessage =
  | SyncRequestMessage
  | CancelSyncMessage
  | SyncStatusMessage
  | SyncProgressMessage
  | SyncCompleteMessage
  | SyncErrorMessage
  | RegisterPeriodicSyncMessage
  | CheckSyncPermissionMessage
  | RequestVersionMessage
  | VersionInfoMessage
  | ServiceWorkerLogMessage
  | AppForegroundMessage
  | AppBackgroundMessage;

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
    const message: SyncCompleteMessage = {
      type: 'SYNC_COMPLETE',
      success,
      processed,
      duration,
      timestamp: Date.now()
    };
    if (error !== undefined) {
      message.error = error;
    }
    return message;
  },
  
  syncError(error: string, recoverable = false): SyncErrorMessage {
    return {
      type: 'SYNC_ERROR',
      error,
      recoverable,
      timestamp: Date.now()
    };
  },
  
  registerPeriodicSync(enabled: boolean): RegisterPeriodicSyncMessage {
    return {
      type: 'REGISTER_PERIODIC_SYNC',
      enabled
    };
  },
  
  checkSyncPermission(): CheckSyncPermissionMessage {
    return {
      type: 'CHECK_SYNC_PERMISSION'
    };
  },

  appForeground(): AppForegroundMessage {
    return {
      type: 'APP_FOREGROUND',
      timestamp: Date.now()
    };
  },

  appBackground(): AppBackgroundMessage {
    return {
      type: 'APP_BACKGROUND',
      timestamp: Date.now()
    };
  }
};