import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { liveQuery } from 'dexie';
import { DebugService } from '../services/debug-service';

/**
 * Reactive controller that wraps Dexie liveQuery to automatically update Lit components
 * when database data changes. Handles subscription lifecycle, provides loading/error states,
 * and automatically reacts to dependency changes.
 * 
 * The controller internally wraps the provided query function with liveQuery(), so callers
 * can provide raw database query functions that return Promise<T>.
 * 
 * Similar to Lit's Task, the queryFn receives dependencies as parameters, and a dependency
 * function returns the current values. When dependencies change, the query is automatically updated.
 */
export class ReactiveQueryController<T, Args extends readonly unknown[] = []> implements ReactiveController {
  #host: ReactiveControllerHost;
  #subscription: { unsubscribe(): void } | undefined = undefined;
  #queryFn: (...args: Args) => Promise<T>;
  #dependencyFn: (() => Args) | undefined;
  #lastDependencies: Args | undefined = undefined;
  #value: T | undefined = undefined;
  #loading = true;
  #error: Error | undefined = undefined;
  #loadingTimeout: ReturnType<typeof setTimeout> | undefined = undefined;

  constructor(
    host: ReactiveControllerHost, 
    queryFn: (...args: Args) => Promise<T>,
    dependencyFn?: () => Args
  ) {
    this.#host = host;
    this.#queryFn = queryFn;
    this.#dependencyFn = dependencyFn;
    host.addController(this);
  }

  /**
   * Current value from the reactive query
   */
  get value(): T | undefined {
    return this.#value;
  }

  /**
   * Whether the query is currently loading
   */
  get loading(): boolean {
    return this.#loading;
  }

  /**
   * Current error state, if any
   */
  get error(): Error | undefined {
    return this.#error;
  }

  /**
   * Called when the host component connects to the DOM
   */
  hostConnected(): void {
    this.#subscribe();
  }
  
  /**
   * Called on each render cycle to check for dependency changes
   */
  hostUpdate(): void {
    if (this.#dependencyFn) {
      const currentDependencies = this.#dependencyFn();
      if (!this.#areDependenciesEqual(currentDependencies, this.#lastDependencies)) {
        this.#lastDependencies = currentDependencies;
        if (this.#subscription) {
          this.#unsubscribe();
          this.#subscribe();
        }
      }
    }
  }

  /**
   * Called when the host component disconnects from the DOM
   */
  hostDisconnected(): void {
    this.#unsubscribe();
  }

  /**
   * Update the query function and resubscribe
   */
  updateQuery(queryFn: (...args: Args) => Promise<T>): void {
    this.#queryFn = queryFn;
    if (this.#subscription) {
      this.#unsubscribe();
      this.#subscribe();
    }
  }

  /**
   * Manually refresh the query (useful for error recovery)
   */
  refresh(): void {
    if (this.#subscription) {
      this.#unsubscribe();
      this.#subscribe();
    }
  }

  #subscribe(): void {
    try {
      this.#loading = true;
      this.#error = undefined;
      this.#clearLoadingTimeout();
      this.#host.requestUpdate();

      // Get current dependencies and create query function with them
      const dependencies = this.#dependencyFn ? this.#dependencyFn() : ([] as unknown as Args);

      // Don't run query if any dependency is null or undefined
      const hasValidDependencies = dependencies.every(dep => dep != null);
      if (!hasValidDependencies) {
        // For queries with dependencies, we need to wait for valid dependencies
        // But we shouldn't stay loading forever if dependencies never become valid
        this.#loading = false;
        this.#value = undefined;
        this.#host.requestUpdate();
        return;
      }

      // Set up timeout to prevent infinite loading state
      this.#loadingTimeout = setTimeout(() => {
        if (this.#loading) {
          DebugService.logWarning(
            'app',
            `ReactiveQueryController: Query timed out after 5 seconds in ${this.#host.constructor.name}`,
            { dependencies, queryFn: this.#queryFn.toString().substring(0, 100) }
          );
          this.#error = new Error('Query timed out - database query did not respond within 5 seconds');
          this.#loading = false;
          this.#host.requestUpdate();
        }
      }, 5000); // 5 second timeout

      const queryWithDeps = () => {
        try {
          return this.#queryFn(...(dependencies as Args));
        } catch (error) {
          DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Query function threw error');
          throw error;
        }
      };

      // Wrap the raw query function with liveQuery to make it reactive
      const observable = liveQuery(queryWithDeps);

      // Add additional safety check - if subscription doesn't call next() within a reasonable time,
      // we might have a stalled liveQuery subscription
      let subscriptionStarted = false;

      this.#subscription = observable.subscribe({
        next: (value: T) => {
          subscriptionStarted = true;
          this.#clearLoadingTimeout();
          this.#value = value;
          this.#loading = false;
          this.#error = undefined;
          this.#host.requestUpdate();
        },
        error: (error: Error) => {
          subscriptionStarted = true;
          this.#clearLoadingTimeout();
          this.#error = error;
          this.#loading = false;
          DebugService.logError(error, 'app', 'liveQuery subscription error');
          this.#host.requestUpdate();
        }
      });

      // Additional safety check: if liveQuery subscription never starts, we have a deeper issue
      setTimeout(() => {
        if (this.#loading && !subscriptionStarted) {
          DebugService.logError(
            new Error('liveQuery subscription never started - this may indicate a database connection issue'),
            'app',
            `Subscription failed in ${this.#host.constructor.name}`,
            { dependencies }
          );
          this.#clearLoadingTimeout();
          this.#error = new Error('Database subscription failed to initialize - this may indicate a database connection issue');
          this.#loading = false;
          this.#host.requestUpdate();
        }
      }, 2000); // Check after 2 seconds if subscription has started

    } catch (error) {
      this.#clearLoadingTimeout();
      this.#error = error instanceof Error ? error : new Error(String(error));
      this.#loading = false;
      DebugService.logError(error instanceof Error ? error : new Error(String(error)), 'app', 'Subscribe method error');
      this.#host.requestUpdate();
    }
  }
  
  #areDependenciesEqual(a: Args | undefined, b: Args | undefined): boolean {
    if (a === b) return true;
    if (!a || !b) return false;
    if (a.length !== b.length) return false;
    
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== b[i]) return false;
    }
    return true;
  }

  #clearLoadingTimeout(): void {
    if (this.#loadingTimeout) {
      clearTimeout(this.#loadingTimeout);
      this.#loadingTimeout = undefined;
    }
  }

  #unsubscribe(): void {
    this.#clearLoadingTimeout();
    if (this.#subscription) {
      this.#subscription.unsubscribe();
      this.#subscription = undefined;
    }
  }
}

/**
 * Utility function to create a reactive query controller
 */
export function createReactiveQuery<T, Args extends readonly unknown[] = []>(
  host: ReactiveControllerHost,
  queryFn: (...args: Args) => Promise<T>,
  dependencyFn?: () => Args
): ReactiveQueryController<T, Args> {
  return new ReactiveQueryController(host, queryFn, dependencyFn);
}