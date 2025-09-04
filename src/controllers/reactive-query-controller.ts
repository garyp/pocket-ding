import type { ReactiveController, ReactiveControllerHost } from 'lit';
import { liveQuery } from 'dexie';

/**
 * Reactive controller that wraps Dexie liveQuery to automatically update Lit components
 * when database data changes. Handles subscription lifecycle and provides loading/error states.
 * 
 * The controller internally wraps the provided query function with liveQuery(), so callers
 * can provide raw database query functions that return Promise<T>.
 */
export class ReactiveQueryController<T> implements ReactiveController {
  #host: ReactiveControllerHost;
  #subscription: { unsubscribe(): void } | undefined = undefined;
  #queryFn: () => Promise<T>;
  #value: T | undefined = undefined;
  #loading = true;
  #error: Error | undefined = undefined;

  constructor(host: ReactiveControllerHost, queryFn: () => Promise<T>) {
    this.#host = host;
    this.#queryFn = queryFn;
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
   * Called when the host component disconnects from the DOM
   */
  hostDisconnected(): void {
    this.#unsubscribe();
  }

  /**
   * Update the query function and resubscribe
   */
  updateQuery(queryFn: () => Promise<T>): void {
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
      this.#host.requestUpdate();

      // Wrap the raw query function with liveQuery to make it reactive
      const observable = liveQuery(this.#queryFn);
      this.#subscription = observable.subscribe({
        next: (value: T) => {
          this.#value = value;
          this.#loading = false;
          this.#error = undefined;
          this.#host.requestUpdate();
        },
        error: (error: Error) => {
          this.#error = error;
          this.#loading = false;
          console.error('ReactiveQueryController error:', error);
          this.#host.requestUpdate();
        }
      });
    } catch (error) {
      this.#error = error instanceof Error ? error : new Error(String(error));
      this.#loading = false;
      console.error('ReactiveQueryController subscribe error:', error);
      this.#host.requestUpdate();
    }
  }

  #unsubscribe(): void {
    if (this.#subscription) {
      this.#subscription.unsubscribe();
      this.#subscription = undefined;
    }
  }
}

/**
 * Utility function to create a reactive query controller
 */
export function createReactiveQuery<T>(
  host: ReactiveControllerHost,
  queryFn: () => Promise<T>
): ReactiveQueryController<T> {
  return new ReactiveQueryController(host, queryFn);
}