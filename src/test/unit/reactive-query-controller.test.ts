import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';
import { ReactiveQueryController } from '../../controllers/reactive-query-controller';
import { liveQuery } from 'dexie';

// Mock Dexie liveQuery
vi.mock('dexie', () => ({
  liveQuery: vi.fn()
}));

// Test component that uses the reactive query controller
@customElement('test-component')
class TestComponent extends LitElement {
  #queryController = new ReactiveQueryController(
    this,
    () => Promise.resolve(['test', 'data'])
  );

  get data() {
    return this.#queryController.value;
  }

  get loading() {
    return this.#queryController.loading;
  }

  get error() {
    return this.#queryController.error;
  }

  updateQuery(queryFn: () => any) {
    this.#queryController.updateQuery(queryFn);
  }

  refresh() {
    this.#queryController.refresh();
  }

  override render() {
    return html`<div>Test Component</div>`;
  }
}

describe('ReactiveQueryController', () => {
  let component: TestComponent;
  let mockSubscription: { unsubscribe: ReturnType<typeof vi.fn> };
  let mockObservable: { subscribe: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    
    // Create mock subscription
    mockSubscription = { unsubscribe: vi.fn() };
    
    // Create mock observable
    mockObservable = {
      subscribe: vi.fn().mockReturnValue(mockSubscription)
    };

    // Mock liveQuery to return our mock observable
    vi.mocked(liveQuery).mockReturnValue(mockObservable as any);

    // Create test component
    component = new TestComponent();
    document.body.appendChild(component);
  });

  afterEach(() => {
    if (component.parentNode) {
      component.parentNode.removeChild(component);
    }
  });

  it('should initialize with loading state', () => {
    expect(component.loading).toBe(true);
    expect(component.data).toBeUndefined();
    expect(component.error).toBeUndefined();
  });

  it('should subscribe when component connects', () => {
    component.connectedCallback();
    
    expect(liveQuery).toHaveBeenCalled();
    expect(mockObservable.subscribe).toHaveBeenCalled();
  });

  it('should unsubscribe when component disconnects', () => {
    component.connectedCallback();
    component.disconnectedCallback();
    
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
  });

  it('should update data when subscription emits', () => {
    component.connectedCallback();
    
    // Get the subscription callback
    const subscribeCall = mockObservable.subscribe.mock.calls[0];
    expect(subscribeCall).toBeDefined();
    const subscribeCallback = subscribeCall![0];
    
    // Simulate data emission
    const testData = ['new', 'data'];
    subscribeCallback.next(testData);
    
    expect(component.data).toEqual(testData);
    expect(component.loading).toBe(false);
    expect(component.error).toBeUndefined();
  });

  it('should handle subscription errors', () => {
    component.connectedCallback();
    
    // Get the subscription callback
    const subscribeCall = mockObservable.subscribe.mock.calls[0];
    expect(subscribeCall).toBeDefined();
    const subscribeCallback = subscribeCall![0];
    
    // Simulate error
    const testError = new Error('Test error');
    subscribeCallback.error(testError);
    
    expect(component.error).toBe(testError);
    expect(component.loading).toBe(false);
  });

  it('should handle query function errors', () => {
    // Mock liveQuery to throw an error
    vi.mocked(liveQuery).mockImplementation(() => {
      throw new Error('Query error');
    });

    component.connectedCallback();
    
    expect(component.error).toBeInstanceOf(Error);
    expect(component.loading).toBe(false);
  });

  it('should update query and resubscribe', () => {
    component.connectedCallback();
    
    // Clear previous calls
    vi.clearAllMocks();
    mockObservable.subscribe.mockReturnValue(mockSubscription);
    vi.mocked(liveQuery).mockReturnValue(mockObservable as any);
    
    // Update query
    const newQueryFn = () => Promise.resolve(['updated', 'data']);
    component.updateQuery(newQueryFn);
    
    // Should unsubscribe from old subscription
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    
    // Should create new subscription
    expect(liveQuery).toHaveBeenCalled();
    expect(mockObservable.subscribe).toHaveBeenCalled();
  });

  it('should refresh query', () => {
    component.connectedCallback();
    
    // Clear previous calls
    vi.clearAllMocks();
    mockObservable.subscribe.mockReturnValue(mockSubscription);
    vi.mocked(liveQuery).mockReturnValue(mockObservable as any);
    
    // Refresh
    component.refresh();
    
    // Should unsubscribe and resubscribe
    expect(mockSubscription.unsubscribe).toHaveBeenCalled();
    expect(liveQuery).toHaveBeenCalled();
    expect(mockObservable.subscribe).toHaveBeenCalled();
  });

  it('should not subscribe if already disconnected', () => {
    // Mock a query that would normally subscribe
    // Disconnect before connecting
    component.disconnectedCallback();
    
    // Clear mocks and try to connect
    vi.clearAllMocks();
    component.connectedCallback();
    
    // Should still subscribe normally
    expect(liveQuery).toHaveBeenCalled();
  });

  it('should handle multiple rapid updates gracefully', () => {
    component.connectedCallback();
    
    // Simulate rapid query updates
    for (let i = 0; i < 5; i++) {
      const queryFn = () => Promise.resolve([`data-${i}`]);
      component.updateQuery(queryFn);
    }
    
    // Should have created multiple subscriptions and unsubscribed from previous ones
    expect(mockSubscription.unsubscribe).toHaveBeenCalledTimes(5);
  });

  describe('Dependency tracking', () => {
    let dependencyComponent: TestComponentWithDependencies;

    // Test component with dependencies
    @customElement('test-component-deps')
    class TestComponentWithDependencies extends LitElement {
      bookmarkId = 1;

      #queryController = new ReactiveQueryController(
        this,
        (id: number) => Promise.resolve(`data-${id}`),
        (): [number] => [this.bookmarkId]
      );

      get data() {
        return this.#queryController.value;
      }

      get loading() {
        return this.#queryController.loading;
      }

      setBookmarkId(id: number) {
        this.bookmarkId = id;
        this.requestUpdate();
      }

      // Public method to trigger hostUpdate for testing
      triggerHostUpdate() {
        this.#queryController.hostUpdate();
      }

      override render() {
        return html`<div>Test Component: ${this.bookmarkId}</div>`;
      }
    }

    beforeEach(() => {
      // Reset mocks
      vi.clearAllMocks();
      
      // Create mock subscription
      mockSubscription = { unsubscribe: vi.fn() };
      
      // Create mock observable
      mockObservable = {
        subscribe: vi.fn().mockReturnValue(mockSubscription)
      };

      // Mock liveQuery to return our mock observable
      vi.mocked(liveQuery).mockReturnValue(mockObservable as any);

      // Create test component
      dependencyComponent = new TestComponentWithDependencies();
      document.body.appendChild(dependencyComponent);
    });

    afterEach(() => {
      if (dependencyComponent.parentNode) {
        dependencyComponent.parentNode.removeChild(dependencyComponent);
      }
    });

    it('should pass dependencies to query function on initial subscription', async () => {
      dependencyComponent.connectedCallback();
      
      expect(liveQuery).toHaveBeenCalled();
      
      // The liveQuery should have been called with a function that uses the dependencies
      const liveQueryCall = vi.mocked(liveQuery).mock.calls[0];
      expect(liveQueryCall).toBeDefined();
      const queryFunction = liveQueryCall![0];
      
      // Execute the query function to verify it uses the correct dependency
      const result = queryFunction();
      await expect(result).resolves.toBe('data-1');
    });

    it('should detect dependency changes and resubscribe', () => {
      dependencyComponent.connectedCallback();
      
      // Clear initial subscription calls
      vi.clearAllMocks();
      mockObservable.subscribe.mockReturnValue(mockSubscription);
      vi.mocked(liveQuery).mockReturnValue(mockObservable as any);
      
      // Change dependency
      dependencyComponent.setBookmarkId(2);
      
      // Trigger hostUpdate manually (normally called by Lit during render cycle)
      dependencyComponent.triggerHostUpdate();
      
      // Should have unsubscribed from old subscription
      expect(mockSubscription.unsubscribe).toHaveBeenCalled();
      
      // Should have created new subscription with new dependency
      expect(liveQuery).toHaveBeenCalled();
      expect(mockObservable.subscribe).toHaveBeenCalled();
    });

    it('should not resubscribe when dependencies are the same', () => {
      dependencyComponent.connectedCallback();
      
      // Clear initial subscription calls
      vi.clearAllMocks();
      
      // Set the same bookmark ID
      dependencyComponent.setBookmarkId(1);
      
      // Trigger hostUpdate
      dependencyComponent.triggerHostUpdate();
      
      // Should not have unsubscribed or resubscribed
      expect(mockSubscription.unsubscribe).not.toHaveBeenCalled();
      expect(liveQuery).not.toHaveBeenCalled();
      expect(mockObservable.subscribe).not.toHaveBeenCalled();
    });

    it('should handle undefined dependency values', async () => {
      // Component with potentially undefined dependencies  
      @customElement('test-component-undefined-deps-unique')
      class TestComponentUndefinedDeps extends LitElement {
        bookmarkId: number | undefined = undefined;

        #queryController = new ReactiveQueryController(
          this,
          (id: number | undefined) => Promise.resolve(id ? `data-${id}` : 'no-data'),
          (): [number | undefined] => [this.bookmarkId]
        );

        get data() {
          return this.#queryController.value;
        }

        get loading() {
          return this.#queryController.loading;
        }
        
        override render() {
          return html`<div>Test Component</div>`;
        }
      }

      const undefinedDepsComponent = new TestComponentUndefinedDeps();
      document.body.appendChild(undefinedDepsComponent);
      
      try {
        // Clear mocks before this component to ensure isolated test
        vi.clearAllMocks();
        mockObservable.subscribe.mockReturnValue(mockSubscription);
        vi.mocked(liveQuery).mockReturnValue(mockObservable as any);
        
        undefinedDepsComponent.connectedCallback();
        
        // Should NOT call liveQuery when dependencies are undefined
        expect(liveQuery).not.toHaveBeenCalled();
        
        // Should have loading=false and value=undefined
        expect(undefinedDepsComponent.loading).toBe(false);
        expect(undefinedDepsComponent.data).toBeUndefined();
      } finally {
        undefinedDepsComponent.remove();
      }
    });

    it('should handle multiple dependencies', async () => {
      // Component with multiple dependencies
      @customElement('test-component-multi-deps-unique')
      class TestComponentMultiDeps extends LitElement {
        bookmarkId = 1;
        userId = 42;

        #queryController = new ReactiveQueryController(
          this,
          (bookmarkId: number, userId: number) => Promise.resolve(`data-${bookmarkId}-${userId}`),
          (): [number, number] => [this.bookmarkId, this.userId]
        );

        get data() {
          return this.#queryController.value;
        }
        
        override render() {
          return html`<div>Test Component</div>`;
        }
      }

      const multiDepsComponent = new TestComponentMultiDeps();
      document.body.appendChild(multiDepsComponent);
      
      try {
        // Clear mocks before this component to ensure isolated test
        vi.clearAllMocks();
        mockObservable.subscribe.mockReturnValue(mockSubscription);
        vi.mocked(liveQuery).mockReturnValue(mockObservable as any);
        
        multiDepsComponent.connectedCallback();
        
        expect(liveQuery).toHaveBeenCalled();
        
        // The query should use both dependencies
        const liveQueryCall = vi.mocked(liveQuery).mock.calls[0];
        expect(liveQueryCall).toBeDefined();
        const queryFunction = liveQueryCall![0];
        const result = queryFunction();
        await expect(result).resolves.toBe('data-1-42');
      } finally {
        multiDepsComponent.remove();
      }
    });
  });
});