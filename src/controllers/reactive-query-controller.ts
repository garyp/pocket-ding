import { type ReactiveController, type ReactiveControllerHost } from 'lit';
import { liveQuery, type Subscription } from 'dexie';

export interface ReactiveQueryOptions<T> {
  query: () => Promise<T>;
  onError?: (error: Error) => void;
  enabled?: boolean;
}

export interface QueryRenderCallbacks<T> {
  pending?: () => any;
  value?: (data: T) => any;
  error?: (error: Error) => any;
}

export class ReactiveQueryController<T> implements ReactiveController {
  private subscription: Subscription | null = null;
  private currentValue: T | undefined = undefined;
  private isLoading = true;
  private error: Error | null = null;

  constructor(
    private host: ReactiveControllerHost,
    private options: ReactiveQueryOptions<T>
  ) {
    host.addController(this);
  }

  hostConnected(): void {
    if (this.options.enabled !== false) {
      this.subscribe();
    }
  }

  hostDisconnected(): void {
    this.unsubscribe();
  }

  private subscribe(): void {
    this.subscription = liveQuery(this.options.query).subscribe({
      next: (value) => {
        this.currentValue = value;
        this.isLoading = false;
        this.error = null;
        this.host.requestUpdate();
      },
      error: (error) => {
        this.error = error;
        this.isLoading = false;
        this.options.onError?.(error);
        this.host.requestUpdate();
      }
    });
  }

  private unsubscribe(): void {
    this.subscription?.unsubscribe();
    this.subscription = null;
  }

  // Render method similar to Lit's Task.render()
  render<R>(callbacks: QueryRenderCallbacks<T>): R | undefined {
    if (this.error && callbacks.error) {
      return callbacks.error(this.error);
    }
    
    if (this.isLoading && callbacks.pending) {
      return callbacks.pending();
    }
    
    if (!this.isLoading && callbacks.value) {
      return callbacks.value(this.currentValue as T);
    }
    
    return undefined;
  }

  // Legacy API for backward compatibility
  get value(): T | undefined { 
    return this.currentValue; 
  }
  
  get loading(): boolean { 
    return this.isLoading; 
  }
  
  get hasError(): boolean { 
    return this.error !== null; 
  }
  
  get errorMessage(): string | null { 
    return this.error?.message || null; 
  }

  // Allow enabling/disabling the query
  setEnabled(enabled: boolean): void {
    if (enabled && !this.subscription) {
      this.subscribe();
    } else if (!enabled && this.subscription) {
      this.unsubscribe();
      this.isLoading = false;
      this.host.requestUpdate();
    }
  }

  // Update query dynamically
  updateQuery(newQuery: () => Promise<T>): void {
    this.options.query = newQuery;
    if (this.subscription) {
      this.unsubscribe();
      this.subscribe();
    }
  }
}