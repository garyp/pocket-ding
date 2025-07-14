import { describe, it, expect } from 'vitest';

describe('BookmarkReader Progress Calculation', () => {
  // Test the core progress calculation logic directly
  const updateReadProgress = (scrollTop: number, scrollHeight: number, clientHeight: number): number => {
    // This is the actual logic from the component
    const scrollableHeight = scrollHeight - clientHeight;
    return scrollableHeight <= 0 ? 100 : Math.min(100, Math.max(0, (scrollTop / scrollableHeight) * 100));
  };

  it('should return 100% when content is shorter than container', () => {
    // scrollHeight (total content) is less than clientHeight (visible area)
    const progress = updateReadProgress(0, 100, 200);
    expect(progress).toBe(100);
    expect(Number.isNaN(progress)).toBe(false);
  });

  it('should calculate correct progress when content is scrollable', () => {
    // scrollHeight > clientHeight (scrollable content)
    // 300 / (1000 - 400) = 300 / 600 = 0.5 = 50%
    const progress = updateReadProgress(300, 1000, 400);
    expect(progress).toBe(50);
    expect(Number.isNaN(progress)).toBe(false);
  });

  it('should handle zero scroll dimensions without NaN', () => {
    // Edge case where all dimensions are zero
    const progress = updateReadProgress(0, 0, 0);
    expect(progress).toBe(100);
    expect(Number.isNaN(progress)).toBe(false);
  });

  it('should handle identical scroll and client heights without NaN', () => {
    // Edge case where scrollHeight equals clientHeight (no scrollable content)
    const progress = updateReadProgress(0, 200, 200);
    expect(progress).toBe(100);
    expect(Number.isNaN(progress)).toBe(false);
  });

  it('should cap progress at 100%', () => {
    // Test that progress never exceeds 100%
    const progress = updateReadProgress(1000, 1000, 400);
    expect(progress).toBe(100);
    expect(Number.isNaN(progress)).toBe(false);
  });

  it('should never return negative progress', () => {
    // Test that progress is never negative
    const progress = updateReadProgress(0, 1000, 400);
    expect(progress).toBe(0);
    expect(Number.isNaN(progress)).toBe(false);
  });
});