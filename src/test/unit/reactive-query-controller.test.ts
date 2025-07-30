import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { ReactiveQueryController, type QueryRenderCallbacks } from '../../controllers/reactive-query-controller';

// Mock Dexie
let mockSubscription: { unsubscribe: ReturnType<typeof vi.fn> };
let mockLiveQueryResult: { subscribe: ReturnType<typeof vi.fn> };

vi.mock('dexie', () => ({
  liveQuery: vi.fn((_query) => mockLiveQueryResult)
}));

// Create a test host component
@customElement('test-host')
class TestHost extends LitElement {
  controller: ReactiveQueryController<any> | null = null;
  updateCallCount = 0;

  override requestUpdate() {
    this.updateCallCount++;
    return super.requestUpdate();
  }

  override render() {
    return html`<div>Test Host</div>`;
  }
}

describe('ReactiveQueryController', () => {
  let host: TestHost;
  let mockQuery: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    
    mockQuery = vi.fn().mockResolvedValue('test-data');
    mockSubscription = {
      unsubscribe: vi.fn()
    };
    
    mockLiveQueryResult = {
      subscribe: vi.fn().mockReturnValue(mockSubscription)
    };

    // Mock liveQuery to return our mock live query result  
    const { liveQuery } = await import('dexie');
    vi.mocked(liveQuery).mockReturnValue(mockLiveQueryResult as any);

    host = new TestHost();
    document.body.appendChild(host);
    await host.updateComplete;
  });

  afterEach(() => {
    host.remove();
  });

  describe('constructor and initialization', () => {
    it('should create controller with basic options', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      expect(controller).toBeDefined();
      expect(controller.loading).toBe(true); // Initially loading
      expect(controller.value).toBeUndefined(); // No initial value
      expect(controller.hasError).toBe(false);
    });

    it('should handle onError callback option', () => {
      const errorCallback = vi.fn();
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        onError: errorCallback
      });

      expect(controller).toBeDefined();
    });

    it('should handle enabled option', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        enabled: false
      });

      expect(controller).toBeDefined();
    });
  });

  describe('hostConnected lifecycle', () => {
    it('should subscribe to query when enabled', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      host.controller = controller;
      controller.hostConnected();

      const { liveQuery } = await import('dexie');
      expect(liveQuery).toHaveBeenCalledWith(mockQuery);
      expect(mockLiveQueryResult.subscribe).toHaveBeenCalled();
    });

    it('should not subscribe when disabled', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        enabled: false
      });

      controller.hostConnected();

      const { liveQuery } = await import('dexie');
      expect(liveQuery).not.toHaveBeenCalled();
    });

    it('should handle missing query gracefully', () => {
      const controller = new ReactiveQueryController(host, {
        query: null as any
      });

      controller.hostConnected();

      expect(controller.loading).toBe(false);
      expect(host.updateCallCount).toBeGreaterThan(0);
    });
  });

  describe('hostDisconnected lifecycle', () => {
    it('should unsubscribe when disconnected', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      controller.hostDisconnected();

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('query subscription handling', () => {
    it('should handle successful query results', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();

      // Simulate successful subscription
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.next('test-result');

      expect(controller.value).toBe('test-result');
      expect(controller.loading).toBe(false);
      expect(controller.hasError).toBe(false);
      expect(host.updateCallCount).toBeGreaterThan(0);
    });

    it('should handle query errors', async () => {
      const errorCallback = vi.fn();
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        onError: errorCallback
      });

      controller.hostConnected();

      // Simulate error
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      const testError = new Error('Test error');
      subscribeCallback.error(testError);

      expect(controller.hasError).toBe(true);
      expect(controller.errorMessage).toBe('Test error');
      expect(controller.loading).toBe(false);
      expect(errorCallback).toHaveBeenCalledWith(testError);
      expect(host.updateCallCount).toBeGreaterThan(0);
    });

    it('should handle liveQuery initialization errors', async () => {
      const errorCallback = vi.fn();
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        onError: errorCallback
      });

      // Mock liveQuery to throw
      const { liveQuery } = await import('dexie');
      const testError = new Error('liveQuery failed');
      vi.mocked(liveQuery).mockImplementation(() => {
        throw testError;
      });

      controller.hostConnected();

      expect(controller.hasError).toBe(true);
      expect(controller.errorMessage).toBe('liveQuery failed');
      expect(controller.loading).toBe(false);
      expect(errorCallback).toHaveBeenCalledWith(testError);
    });
  });

  describe('render method (Task.render() style API)', () => {
    it('should call pending callback when loading', () => {
      const controller = new ReactiveQueryController<string>(host, {
        query: mockQuery
      });

      const callbacks: QueryRenderCallbacks<string> = {
        pending: vi.fn().mockReturnValue('loading...'),
        value: vi.fn().mockReturnValue('complete'),
        error: vi.fn().mockReturnValue('error')
      };

      const result = controller.render(callbacks);

      expect(callbacks.pending).toHaveBeenCalled();
      expect(callbacks.value).not.toHaveBeenCalled();
      expect(callbacks.error).not.toHaveBeenCalled();
      expect(result).toBe('loading...');
    });

    it('should call complete callback when data is loaded', async () => {
      const controller = new ReactiveQueryController<string>(host, {
        query: mockQuery
      });

      controller.hostConnected();

      // Simulate successful data loading
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.next('test-data');

      const callbacks: QueryRenderCallbacks<string> = {
        pending: vi.fn().mockReturnValue('loading...'),
        value: vi.fn().mockReturnValue('data loaded'),
        error: vi.fn().mockReturnValue('error')
      };

      const result = controller.render(callbacks);

      expect(callbacks.pending).not.toHaveBeenCalled();
      expect(callbacks.value).toHaveBeenCalledWith('test-data');
      expect(callbacks.error).not.toHaveBeenCalled();
      expect(result).toBe('data loaded');
    });

    it('should call error callback when there is an error', async () => {
      const controller = new ReactiveQueryController<string>(host, {
        query: mockQuery
      });

      controller.hostConnected();

      // Simulate error
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      const testError = new Error('Test error');
      subscribeCallback.error(testError);

      const callbacks: QueryRenderCallbacks<string> = {
        pending: vi.fn().mockReturnValue('loading...'),
        value: vi.fn().mockReturnValue('complete'),
        error: vi.fn().mockReturnValue('error occurred')
      };

      const result = controller.render(callbacks);

      expect(callbacks.pending).not.toHaveBeenCalled();
      expect(callbacks.value).not.toHaveBeenCalled();
      expect(callbacks.error).toHaveBeenCalledWith(testError);
      expect(result).toBe('error occurred');
    });

    it('should return undefined when no appropriate callback is provided', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      const result = controller.render({});

      expect(result).toBeUndefined();
    });

    it('should handle partial callback configurations', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.next('test-data');

      // Only provide complete callback
      const result = controller.render({
        value: (value) => `Got: ${value}`
      });

      expect(result).toBe('Got: test-data');
    });
  });

  describe('legacy API compatibility', () => {
    it('should provide legacy value getter', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.next('legacy-value');

      expect(controller.value).toBe('legacy-value');
    });

    it('should provide legacy loading getter', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      expect(controller.loading).toBe(true);
    });

    it('should provide legacy error getters', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      const testError = new Error('Legacy error');
      subscribeCallback.error(testError);

      expect(controller.hasError).toBe(true);
      expect(controller.errorMessage).toBe('Legacy error');
    });
  });

  describe('setEnabled method', () => {
    it('should enable subscription when set to true', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        enabled: false
      });

      controller.hostConnected();
      expect(mockLiveQueryResult.subscribe).not.toHaveBeenCalled();

      controller.setEnabled(true);

      const { liveQuery } = await import('dexie');
      expect(liveQuery).toHaveBeenCalledWith(mockQuery);
      expect(mockLiveQueryResult.subscribe).toHaveBeenCalled();
    });

    it('should disable subscription when set to false', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      controller.setEnabled(false);

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      expect(controller.loading).toBe(false);
      expect(host.updateCallCount).toBeGreaterThan(0);
    });
  });

  describe('updateQuery method', () => {
    it('should update query and resubscribe', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();

      const newQuery = vi.fn().mockResolvedValue('new-data');
      controller.updateQuery(newQuery);

      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      
      const { liveQuery } = await import('dexie');
      expect(liveQuery).toHaveBeenCalledWith(newQuery);
    });

    it('should not resubscribe if not currently subscribed', () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery,
        enabled: false
      });

      const newQuery = vi.fn().mockResolvedValue('new-data');
      controller.updateQuery(newQuery);

      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle null/undefined values correctly', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      
      // Test with null
      subscribeCallback.next(null);
      expect(controller.value).toBe(null);

      // Test with undefined
      subscribeCallback.next(undefined);
      expect(controller.value).toBe(undefined);
    });

    it('should handle multiple rapid updates', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      
      subscribeCallback.next('value1');
      subscribeCallback.next('value2');
      subscribeCallback.next('value3');

      expect(controller.value).toBe('value3');
      expect(controller.loading).toBe(false);
      expect(controller.hasError).toBe(false);
    });

    it('should recover from errors when new data arrives', async () => {
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      
      // First trigger an error
      subscribeCallback.error(new Error('Test error'));
      expect(controller.hasError).toBe(true);

      // Then recover with new data
      subscribeCallback.next('recovered-data');
      expect(controller.hasError).toBe(false);
      expect(controller.value).toBe('recovered-data');
    });
  });

  describe('host integration', () => {
    it('should trigger host updates on data changes', async () => {
      const initialUpdateCount = host.updateCallCount;
      
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.next('update-trigger');

      expect(host.updateCallCount).toBeGreaterThan(initialUpdateCount);
    });

    it('should trigger host updates on errors', async () => {
      const initialUpdateCount = host.updateCallCount;
      
      const controller = new ReactiveQueryController(host, {
        query: mockQuery
      });

      controller.hostConnected();
      const subscribeCallback = mockLiveQueryResult.subscribe.mock.calls[0]![0];
      subscribeCallback.error(new Error('Update on error'));

      expect(host.updateCallCount).toBeGreaterThan(initialUpdateCount);
    });
  });
});