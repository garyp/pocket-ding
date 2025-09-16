/**
 * Service Worker logging module that forwards logs to the main thread
 */

// Declare self as ServiceWorkerGlobalScope for TypeScript
declare const self: ServiceWorkerGlobalScope;

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Service worker logging function that sends logs to the main thread when possible
 */
export function swLog(level: LogLevel, operation: string, message: string, details?: any): void {
  // Always log to console for debugging
  const consoleMessage = `[SW] ${operation}: ${message}`;
  switch (level) {
    case 'info':
      console.log(consoleMessage, details);
      break;
    case 'warn':
      console.warn(consoleMessage, details);
      break;
    case 'error':
      console.error(consoleMessage, details);
      break;
  }
  
  // Forward to main thread if client is available
  if (typeof self !== 'undefined' && self.clients) {
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: 'SW_LOG',
          level,
          operation,
          message,
          details
        });
      });
    }).catch((error: any) => {
      console.error('[SW] Failed to forward log to clients:', error);
    });
  }
}

/**
 * Log info message
 */
export function logInfo(operation: string, message: string, details?: any): void {
  swLog('info', operation, message, details);
}

/**
 * Log warning message
 */
export function logWarning(operation: string, message: string, details?: any): void {
  swLog('warn', operation, message, details);
}

/**
 * Log error message
 */
export function logError(operation: string, message: string, error?: any): void {
  swLog('error', operation, message, error);
}