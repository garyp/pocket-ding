/**
 * Targeted fake timer utilities for specific test scenarios.
 * Allows tests to use fake timers selectively rather than globally.
 */

import { vi } from 'vitest';

/**
 * Execute a function with fake timers enabled, then restore real timers.
 * Useful for testing specific timing behavior without affecting component lifecycle.
 * 
 * @example
 * ```typescript
 * const result = await withFakeTimers(async () => {
 *   const mockFn = vi.fn();
 *   setTimeout(mockFn, 1000);
 *   
 *   vi.advanceTimersByTime(1000);
 *   expect(mockFn).toHaveBeenCalled();
 *   
 *   return mockFn.mock.calls.length;
 * });
 * ```
 */
export async function withFakeTimers<T>(
  fn: () => T | Promise<T>
): Promise<T> {
  vi.useFakeTimers();
  
  try {
    const result = await fn();
    
    // Run any remaining timers before cleanup
    try {
      vi.runAllTimers();
    } catch (error) {
      // Ignore timer errors during cleanup
    }
    
    return result;
  } finally {
    vi.useRealTimers();
  }
}

/**
 * Create a test timeout that works with fake timers.
 * The timeout will be advanced automatically when using withFakeTimers.
 * 
 * @example
 * ```typescript
 * await withFakeTimers(async () => {
 *   const promise = createTestTimeout(() => {
 *     expect(component.isLoaded).toBe(true);
 *   }, 500);
 *   
 *   // Simulate component loading
 *   component.load();
 *   
 *   // Advance to trigger the timeout
 *   vi.advanceTimersByTime(500);
 *   
 *   await promise;
 * });
 * ```
 */
export function createTestTimeout<T>(
  callback: () => T,
  delay: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(callback());
      } catch (error) {
        reject(error);
      }
    }, delay);
  });
}

/**
 * Advance fake timers if they are currently active.
 * Safe to call whether fake timers are enabled or not.
 * 
 * @example
 * ```typescript
 * // In a test with fake timers enabled
 * setTimeout(mockFn, 100);
 * advanceTimersIfActive(100);
 * expect(mockFn).toHaveBeenCalled();
 * ```
 */
export function advanceTimersIfActive(ms: number): void {
  try {
    if (typeof vi.getTimerCount === 'function') {
      vi.advanceTimersByTime(ms);
    }
  } catch (error) {
    // Timers not active or advancement failed, ignore
  }
}

/**
 * Wait for a specific amount of real time, useful for component operations.
 * Always uses real timers regardless of fake timer state.
 * 
 * @example
 * ```typescript
 * // Allow component to initialize naturally
 * await waitRealTime(50);
 * expect(component.isReady).toBe(true);
 * ```
 */
export function waitRealTime(ms: number): Promise<void> {
  return new Promise(resolve => {
    // Store original setTimeout to avoid fake timer interference
    const originalSetTimeout = globalThis.setTimeout;
    originalSetTimeout(resolve, ms);
  });
}