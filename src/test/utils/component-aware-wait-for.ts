/**
 * Component-aware waitFor utility that automatically advances fake timers
 * for Lit component operations while maintaining test control over timing.
 */

import { vi } from 'vitest';

export interface WaitForComponentOptions {
  /**
   * Maximum time to wait in milliseconds
   * @default 5000
   */
  timeout?: number;
  
  /**
   * How often to check the assertion in milliseconds
   * @default 50
   */
  interval?: number;
  
  /**
   * Whether to automatically advance timers between checks.
   * This helps Lit components process their internal setTimeout calls.
   * @default true
   */
  advanceTimers?: boolean;
  
  /**
   * How much to advance timers by on each check (ms).
   * Small values work for most Lit internal timing.
   * @default 10
   */
  timerAdvancement?: number;
}

/**
 * Enhanced waitFor that automatically advances fake timers for component operations.
 * 
 * This utility is designed to work with Lit components that use internal setTimeout
 * calls for lifecycle management and reactive updates. It automatically advances
 * fake timers between assertion attempts to allow component internal timing to proceed.
 * 
 * @example
 * ```typescript
 * // Wait for a component to render content
 * await waitForComponent(() => {
 *   const container = appRoot.shadowRoot?.querySelector('bookmark-list-container');
 *   expect(container).toBeTruthy();
 * });
 * 
 * // Wait with custom timing
 * await waitForComponent(() => {
 *   expect(component.isReady).toBe(true);
 * }, { 
 *   timeout: 10000,
 *   interval: 100,
 *   timerAdvancement: 20 
 * });
 * 
 * // Disable timer advancement for non-component operations
 * await waitForComponent(() => {
 *   expect(mockApi.callCount).toBe(3);
 * }, { 
 *   advanceTimers: false 
 * });
 * ```
 */
export async function waitForComponent<T>(
  assertion: () => T,
  options: WaitForComponentOptions = {}
): Promise<T> {
  const { 
    timeout = 5000, 
    interval = 50, 
    advanceTimers = true,
    timerAdvancement = 10
  } = options;
  
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const check = () => {
      try {
        const result = assertion();
        resolve(result);
      } catch (error) {
        const elapsed = Date.now() - startTime;
        
        if (elapsed >= timeout) {
          reject(new Error(`waitForComponent timed out after ${timeout}ms. Last error: ${error}`));
          return;
        }
        
        // Auto-advance timers between checks for component operations
        if (advanceTimers) {
          try {
            // Check if fake timers are active before advancing
            if (typeof vi.getTimerCount === 'function') {
              vi.advanceTimersByTime(timerAdvancement);
            }
          } catch (timerError) {
            // Timer advancement errors shouldn't fail the wait, just continue
            console.warn('Timer advancement failed:', timerError);
          }
        }
        
        setTimeout(check, interval);
      }
    };
    
    check();
  });
}

/**
 * Convenience wrapper for waiting for component initialization.
 * Automatically waits for component.updateComplete if available.
 * 
 * @example
 * ```typescript
 * const appRoot = document.createElement('app-root') as AppRoot;
 * document.body.appendChild(appRoot);
 * 
 * await waitForComponentReady(appRoot);
 * // Component is now ready for interaction
 * ```
 */
export async function waitForComponentReady<T extends HTMLElement>(
  component: T,
  options: WaitForComponentOptions = {}
): Promise<void> {
  const mergedOptions = {
    timeout: 3000,
    interval: 25,
    timerAdvancement: 50, // More aggressive for initialization
    ...options
  };
  
  // Wait for updateComplete if it's a Lit component
  if (component && typeof component === 'object' && 'updateComplete' in component && typeof (component as any).updateComplete?.then === 'function') {
    await waitForComponent(async () => {
      // Advance timers before waiting for updateComplete
      if (mergedOptions.advanceTimers !== false) {
        try {
          if (typeof vi.getTimerCount === 'function') {
            vi.advanceTimersByTime(50);
          }
        } catch (error) {
          // Timers not mocked, continue without advancing
        }
      }
      await (component as any).updateComplete;
      return true;
    }, mergedOptions);
  }
  
  // Additional wait for any pending component operations
  await waitForComponent(() => {
    return true; // Component should be ready
  }, { 
    ...mergedOptions,
    timeout: 500, // Shorter timeout for final check
    timerAdvancement: 25
  });
}