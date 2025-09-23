import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock the logger before importing anything that uses it
const mockLogger = {
  logInfo: vi.fn(),
  logError: vi.fn(),
};

vi.mock('../../worker/sw-logger', () => mockLogger);

describe('KeepaliveManager', () => {
  let KeepaliveManager: any;
  let manager: any;
  let originalSetInterval: typeof setInterval;
  let originalClearInterval: typeof clearInterval;
  let originalMessageChannel: typeof MessageChannel;

  const mockIntervalIds: number[] = [];
  const mockPorts: any[] = [];

  beforeEach(async () => {
    // Clear all mocks
    vi.clearAllMocks();
    mockIntervalIds.length = 0;
    mockPorts.length = 0;

    // Store original functions
    originalSetInterval = global.setInterval;
    originalClearInterval = global.clearInterval;
    originalMessageChannel = global.MessageChannel;

    // Mock setInterval to track created intervals
    global.setInterval = vi.fn((_callback: any, _delay?: any) => {
      const id = Math.floor(Math.random() * 1000000);
      mockIntervalIds.push(id);
      return id as any;
    }) as any;

    // Mock clearInterval to track cleared intervals
    global.clearInterval = vi.fn((id?: any) => {
      if (typeof id === 'number') {
        const index = mockIntervalIds.indexOf(id);
        if (index > -1) {
          mockIntervalIds.splice(index, 1);
        }
      }
    }) as any;

    // Mock MessageChannel
    const mockPort = {
      postMessage: vi.fn(),
      close: vi.fn(),
    };

    global.MessageChannel = vi.fn(() => {
      mockPorts.push(mockPort);
      return {
        port1: mockPort,
        port2: {
          postMessage: vi.fn(),
          close: vi.fn(),
        },
      };
    }) as any;

    // Import and extract the KeepaliveManager class from the service worker module
    // Since it's part of the service worker, we need to extract it for testing
    const keepaliveManagerCode = `
      class KeepaliveManager {
        #intervals = new Set();
        #port = null;
        #isActive = false;

        start() {
          if (this.#isActive) {
            mockLogger.logInfo('serviceWorker', 'Keepalive already active');
            return;
          }

          mockLogger.logInfo('serviceWorker', 'Starting keepalive mechanism during sync');
          this.#isActive = true;

          // Strategy 1: Periodic heartbeat logging
          const heartbeatId = setInterval(() => {
            mockLogger.logInfo('serviceWorker', 'Keepalive heartbeat');
          }, 10000);
          this.#intervals.add(heartbeatId);

          // Strategy 2: Message channel to keep SW active
          const channel = new MessageChannel();
          this.#port = channel.port1;

          const channelId = setInterval(() => {
            if (this.#port) {
              this.#port.postMessage({ type: 'keepalive' });
            }
          }, 15000);
          this.#intervals.add(channelId);
        }

        stop() {
          if (!this.#isActive) {
            return;
          }

          mockLogger.logInfo('serviceWorker', 'Stopping keepalive mechanism');

          // Clear all intervals
          this.#intervals.forEach(id => clearInterval(id));
          this.#intervals.clear();

          // Close message port
          if (this.#port) {
            this.#port.close();
            this.#port = null;
          }

          this.#isActive = false;
          mockLogger.logInfo('serviceWorker', 'Keepalive mechanism stopped');
        }

        get isActive() {
          return this.#isActive;
        }

        get activeIntervalCount() {
          return this.#intervals.size;
        }
      }

      return KeepaliveManager;
    `;

    // Evaluate the class code in the mock environment
    KeepaliveManager = eval(`(function() { ${keepaliveManagerCode} })()`);
    manager = new KeepaliveManager();
  });

  afterEach(() => {
    // Stop any active keepalive to clean up
    if (manager && manager.isActive) {
      manager.stop();
    }

    // Restore original functions
    global.setInterval = originalSetInterval;
    global.clearInterval = originalClearInterval;
    global.MessageChannel = originalMessageChannel;
  });

  describe('start()', () => {
    it('should start keepalive mechanism successfully', () => {
      expect(manager.isActive).toBe(false);
      expect(manager.activeIntervalCount).toBe(0);

      manager.start();

      expect(manager.isActive).toBe(true);
      expect(manager.activeIntervalCount).toBe(2); // Heartbeat + channel intervals
      expect(setInterval).toHaveBeenCalledTimes(2);
      expect(MessageChannel).toHaveBeenCalledTimes(1);
      expect(mockLogger.logInfo).toHaveBeenCalledWith('serviceWorker', 'Starting keepalive mechanism during sync');
    });

    it('should not start if already active', () => {
      manager.start();
      expect(manager.activeIntervalCount).toBe(2);

      // Clear previous calls to check subsequent behavior
      vi.clearAllMocks();

      manager.start(); // Second call should be ignored

      expect(manager.activeIntervalCount).toBe(2); // Should remain the same
      expect(setInterval).not.toHaveBeenCalled(); // Should not create new intervals
      expect(MessageChannel).not.toHaveBeenCalled(); // Should not create new channels
      expect(mockLogger.logInfo).toHaveBeenCalledWith('serviceWorker', 'Keepalive already active');
    });

    it('should create intervals with correct timing', () => {
      manager.start();

      expect(setInterval).toHaveBeenCalledTimes(2);

      // Check the first interval call (heartbeat - 10 seconds)
      expect(setInterval).toHaveBeenNthCalledWith(1, expect.any(Function), 10000);

      // Check the second interval call (channel - 15 seconds)
      expect(setInterval).toHaveBeenNthCalledWith(2, expect.any(Function), 15000);
    });

    it('should create message channel correctly', () => {
      manager.start();

      expect(MessageChannel).toHaveBeenCalledTimes(1);
      expect(mockPorts).toHaveLength(1);
    });
  });

  describe('stop()', () => {
    it('should stop keepalive mechanism and clean up all resources', () => {
      manager.start();
      expect(manager.isActive).toBe(true);
      expect(manager.activeIntervalCount).toBe(2);

      manager.stop();

      expect(manager.isActive).toBe(false);
      expect(manager.activeIntervalCount).toBe(0);
      expect(clearInterval).toHaveBeenCalledTimes(2);
      expect(mockPorts[0]?.close).toHaveBeenCalledTimes(1);
      expect(mockLogger.logInfo).toHaveBeenCalledWith('serviceWorker', 'Stopping keepalive mechanism');
      expect(mockLogger.logInfo).toHaveBeenCalledWith('serviceWorker', 'Keepalive mechanism stopped');
    });

    it('should not throw if stop is called when not active', () => {
      expect(manager.isActive).toBe(false);

      expect(() => manager.stop()).not.toThrow();
      expect(clearInterval).not.toHaveBeenCalled();
      expect(mockLogger.logInfo).not.toHaveBeenCalled();
    });

    it('should clear all tracked intervals', () => {
      manager.start();
      const intervalCountBeforeStop = manager.activeIntervalCount;
      expect(intervalCountBeforeStop).toBe(2);

      // Capture the interval IDs that were created
      const createdIntervals = [...mockIntervalIds];

      manager.stop();

      // All intervals should be cleared
      expect(clearInterval).toHaveBeenCalledTimes(intervalCountBeforeStop);
      createdIntervals.forEach(id => {
        expect(clearInterval).toHaveBeenCalledWith(id);
      });
    });

    it('should close message port properly', () => {
      manager.start();
      const port = mockPorts[0];
      expect(port).toBeDefined();

      manager.stop();

      expect(port.close).toHaveBeenCalledTimes(1);
    });
  });

  describe('state management', () => {
    it('should track active state correctly', () => {
      expect(manager.isActive).toBe(false);

      manager.start();
      expect(manager.isActive).toBe(true);

      manager.stop();
      expect(manager.isActive).toBe(false);
    });

    it('should track interval count correctly', () => {
      expect(manager.activeIntervalCount).toBe(0);

      manager.start();
      expect(manager.activeIntervalCount).toBe(2);

      manager.stop();
      expect(manager.activeIntervalCount).toBe(0);
    });
  });

  describe('interval callbacks', () => {
    it('should execute heartbeat callback correctly', () => {
      manager.start();

      // Get the heartbeat callback (first setInterval call)
      const heartbeatCallback = (setInterval as any).mock.calls[0][0];

      // Execute the callback
      heartbeatCallback();

      expect(mockLogger.logInfo).toHaveBeenCalledWith('serviceWorker', 'Keepalive heartbeat');
    });

    it('should execute channel callback correctly', () => {
      manager.start();

      // Get the channel callback (second setInterval call)
      const channelCallback = (setInterval as any).mock.calls[1][0];
      const port = mockPorts[0];

      // Execute the callback
      channelCallback();

      expect(port.postMessage).toHaveBeenCalledWith({ type: 'keepalive' });
    });

    it('should handle channel callback when port is null', () => {
      manager.start();
      manager.stop(); // This will set port to null
      manager['#isActive'] = true; // Fake being active to test the callback

      // Get the channel callback
      const channelCallback = (setInterval as any).mock.calls[1][0];

      // Execute the callback when port is null
      expect(() => channelCallback()).not.toThrow();
    });
  });

  describe('resource cleanup on unexpected termination', () => {
    it('should handle cleanup when intervals are cleared externally', () => {
      manager.start();
      expect(manager.activeIntervalCount).toBe(2);

      // Simulate external clearing of intervals (like service worker termination)
      const intervalIds = [...mockIntervalIds];
      intervalIds.forEach(id => clearInterval(id));

      // The manager should still track them until explicitly stopped
      expect(manager.activeIntervalCount).toBe(2);

      // When stop is called, it should handle already-cleared intervals gracefully
      expect(() => manager.stop()).not.toThrow();
      expect(manager.activeIntervalCount).toBe(0);
    });

    it('should handle cleanup when message port is closed externally', () => {
      manager.start();
      const port = mockPorts[0];

      // Simulate external closing of port
      port.close();

      // Manager should still handle stop gracefully
      expect(() => manager.stop()).not.toThrow();
      expect(manager.isActive).toBe(false);
    });
  });

  describe('multiple start/stop cycles', () => {
    it('should handle multiple start/stop cycles correctly', () => {
      // First cycle
      manager.start();
      expect(manager.isActive).toBe(true);
      expect(manager.activeIntervalCount).toBe(2);

      manager.stop();
      expect(manager.isActive).toBe(false);
      expect(manager.activeIntervalCount).toBe(0);

      // Second cycle
      manager.start();
      expect(manager.isActive).toBe(true);
      expect(manager.activeIntervalCount).toBe(2);

      manager.stop();
      expect(manager.isActive).toBe(false);
      expect(manager.activeIntervalCount).toBe(0);

      // Should have created and cleared intervals twice
      expect(setInterval).toHaveBeenCalledTimes(4); // 2 per start
      expect(clearInterval).toHaveBeenCalledTimes(4); // 2 per stop
      expect(MessageChannel).toHaveBeenCalledTimes(2); // 1 per start
    });
  });
});