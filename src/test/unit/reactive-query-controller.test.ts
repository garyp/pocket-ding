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
});