/**
 * Message types for communication between main thread and dedicated sync worker
 */

import type { AppSettings, SyncPhase } from './index.js';

/**
 * Message types that can be sent TO the sync worker
 */
export type SyncWorkerMessageType = 'START_SYNC' | 'CANCEL_SYNC';

/**
 * Message types that can be sent FROM the sync worker
 */
export type SyncWorkerResponseType =
  | 'SYNC_PROGRESS'
  | 'SYNC_COMPLETE'
  | 'SYNC_ERROR'
  | 'SYNC_CANCELLED';

/**
 * Base interface for messages sent to the sync worker
 */
export interface SyncWorkerMessage {
  type: SyncWorkerMessageType;
  payload?: {
    settings?: AppSettings;
    fullSync?: boolean;
  };
  id: string;
}

/**
 * Message to start a sync operation
 */
export interface StartSyncMessage extends SyncWorkerMessage {
  type: 'START_SYNC';
  payload: {
    settings: AppSettings;
    fullSync?: boolean;
  };
}

/**
 * Message to cancel a sync operation
 */
export interface CancelSyncMessage extends SyncWorkerMessage {
  type: 'CANCEL_SYNC';
  payload?: never;
}

/**
 * Union type for all messages that can be sent to the sync worker
 */
export type SyncWorkerRequestMessage = StartSyncMessage | CancelSyncMessage;

/**
 * Base interface for responses sent from the sync worker
 */
export interface SyncWorkerResponse {
  type: SyncWorkerResponseType;
  payload: any;
  id: string;
}

/**
 * Progress update response from the sync worker
 */
export interface SyncProgressResponse extends SyncWorkerResponse {
  type: 'SYNC_PROGRESS';
  payload: {
    current: number;
    total: number;
    phase: SyncPhase;
  };
}

/**
 * Completion response from the sync worker
 */
export interface SyncCompleteResponse extends SyncWorkerResponse {
  type: 'SYNC_COMPLETE';
  payload: {
    processed: number;
    timestamp: number;
  };
}

/**
 * Error response from the sync worker
 */
export interface SyncErrorResponse extends SyncWorkerResponse {
  type: 'SYNC_ERROR';
  payload: {
    error: string;
    processed?: number;
    recoverable?: boolean;
  };
}

/**
 * Cancellation response from the sync worker
 */
export interface SyncCancelledResponse extends SyncWorkerResponse {
  type: 'SYNC_CANCELLED';
  payload: {
    processed: number;
  };
}

/**
 * Union type for all responses that can be sent from the sync worker
 */
export type SyncWorkerResponseMessage =
  | SyncProgressResponse
  | SyncCompleteResponse
  | SyncErrorResponse
  | SyncCancelledResponse;

/**
 * Helper functions for creating worker messages
 */
export const SyncWorkerMessages = {
  startSync(settings: AppSettings, fullSync = false, id: string): StartSyncMessage {
    return {
      type: 'START_SYNC',
      payload: {
        settings,
        fullSync
      },
      id
    };
  },

  cancelSync(id: string): CancelSyncMessage {
    return {
      type: 'CANCEL_SYNC',
      id
    };
  }
};

/**
 * Helper functions for creating worker responses
 */
export const SyncWorkerResponses = {
  progress(current: number, total: number, phase: SyncPhase, id: string): SyncProgressResponse {
    return {
      type: 'SYNC_PROGRESS',
      payload: {
        current,
        total,
        phase
      },
      id
    };
  },

  complete(processed: number, id: string): SyncCompleteResponse {
    return {
      type: 'SYNC_COMPLETE',
      payload: {
        processed,
        timestamp: Date.now()
      },
      id
    };
  },

  error(error: string, id: string, processed = 0, recoverable = true): SyncErrorResponse {
    return {
      type: 'SYNC_ERROR',
      payload: {
        error,
        processed,
        recoverable
      },
      id
    };
  },

  cancelled(processed: number, id: string): SyncCancelledResponse {
    return {
      type: 'SYNC_CANCELLED',
      payload: {
        processed
      },
      id
    };
  }
};