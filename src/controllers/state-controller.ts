import type { ReactiveController, ReactiveControllerHost } from 'lit';

export interface StateControllerOptions<T> {
  storageKey: string;
  defaultState: T;
  validator?: (value: any) => value is T;
  storage?: Storage;
  observedProperties?: (keyof T)[];
}

export class StateController<T extends Record<string, any>> implements ReactiveController {
  private host: ReactiveControllerHost;
  private currentState: T;
  private readonly storageKey: string;
  private readonly defaultState: T;
  private readonly validator: ((value: any) => value is T) | undefined;
  private readonly storage: Storage;
  private readonly observedProperties: (keyof T)[];

  constructor(host: ReactiveControllerHost, options: StateControllerOptions<T>) {
    this.host = host;
    this.storageKey = options.storageKey;
    this.defaultState = { ...options.defaultState };
    this.validator = options.validator;
    this.storage = options.storage || localStorage;
    this.observedProperties = options.observedProperties || [];
    this.currentState = { ...this.defaultState };

    host.addController(this);
  }

  hostConnected(): void {
    this.loadState();
  }

  hostDisconnected(): void {
    // Reactive controllers don't typically need cleanup on disconnect
    // The state is already persisted on each update
  }

  hostUpdated(): void {
    // Automatically sync observed properties from host component to state
    if (this.observedProperties.length > 0) {
      this.syncObservedProperties();
    }
  }

  private loadState(): void {
    try {
      const savedState = this.storage.getItem(this.storageKey);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        
        if (this.isValidState(parsedState)) {
          this.currentState = { ...parsedState };
          this.syncStateToObservedProperties();
          this.host.requestUpdate();
        } else {
          // Fall back to default state if validation fails
          this.currentState = { ...this.defaultState };
        }
      }
    } catch (error) {
      console.warn(`Failed to load state for key "${this.storageKey}":`, error);
      this.currentState = { ...this.defaultState };
    }
  }

  private saveState(): void {
    try {
      this.storage.setItem(this.storageKey, JSON.stringify(this.currentState));
    } catch (error) {
      console.warn(`Failed to save state for key "${this.storageKey}":`, error);
    }
  }

  private isValidState(state: any): state is T {
    if (this.validator) {
      return this.validator(state);
    }
    
    // Basic validation - check if state is an object and has the same keys as defaultState
    if (!state || typeof state !== 'object') {
      return false;
    }

    const defaultKeys = Object.keys(this.defaultState);
    const stateKeys = Object.keys(state);
    
    return defaultKeys.every(key => key in state) && 
           stateKeys.every(key => key in this.defaultState);
  }

  private syncObservedProperties(): void {
    const updates: Partial<T> = {};
    let hasChanges = false;

    for (const propName of this.observedProperties) {
      const hostValue = (this.host as any)[propName];
      const currentValue = this.currentState[propName];

      // Only update if the value has actually changed
      if (hostValue !== currentValue) {
        updates[propName] = hostValue;
        hasChanges = true;
      }
    }

    if (hasChanges) {
      // Update state without triggering host.requestUpdate() to avoid infinite loops
      const updatedState = { ...this.currentState, ...updates };
      
      if (this.isValidState(updatedState)) {
        this.currentState = updatedState;
        this.saveState();
      } else {
        console.warn(`Invalid state from observed properties for key "${this.storageKey}":`, updatedState);
      }
    }
  }

  private syncStateToObservedProperties(): void {
    // Sync loaded state values back to observed host component properties
    for (const propName of this.observedProperties) {
      const stateValue = this.currentState[propName];
      const hostValue = (this.host as any)[propName];

      // Only update if the values are different
      if (stateValue !== hostValue) {
        (this.host as any)[propName] = stateValue;
      }
    }
  }

  getState(): T {
    return { ...this.currentState };
  }

  setState(newState: Partial<T>): void {
    const updatedState = { ...this.currentState, ...newState };
    
    if (this.isValidState(updatedState)) {
      this.currentState = updatedState;
      this.saveState();
      this.host.requestUpdate();
    } else {
      console.warn(`Invalid state provided for key "${this.storageKey}":`, updatedState);
    }
  }

  updateState(updater: (currentState: T) => Partial<T>): void {
    const updates = updater(this.getState());
    this.setState(updates);
  }

  clearState(): void {
    this.currentState = { ...this.defaultState };
    try {
      this.storage.removeItem(this.storageKey);
    } catch (error) {
      console.warn(`Failed to clear state for key "${this.storageKey}":`, error);
    }
    this.host.requestUpdate();
  }

  // Helper method for getting a specific property from state
  getProp<K extends keyof T>(key: K): T[K] {
    return this.currentState[key];
  }

  // Helper method for updating a specific property in state
  setProp<K extends keyof T>(key: K, value: T[K]): void {
    this.setState({ [key]: value } as unknown as Partial<T>);
  }
}