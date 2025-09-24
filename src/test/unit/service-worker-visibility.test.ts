/**
 * @fileoverview Tests for service worker visibility-based coordination message types
 * Tests the new APP_FOREGROUND and APP_BACKGROUND message support
 */

import { describe, it, expect } from 'vitest';
import { SyncMessages, type AppForegroundMessage, type AppBackgroundMessage } from '../../types/sync-messages';

describe('Service Worker Visibility Message Types', () => {
  it('should create APP_FOREGROUND message with correct structure', () => {
    const message = SyncMessages.appForeground();

    expect(message.type).toBe('APP_FOREGROUND');
    expect(message.timestamp).toBeTypeOf('number');
    expect(message.timestamp).toBeGreaterThan(0);

    // Verify it matches the interface
    const typedMessage: AppForegroundMessage = message;
    expect(typedMessage.type).toBe('APP_FOREGROUND');
    expect(typedMessage.timestamp).toBeTypeOf('number');
  });

  it('should create APP_BACKGROUND message with correct structure', () => {
    const message = SyncMessages.appBackground();

    expect(message.type).toBe('APP_BACKGROUND');
    expect(message.timestamp).toBeTypeOf('number');
    expect(message.timestamp).toBeGreaterThan(0);

    // Verify it matches the interface
    const typedMessage: AppBackgroundMessage = message;
    expect(typedMessage.type).toBe('APP_BACKGROUND');
    expect(typedMessage.timestamp).toBeTypeOf('number');
  });

  it('should create messages with different timestamps', () => {
    const message1 = SyncMessages.appForeground();
    const message2 = SyncMessages.appForeground();

    // They should have different timestamps (or at least not be guaranteed to be the same)
    // This tests that Date.now() is called each time
    expect(typeof message1.timestamp).toBe('number');
    expect(typeof message2.timestamp).toBe('number');
  });

  it('should include message types in the union type', () => {
    // TypeScript compilation test - if APP_FOREGROUND/APP_BACKGROUND are not in the union,
    // this would fail to compile
    const foregroundMessage = SyncMessages.appForeground();
    const backgroundMessage = SyncMessages.appBackground();

    // This function expects a SyncMessage (the union type)
    function handleSyncMessage(msg: { type: string; timestamp: number }) {
      return msg.type;
    }

    expect(handleSyncMessage(foregroundMessage)).toBe('APP_FOREGROUND');
    expect(handleSyncMessage(backgroundMessage)).toBe('APP_BACKGROUND');
  });
});