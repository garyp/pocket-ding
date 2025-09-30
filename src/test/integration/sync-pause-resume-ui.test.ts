import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SyncProgress } from '../../components/sync-progress';
import type { SyncState } from '../../types';
import '../../components/sync-progress';

describe('SyncProgress Pause/Resume UI', () => {
  let element: SyncProgress;
  let mockPauseCallback: ReturnType<typeof vi.fn>;
  let mockResumeCallback: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    mockPauseCallback = vi.fn();
    mockResumeCallback = vi.fn();
  });

  afterEach(() => {
    // Clean up created elements
    document.body.innerHTML = '';
  });

  async function createSyncProgress(syncState: SyncState): Promise<SyncProgress> {
    const el = document.createElement('sync-progress') as SyncProgress;
    el.syncState = syncState;
    el.onPause = mockPauseCallback;
    el.onResume = mockResumeCallback;
    document.body.appendChild(el);
    await el.updateComplete;
    return el;
  }

  it('should show pause button when sync is running', async () => {
    const syncState: SyncState = {
      isSyncing: true,
      syncProgress: 50,
      syncTotal: 100,
      syncPhase: 'bookmarks',
      syncStatus: 'syncing',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return Math.round((this.syncProgress / this.syncTotal) * 100);
      }
    };

    element = await createSyncProgress(syncState);

    // Should show pause button
    const pauseButton = element.shadowRoot?.querySelector('md-text-button');
    expect(pauseButton).toBeTruthy();

    // Should show correct icon
    const pauseIcon = pauseButton?.querySelector('md-icon');
    expect(pauseIcon?.textContent).toBe('pause');
  });

  it('should show resume button when sync is paused', async () => {
    const syncState: SyncState = {
      isSyncing: false,  // Not currently syncing when manually paused
      syncProgress: 50,
      syncTotal: 100,
      syncPhase: 'bookmarks',
      syncStatus: 'paused',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return Math.round((this.syncProgress / this.syncTotal) * 100);
      }
    };

    element = await createSyncProgress(syncState);

    // Should show resume button
    const resumeButton = element.shadowRoot?.querySelector('md-text-button');
    expect(resumeButton).toBeTruthy();

    // Should show play icon
    const resumeIcon = resumeButton?.querySelector('md-icon');
    expect(resumeIcon?.textContent).toBe('play_arrow');

    // Should show paused text
    const phaseText = element.shadowRoot?.querySelector('.sync-phase-text');
    expect(phaseText?.textContent).toContain('(Paused)');
  });

  it('should call pause callback when pause button is clicked', async () => {
    const syncState: SyncState = {
      isSyncing: true,
      syncProgress: 50,
      syncTotal: 100,
      syncPhase: 'bookmarks',
      syncStatus: 'syncing',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return Math.round((this.syncProgress / this.syncTotal) * 100);
      }
    };

    element = await createSyncProgress(syncState);

    const pauseButton = element.shadowRoot?.querySelector('md-text-button') as HTMLElement;
    pauseButton?.click();

    expect(mockPauseCallback).toHaveBeenCalled();
    expect(mockResumeCallback).not.toHaveBeenCalled();
  });

  it('should call resume callback when resume button is clicked', async () => {
    const syncState: SyncState = {
      isSyncing: false,  // Not currently syncing when manually paused
      syncProgress: 50,
      syncTotal: 100,
      syncPhase: 'bookmarks',
      syncStatus: 'paused',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return Math.round((this.syncProgress / this.syncTotal) * 100);
      }
    };

    element = await createSyncProgress(syncState);

    const resumeButton = element.shadowRoot?.querySelector('md-text-button') as HTMLElement;
    resumeButton?.click();

    expect(mockResumeCallback).toHaveBeenCalled();
    expect(mockPauseCallback).not.toHaveBeenCalled();
  });

  it('should not show pause/resume buttons when sync is not running', async () => {
    const syncState: SyncState = {
      isSyncing: false,
      syncProgress: 0,
      syncTotal: 0,
      syncPhase: undefined,
      syncStatus: 'idle',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return 0;
      }
    };

    element = await createSyncProgress(syncState);

    // Component should not render anything when not syncing
    const container = element.shadowRoot?.querySelector('.sync-progress-container');
    expect(container).toBeFalsy();
  });

  it('should stop progress bar animation when paused', async () => {
    const syncState: SyncState = {
      isSyncing: false,  // Not currently syncing when manually paused
      syncProgress: 0,
      syncTotal: 0, // Indeterminate progress
      syncPhase: 'bookmarks',
      syncStatus: 'paused',
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return 0;
      }
    };

    element = await createSyncProgress(syncState);

    const progressBar = element.shadowRoot?.querySelector('md-linear-progress');
    // When paused and no progress, bar should not be indeterminate
    expect(progressBar?.getAttribute('indeterminate')).toBeFalsy();
  });

  it('should show UI for manually paused state even when not syncing', async () => {
    const syncState: SyncState = {
      isSyncing: false,  // Not actively syncing
      syncProgress: 0,
      syncTotal: 0,
      syncPhase: undefined,
      syncStatus: 'paused',  // Manually paused
      syncedBookmarkIds: new Set(),
      getPercentage() {
        return 0;
      }
    };

    element = await createSyncProgress(syncState);

    // Should show the sync progress container for manual pause
    const container = element.shadowRoot?.querySelector('.sync-progress-container');
    expect(container).toBeTruthy();

    // Should show resume button
    const resumeButton = element.shadowRoot?.querySelector('md-text-button');
    expect(resumeButton).toBeTruthy();

    // Should show play icon
    const resumeIcon = resumeButton?.querySelector('md-icon');
    expect(resumeIcon?.textContent).toBe('play_arrow');
  });
});