import type { ReactiveController, ReactiveControllerHost } from 'lit';

export interface StateControllerOptions<T> {
  storageKey: string;
  defaultState: T;
  validator?: (value: any) => value is T;
  storage?: Storage;
}

export class StateController<T extends Record<string, any>> implements ReactiveController {
  private host: ReactiveControllerHost;
  private currentState: T;
  private readonly storageKey: string;
  private readonly defaultState: T;
  private readonly validator?: (value: any) => value is T;
  private readonly storage: Storage;

  constructor(host: ReactiveControllerHost, options: StateControllerOptions<T>) {
    this.host = host;
    this.storageKey = options.storageKey;
    this.defaultState = { ...options.defaultState };
    this.validator = options.validator;
    this.storage = options.storage || localStorage;
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

  private loadState(): void {
    try {
      const savedState = this.storage.getItem(this.storageKey);
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        
        if (this.isValidState(parsedState)) {
          this.currentState = { ...parsedState };
          this.host.requestUpdate();
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
    this.setState({ [key]: value } as Partial<T>);
  }
}