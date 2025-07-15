import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StateController } from '../../controllers/state-controller';
import type { ReactiveControllerHost } from 'lit';

interface TestState {
  name: string;
  count: number;
  active: boolean;
}

describe('StateController', () => {
  let mockHost: ReactiveControllerHost;
  let controller: StateController<TestState>;
  const defaultState: TestState = { name: 'test', count: 0, active: false };

  beforeEach(() => {
    localStorage.clear();
    mockHost = {
      addController: vi.fn(),
      requestUpdate: vi.fn(),
      removeController: vi.fn(),
      updateComplete: Promise.resolve(true)
    };
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('initialization', () => {
    it('should initialize with default state when no saved state exists', () => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });

      expect(controller.getState()).toEqual(defaultState);
    });

    it('should register itself with the host', () => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });

      expect(mockHost.addController).toHaveBeenCalledWith(controller);
    });

    it('should use custom storage when provided', () => {
      const customStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      } as unknown as Storage;

      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState,
        storage: customStorage
      });

      // Trigger hostConnected to call loadState
      controller.hostConnected();
      expect(customStorage.getItem).toHaveBeenCalledWith('test-state');
    });
  });

  describe('hostConnected', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should load saved state from localStorage', () => {
      const savedState: TestState = { name: 'saved', count: 5, active: true };
      localStorage.setItem('test-state', JSON.stringify(savedState));

      controller.hostConnected();

      expect(controller.getState()).toEqual(savedState);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should fall back to default state on parse errors', () => {
      localStorage.setItem('test-state', 'invalid-json');

      controller.hostConnected();

      expect(controller.getState()).toEqual(defaultState);
    });

    it('should validate saved state with custom validator', () => {
      const validator = (state: any): state is TestState => {
        return state && typeof state.name === 'string' && state.name.length > 0;
      };

      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState,
        validator
      });

      // Valid state should be loaded
      const validState: TestState = { name: 'valid', count: 10, active: true };
      localStorage.setItem('test-state', JSON.stringify(validState));
      controller.hostConnected();
      expect(controller.getState()).toEqual(validState);

      // Invalid state should fall back to default
      const invalidState = { name: '', count: 10, active: true };
      localStorage.setItem('test-state', JSON.stringify(invalidState));
      controller.hostConnected();
      expect(controller.getState()).toEqual(defaultState);
    });

    it('should validate saved state with default validation', () => {
      // Missing properties should be rejected
      const invalidState = { name: 'test' }; // missing count and active
      localStorage.setItem('test-state', JSON.stringify(invalidState));

      controller.hostConnected();

      expect(controller.getState()).toEqual(defaultState);
    });
  });

  describe('setState', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should update state and persist to storage', () => {
      const newState = { name: 'updated', count: 3, active: true };

      controller.setState(newState);

      expect(controller.getState()).toEqual(newState);
      expect(mockHost.requestUpdate).toHaveBeenCalled();

      const savedData = localStorage.getItem('test-state');
      expect(JSON.parse(savedData!)).toEqual(newState);
    });

    it('should support partial state updates', () => {
      controller.setState({ count: 10 });

      expect(controller.getState()).toEqual({
        name: 'test',
        count: 10,
        active: false
      });
    });

    it('should reject invalid state updates', () => {
      const validator = (state: any): state is TestState => {
        return state.count >= 0;
      };

      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState,
        validator
      });

      controller.setState({ count: -5 });

      // State should remain unchanged
      expect(controller.getState()).toEqual(defaultState);
    });

    it('should handle storage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      // Mock setItem to throw an error
      const setItemMock = vi.fn(() => {
        throw new Error('Storage quota exceeded');
      });
      
      Object.defineProperty(global.localStorage, 'setItem', {
        value: setItemMock,
        writable: true
      });

      controller.setState({ count: 5 });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to save state for key "test-state":',
        expect.any(Error)
      );

      // Restore localStorage
      Object.defineProperty(global.localStorage, 'setItem', {
        value: Storage.prototype.setItem,
        writable: true
      });
      consoleWarnSpy.mockRestore();
    });
  });

  describe('updateState', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should update state using updater function', () => {
      controller.updateState(current => ({
        count: current.count + 1,
        active: !current.active
      }));

      expect(controller.getState()).toEqual({
        name: 'test',
        count: 1,
        active: true
      });
    });

    it('should pass current state to updater function', () => {
      controller.setState({ name: 'initial', count: 5, active: true });

      controller.updateState(current => {
        expect(current).toEqual({ name: 'initial', count: 5, active: true });
        return { count: current.count * 2 };
      });

      expect(controller.getState().count).toBe(10);
    });
  });

  describe('clearState', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should reset to default state', () => {
      controller.setState({ name: 'modified', count: 100, active: true });
      controller.clearState();

      expect(controller.getState()).toEqual(defaultState);
      expect(mockHost.requestUpdate).toHaveBeenCalled();
    });

    it('should remove data from storage', () => {
      controller.setState({ count: 50 });
      controller.clearState();

      const savedData = localStorage.getItem('test-state');
      expect(savedData).toBeNull();
    });

    it('should handle storage errors gracefully', () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      
      const removeItemMock = vi.fn(() => {
        throw new Error('Storage error');
      });
      
      Object.defineProperty(global.localStorage, 'removeItem', {
        value: removeItemMock,
        writable: true
      });

      controller.clearState();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to clear state for key "test-state":',
        expect.any(Error)
      );

      // Restore localStorage
      Object.defineProperty(global.localStorage, 'removeItem', {
        value: Storage.prototype.removeItem,
        writable: true
      });
      consoleWarnSpy.mockRestore();
    });
  });

  describe('property helpers', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should get specific property with getProp', () => {
      controller.setState({ name: 'property-test', count: 42 });

      expect(controller.getProp('name')).toBe('property-test');
      expect(controller.getProp('count')).toBe(42);
      expect(controller.getProp('active')).toBe(false);
    });

    it('should set specific property with setProp', () => {
      controller.setProp('count', 99);

      expect(controller.getState()).toEqual({
        name: 'test',
        count: 99,
        active: false
      });
    });

    it('should persist changes made with setProp', () => {
      controller.setProp('name', 'persisted');

      const savedData = localStorage.getItem('test-state');
      const savedState = JSON.parse(savedData!);
      expect(savedState.name).toBe('persisted');
    });
  });

  describe('state immutability', () => {
    beforeEach(() => {
      controller = new StateController(mockHost, {
        storageKey: 'test-state',
        defaultState
      });
    });

    it('should return a copy of state from getState', () => {
      controller.setState({ name: 'original', count: 10 });

      const state1 = controller.getState();
      state1.name = 'modified';

      const state2 = controller.getState();
      expect(state2.name).toBe('original'); // Should not be affected
    });

    it('should not mutate the default state', () => {
      const originalDefault = { ...defaultState };
      
      controller.setState({ count: 100 });
      controller.clearState();

      expect(defaultState).toEqual(originalDefault);
    });
  });

  describe('generic type support', () => {
    interface CustomState {
      id: number;
      items: string[];
      metadata: { version: number };
    }

    it('should work with complex generic types', () => {
      const customDefault: CustomState = {
        id: 1,
        items: ['a', 'b'],
        metadata: { version: 1 }
      };

      const customController = new StateController<CustomState>(mockHost, {
        storageKey: 'custom-state',
        defaultState: customDefault,
        validator: (state: any): state is CustomState => {
          return state && 
                 typeof state.id === 'number' &&
                 Array.isArray(state.items) &&
                 state.metadata && 
                 typeof state.metadata.version === 'number';
        }
      });

      customController.setState({
        items: ['x', 'y', 'z'],
        metadata: { version: 2 }
      });

      const state = customController.getState();
      expect(state.id).toBe(1); // Preserved
      expect(state.items).toEqual(['x', 'y', 'z']); // Updated
      expect(state.metadata.version).toBe(2); // Updated
    });
  });

  describe('automatic property observation', () => {
    let mockComponent: any;

    beforeEach(() => {
      mockComponent = {
        addController: vi.fn(),
        requestUpdate: vi.fn(),
        removeController: vi.fn(),
        updateComplete: Promise.resolve(true),
        // Mock component properties that will be observed
        name: 'initial',
        count: 0,
        active: false
      };
    });

    it('should observe specified properties and save state when they change', () => {
      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState,
        observedProperties: ['name', 'count']
      });

      // Simulate property changes on the component
      mockComponent.name = 'changed';
      mockComponent.count = 5;

      // Trigger the hostUpdated lifecycle method
      controller.hostUpdated();

      // State should be automatically updated
      const state = controller.getState();
      expect(state.name).toBe('changed');
      expect(state.count).toBe(5);
      expect(state.active).toBe(false); // Not observed, should remain default

      // State should be persisted to localStorage
      const savedData = localStorage.getItem('test-state');
      expect(JSON.parse(savedData!)).toEqual({
        name: 'changed', 
        count: 5, 
        active: false
      });
    });

    it('should only save state when observed properties actually change', () => {
      const mockStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn()
      } as unknown as Storage;

      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState,
        observedProperties: ['name'],
        storage: mockStorage
      });

      // First update - should save
      mockComponent.name = 'changed';
      controller.hostUpdated();
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);

      // Second update with same value - should not save
      vi.clearAllMocks();
      controller.hostUpdated();
      expect(mockStorage.setItem).not.toHaveBeenCalled();

      // Third update with different value - should save
      mockComponent.name = 'changed-again';
      controller.hostUpdated();
      expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should restore saved state to observed properties on hostConnected', () => {
      const savedState: TestState = { name: 'restored', count: 10, active: true };
      localStorage.setItem('test-state', JSON.stringify(savedState));

      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState,
        observedProperties: ['name', 'count', 'active']
      });

      // Trigger hostConnected
      controller.hostConnected();

      // Component properties should be restored from saved state
      expect(mockComponent.name).toBe('restored');
      expect(mockComponent.count).toBe(10);
      expect(mockComponent.active).toBe(true);
    });

    it('should work without observed properties (backwards compatibility)', () => {
      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState
        // No observedProperties specified
      });

      // hostUpdated should work without errors
      expect(() => controller.hostUpdated()).not.toThrow();

      // Manual methods should still work
      controller.setState({ name: 'manual', count: 1, active: true });
      expect(controller.getState()).toEqual({ name: 'manual', count: 1, active: true });
    });

    it('should validate observed property updates', () => {
      const validator = (state: any): state is TestState => {
        return state && typeof state.name === 'string' && state.name.length > 0;
      };

      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState,
        observedProperties: ['name'],
        validator
      });

      // Valid update should work
      mockComponent.name = 'valid-name';
      controller.hostUpdated();
      expect(controller.getState().name).toBe('valid-name');

      // Invalid update should be rejected
      mockComponent.name = '';
      controller.hostUpdated();
      expect(controller.getState().name).toBe('valid-name'); // Should remain unchanged
    });

    it('should handle mixed automatic and manual updates', () => {
      controller = new StateController(mockComponent, {
        storageKey: 'test-state',
        defaultState,
        observedProperties: ['name']
      });

      // Automatic update through observed property
      mockComponent.name = 'auto-updated';
      controller.hostUpdated();

      // Manual update of non-observed property
      controller.setProp('count', 42);

      const state = controller.getState();
      expect(state.name).toBe('auto-updated');
      expect(state.count).toBe(42);
      expect(state.active).toBe(false);
    });
  });
});