import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AppRoot } from '../../components/app-root';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/theme-service');

// Mock browser APIs
Object.defineProperty(window, 'location', {
  value: {
    pathname: '/',
    hash: '',
    search: ''
  },
  writable: true
});

Object.defineProperty(window, 'history', {
  value: {
    pushState: vi.fn(),
    replaceState: vi.fn()
  },
  writable: true
});

// Mock fetch helper
vi.mock('../../utils/fetch-helper', () => ({
  configureFetchHelper: vi.fn()
}));

describe('AppRoot Scroll Behavior', () => {
  let appRoot: AppRoot;

  beforeEach(() => {
    // Register the custom element
    if (!customElements.get('app-root')) {
      customElements.define('app-root', AppRoot);
    }
    
    appRoot = new AppRoot();
    document.body.appendChild(appRoot);
  });

  afterEach(() => {
    if (document.body.contains(appRoot)) {
      document.body.removeChild(appRoot);
    }
  });

  it('allows scrolling by default for settings view', async () => {
    // Force the view to settings
    (appRoot as any).currentView = 'settings';
    await appRoot.updateComplete;
    
    const appContent = appRoot.shadowRoot?.querySelector('.app-content');
    expect(appContent).toBeTruthy();
    expect(appContent?.classList.contains('no-scroll')).toBe(false);
    expect(appContent?.classList.contains('app-content')).toBe(true);
  });

  it('allows scrolling by default for bookmarks view', async () => {
    // Force the view to bookmarks
    (appRoot as any).currentView = 'bookmarks';
    await appRoot.updateComplete;
    
    const appContent = appRoot.shadowRoot?.querySelector('.app-content');
    expect(appContent).toBeTruthy();
    expect(appContent?.classList.contains('no-scroll')).toBe(false);
    expect(appContent?.classList.contains('app-content')).toBe(true);
  });

  it('allows scrolling for reader view for unified scrolling', async () => {
    // Force the view to reader
    (appRoot as any).currentView = 'reader';
    await appRoot.updateComplete;
    
    const appContent = appRoot.shadowRoot?.querySelector('.app-content');
    expect(appContent).toBeTruthy();
    expect(appContent?.classList.contains('no-scroll')).toBe(false);
    expect(appContent?.classList.contains('app-content')).toBe(true);
  });

  it('allows scrolling by default for not-found view', async () => {
    // Force the view to not-found
    (appRoot as any).currentView = 'not-found';
    await appRoot.updateComplete;
    
    const appContent = appRoot.shadowRoot?.querySelector('.app-content');
    expect(appContent).toBeTruthy();
    expect(appContent?.classList.contains('no-scroll')).toBe(false);
    expect(appContent?.classList.contains('app-content')).toBe(true);
  });
});