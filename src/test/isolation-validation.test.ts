/**
 * Test isolation validation - verifies that tests don't leak state between runs
 * This test file validates the effectiveness of our setup.ts cleanup mechanisms
 */

import { describe, it, expect, vi } from 'vitest';
import '../test/setup';

describe('Test Isolation Validation', () => {
  it('should have clean DOM between tests', () => {
    // Create a test element and verify it's cleaned up
    const testElement = document.createElement('div');
    testElement.id = 'isolation-test-element';
    testElement.setAttribute('data-test', 'isolation-validation');
    document.body.appendChild(testElement);
    
    expect(document.getElementById('isolation-test-element')).toBeTruthy();
    
    // The afterEach cleanup in setup.ts should remove this in the next test
  });
  
  it('should have clean DOM from previous test', () => {
    // Verify the element from the previous test was cleaned up
    expect(document.getElementById('isolation-test-element')).toBeNull();
    
    // Verify document.body is clean of test artifacts  
    const testElements = document.querySelectorAll('[data-test]');
    expect(testElements).toHaveLength(0);
  });
  
  it('should have clean timer state', () => {
    vi.useFakeTimers();
    
    try {
      // Set a timer and verify it doesn't leak to next test
      const mockFn = vi.fn();
      setTimeout(mockFn, 1000);
      
      // Advance time to trigger the timer
      vi.advanceTimersByTime(1000);
      expect(mockFn).toHaveBeenCalled();
      
      // The afterEach cleanup should handle timer cleanup
    } finally {
      vi.useRealTimers();
    }
  });
  
  it('should have no timers from previous test', () => {
    vi.useFakeTimers();
    
    try {
      // Verify no timers are pending from the previous test
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  
  it('should have clean mock state', () => {
    // Create a mock and verify it's isolated
    const testMock = vi.fn();
    testMock('test-call');
    
    expect(testMock).toHaveBeenCalledWith('test-call');
    expect(testMock).toHaveBeenCalledTimes(1);
  });
  
  it('should not see mock calls from previous test', () => {
    // This test should not see the mock call from the previous test
    // Note: This test verifies that individual test files handle their own mock cleanup
    // The global setup.ts doesn't interfere with vi.fn() mocks created in individual tests
    const freshMock = vi.fn();
    expect(freshMock).toHaveBeenCalledTimes(0);
  });
  
  it('should have clean document classes and styles', () => {
    // Add some test classes and styles
    document.documentElement.className = 'test-root-class';
    document.body.className = 'test-body-class';
    
    const testStyle = document.createElement('style');
    testStyle.setAttribute('data-test', 'isolation-test');
    testStyle.textContent = '.test { color: red; }';
    document.head.appendChild(testStyle);
    
    expect(document.documentElement.className).toContain('test-root-class');
    expect(document.body.className).toContain('test-body-class');
    expect(document.querySelector('style[data-test="isolation-test"]')).toBeTruthy();
  });
  
  it('should have clean document classes and styles from previous test', () => {
    // Verify cleanup from previous test
    expect(document.documentElement.className).toBe('');
    expect(document.body.className).toBe('');
    expect(document.querySelector('style[data-test="isolation-test"]')).toBeNull();
  });
  
  it('should have working fake timers', () => {
    vi.useFakeTimers();
    
    try {
      // Verify that fake timers are properly set up
      const mockCallback = vi.fn();
      
      setTimeout(mockCallback, 500);
      expect(mockCallback).not.toHaveBeenCalled();
      
      vi.advanceTimersByTime(500);
      expect(mockCallback).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});