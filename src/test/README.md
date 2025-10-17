# Test Documentation

This document provides comprehensive guidance on testing in Pocket Ding, including test organization, testing philosophy, and best practices.

## Test Directory Structure

```
src/test/
├── unit/                    # Unit tests (Vitest)
├── integration/             # Integration tests (Vitest)
├── workflows/               # Workflow tests (Vitest)
├── e2e/                     # End-to-end tests (Playwright + TestContainers)
├── playwright/              # Visual/Debug tests (Playwright - development only)
└── utils/                   # Shared test utilities
```

## Test Categories

### 1. Unit Tests (`src/test/unit/`)
**Test Runner:** Vitest with Happy DOM
**Command:** `npm run test:unit`

**Purpose:** Test individual services, utilities, and isolated component logic.

**Characteristics:**
- Fast execution (< 1 second per test)
- No external dependencies
- Mock all external services (API, database)
- Focus on single function/class behavior

**When to Use:**
- Testing service logic (ContentFetcher, SecurityService)
- Testing utility functions
- Testing controller logic in isolation
- Validating edge cases and error handling

**Example:**
```typescript
// src/test/unit/content-fetcher.test.ts
it('should parse HTML content with readability', async () => {
  const result = await ContentFetcher.processHtml(mockHtml, mockUrl);
  expect(result.readability_content).toBeDefined();
});
```

### 2. Integration Tests (`src/test/integration/`)
**Test Runner:** Vitest with Happy DOM
**Command:** `npm run test:integration`

**Purpose:** Test interactions between multiple components/services with mocked external dependencies.

**Characteristics:**
- Medium execution time (1-3 seconds per test)
- Tests component interactions
- Mocks database and API
- Tests reactive queries and state management

**When to Use:**
- Testing component + service integration
- Testing reactive database queries with ReactiveQueryController
- Testing multi-component workflows (without real browser)
- Testing security features end-to-end

**Example:**
```typescript
// src/test/integration/reader-real-behavior.test.ts
it('should load bookmark content when bookmarkId changes', async () => {
  const reader = document.createElement('bookmark-reader');
  reader.bookmarkId = 1;
  await waitForComponentReady(reader);
  expect(reader.contentResult).toBeDefined();
});
```

### 3. Workflow Tests (`src/test/workflows/`)
**Test Runner:** Vitest with Happy DOM
**Command:** `npm test` (included in main test suite)

**Purpose:** Test complete user workflows and user journeys with mocked dependencies.

**Characteristics:**
- Medium execution time (2-5 seconds per test)
- Tests complete user workflows
- Focuses on user behavior, not implementation
- Mocks external dependencies

**When to Use:**
- Testing complete user journeys (setup, sync, reading, etc.)
- Testing accessibility features
- Testing error scenarios users might encounter
- Testing background sync workflows

**Example:**
```typescript
// src/test/workflows/reading-workflows.test.ts
it('should allow user to read bookmark and track progress', async () => {
  // User syncs bookmarks
  await triggerSync();
  // User clicks bookmark
  await clickBookmark(0);
  // User scrolls through content
  await scrollReader(50);
  // Verify progress saved
  expect(getReadProgress()).toBe(50);
});
```

### 4. End-to-End Tests (`src/test/e2e/`)
**Test Runner:** Playwright + TestContainers
**Command:** `npm run test:e2e` or `npm run test:e2e:quick`

**Purpose:** Test the complete application stack with a real Linkding server in a real browser.

**Characteristics:**
- Slow execution (5-15 seconds per test)
- **Requires Docker** (uses TestContainers to spin up Linkding)
- Tests real browser interactions
- Tests real API communication
- Tests real service worker behavior
- No mocks (except for external URLs that would be loaded in iframes)

**When to Use:**
- Testing complete sync workflows with real API
- Testing service worker registration and offline behavior
- Testing real browser navigation and state persistence
- Verifying integration with Linkding API
- Testing responsive design on different viewport sizes

**Setup:**
- Global setup spins up a Linkding container via TestContainers
- Populates test data via Linkding API
- Sets environment variables for tests to use
- Global teardown stops the container

**Example:**
```typescript
// src/test/e2e/sync-workflow.spec.ts
test('should connect to Linkding and sync bookmarks', async ({ page }) => {
  const config = getLinkdingConfig(); // Real Linkding container
  await injectPocketDingSettings(page, config);
  await triggerSync(page);
  await waitForSyncComplete(page);
  const bookmarkCount = await getBookmarkCount(page);
  expect(bookmarkCount).toBeGreaterThan(0);
});
```

**Environment Variables:**
- `E2E_LINKDING_URL`: Set by global-setup.ts, points to TestContainers instance
- `E2E_LINKDING_TOKEN`: Set by global-setup.ts, API token for test user
- `E2E_TESTS_DISABLED`: Set to 'true' if Docker is unavailable

### 5. Visual/Debug Tests (`src/test/playwright/`)
**Test Runner:** Playwright (default config)
**Command:** `npm run test:playwright`

**Purpose:** Visual debugging, CSS analysis, and one-off component testing during development.

**Characteristics:**
- Uses default `playwright.config.ts` (points to `src/test/playwright`)
- Takes screenshots for visual inspection
- Used for troubleshooting layout issues
- May manipulate DOM directly for testing
- Can be run in CI or manually

**When to Use:**
- Debugging visual layout issues
- Analyzing CSS computed values
- Taking screenshots for documentation
- Quick component testing without full app setup
- Measuring component dimensions
- Regression testing for visual changes

**Example:**
```typescript
// src/test/playwright/reader-header-visual.spec.ts
test('Measure reader toolbar height at different viewports', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const height = await page.locator('.reader-toolbar').evaluate(
    el => el.getBoundingClientRect().height
  );
  await page.screenshot({ path: 'images/reader-mobile.png' });
  console.log(`Mobile toolbar height: ${height}px`);
});
```

**Note:** These tests use the default `playwright.config.ts` while E2E tests use `playwright.e2e.config.ts`.

## Test Commands Summary

| Command | What it Runs | Use Case |
|---------|-------------|----------|
| `npm test` | All Vitest tests (unit + integration + workflows) | Standard test run, CI |
| `npm run test:unit` | Unit tests only | Fast feedback loop |
| `npm run test:integration` | Integration tests only | Testing component interactions |
| `npm run test:watch` | Vitest in watch mode | Development |
| `npm run test:playwright` | Visual/debug Playwright tests | Visual regression, layout debugging |
| `npm run test:playwright:debug` | Visual/debug tests with debugger | Debugging layout issues |
| `npm run test:e2e` | All E2E tests (requires Docker) | Full integration testing |
| `npm run test:e2e:quick` | E2E tests on Chromium only | Faster E2E testing |
| `npm run test:e2e:debug` | E2E tests with debugger | Debugging E2E tests |

## Configuration Files

- **vitest.config.ts**: Configures Vitest for unit/integration/workflow tests
- **playwright.config.ts**: Default Playwright config for visual/debug tests (points to `src/test/playwright`)
- **playwright.e2e.config.ts**: Playwright config for E2E tests with TestContainers (points to `src/test/e2e`)
- **src/test/e2e/global-setup.ts**: Spins up TestContainers for E2E tests
- **src/test/e2e/global-teardown.ts**: Tears down TestContainers after E2E tests

## Testing Philosophy

**IMPORTANT**: This codebase follows a **user-behavior-focused testing approach** that prioritizes maintainability and clarity over implementation coverage.

All tests should pass before considering features complete. The CI expects zero test failures.

### Core Testing Principles

1. **Test User Behavior, Not Implementation**: Focus on what users can do and see, not internal code structure
2. **Minimal Mocking**: Only mock external dependencies (APIs, databases), never internal services
3. **Integration Over Units**: Prefer integration tests that exercise complete user workflows
4. **Regression Protection**: Tests should catch bugs that break real user functionality
5. **Fast & Reliable**: Test suite runs in <6 seconds with zero flaky tests

### Testing Guidelines

**✅ DO Test:**
- Complete user workflows (bookmark sync, reading content, security features)
- Critical service functionality (content fetching, security processing)
- Error scenarios users encounter (network failures, invalid content)
- Component interactions and UI state changes
- Regression scenarios from real bugs

**❌ DON'T Test:**
- Internal method calls or implementation details
- Every possible code path or edge case
- Mock interactions between internal services
- Component lifecycle methods unless user-visible
- Trivial getters/setters or utility functions

### New Feature Testing

When adding new features, write **all tests necessary to validate the user workflows**:
1. **Integration tests** covering all user workflows enabled by the feature
2. **Unit tests** for complex service logic with edge cases
3. **Error handling tests** for user-visible failure scenarios
4. **Accessibility tests** when the feature affects user interaction

Focus on **quality and conciseness over quantity** - write comprehensive tests for user journeys and error scenarios, but avoid testing implementation details.

### Test Writing Patterns

**✅ Good - User-focused test:**
```typescript
it('should display bookmarks when user loads app with valid settings', async () => {
  // Setup: User has valid settings
  DatabaseService.getSettingsLive.mockReturnValue(of(validSettings));
  DatabaseService.getBookmarksLive.mockReturnValue(of(mockBookmarks));

  // Action: User loads app
  const element = await fixture(html`<app-root></app-root>`);
  await element.updateComplete;

  // Verify: User sees bookmarks
  expect(element.shadowRoot.querySelector('bookmark-list')).to.exist;
  expect(element.shadowRoot.textContent).to.include('Test Bookmark');
});
```

**❌ Bad - Implementation-focused test:**
```typescript
it('should call syncBookmarks method when sync button clicked', async () => {
  const syncSpy = vi.spyOn(component, 'syncBookmarks');

  component.handleSyncClick();

  expect(syncSpy).toHaveBeenCalled();
});
```

### Coverage Philosophy

- **Focus on critical user paths** rather than overall coverage percentages
- **Prioritize branch coverage** over statement coverage
- **100% coverage not required** - quality and user-behavior focus is more important
- **Security services should have comprehensive coverage** due to their critical nature

### Testing Instead of Manual Validation

**IMPORTANT**: Always use tests to verify changes instead of running the development server.

- When implementing fixes or new features, write tests to validate the behavior
- Do NOT use `npm run dev` or manual testing to verify changes work correctly
- Tests provide reliable, repeatable validation and prevent regressions
- Manual testing with the dev server should only be used for exploratory work, not validation

## Component-Aware Testing Utilities

**IMPORTANT**: Use component-aware utilities for testing Lit components with timing dependencies.

### waitForComponent() - Enhanced waitFor with Timer Management

Use `waitForComponent()` instead of regular `waitFor()` for component operations:

**✅ Good - Component-aware waiting:**
```typescript
import { waitForComponent, waitForComponentReady } from '../utils/component-aware-wait-for';

it('should display bookmarks when component loads', async () => {
  const appRoot = document.createElement('app-root') as AppRoot;
  document.body.appendChild(appRoot);

  // Wait for component initialization
  await waitForComponentReady(appRoot);

  // Wait for specific UI state
  await waitForComponent(() => {
    const container = appRoot.shadowRoot?.querySelector('bookmark-list-container');
    expect(container).toBeTruthy();
    return container;
  });
});
```

**❌ Bad - setTimeout delays (antipattern):**
```typescript
// Don't do this - brittle and non-deterministic
await new Promise(resolve => setTimeout(resolve, 100));
```

### Targeted Fake Timers for Specific Tests

For testing specific timing behavior, use targeted fake timers:

```typescript
import { withFakeTimers } from '../utils/targeted-fake-timers';

it('should debounce user input', async () => {
  await withFakeTimers(async () => {
    const mockSave = vi.fn();
    component.onInput('search term');

    // Advance time to trigger debounce
    vi.advanceTimersByTime(300);
    expect(mockSave).toHaveBeenCalledWith('search term');
  });
});
```

### Testing Patterns

**Component Creation:**
```typescript
// Create component and wait for ready state
const component = document.createElement('my-component') as MyComponent;
document.body.appendChild(component);
await waitForComponentReady(component);
```

**Waiting for UI Changes:**
```typescript
// Wait for specific DOM state with automatic timer handling
await waitForComponent(() => {
  const element = component.shadowRoot?.querySelector('.expected-class');
  expect(element).toBeTruthy();
  return element;
});
```

**Custom Timing Options:**
```typescript
// Customize timeout and timer advancement for slow operations
await waitForComponent(() => {
  expect(component.isFullyLoaded).toBe(true);
}, {
  timeout: 10000,
  interval: 100,
  timerAdvancement: 50
});
```

**Disable Timer Advancement:**
```typescript
// For non-component operations, disable timer advancement
await waitForComponent(() => {
  expect(mockApi.callCount).toBe(3);
}, {
  advanceTimers: false
});
```

### Key Benefits
- **Component-compatible**: Works seamlessly with Lit component lifecycle
- **Deterministic**: Controlled timer advancement eliminates flakiness
- **Flexible**: Can be customized or disabled per test scenario
- **Drop-in replacement**: Gradual adoption without breaking existing tests

## E2E Testing with TestContainers and Playwright

**IMPORTANT**: E2E tests use TestContainers to run a real Linkding Docker instance and Playwright to test in a real browser. This provides the highest level of confidence that sync and service worker functionality works correctly in production.

### Prerequisites

- **Docker must be installed and running** on the test machine
- TestContainers will automatically pull the Linkding Docker image
- Playwright browsers will be installed automatically via `npx playwright install`

### E2E Test Architecture

**Components:**
1. **TestContainers** (`src/test/e2e/utils/linkding-container.ts`): Manages Linkding Docker containers
   - Starts/stops Linkding instances per test run
   - Auto-creates superuser with API token
   - Waits for container health before running tests

2. **Test Data Utilities** (`src/test/e2e/utils/test-data.ts`): Programmatic bookmark population
   - Generates realistic test bookmark datasets
   - Populates Linkding via REST API
   - Creates bookmarks with tags, metadata, and content

3. **Playwright Helpers** (`src/test/e2e/utils/playwright-helpers.ts`): Browser automation utilities
   - Configure Pocket Ding settings
   - Trigger and wait for sync operations
   - Test offline behavior and service worker lifecycle
   - Navigate between views and interact with UI

4. **Global Setup** (`src/test/e2e/global-setup.ts`): Shared test environment
   - Starts single Linkding container for all tests
   - Populates test data once
   - Provides connection info via environment variables

### Running E2E Tests

```bash
# Run all E2E tests (headless mode, all browsers)
npm run test:e2e

# Run E2E tests quickly (chromium only, headless)
npm run test:e2e:quick

# Debug E2E tests with Playwright inspector
npm run test:e2e:debug

# Run specific E2E test file
npx playwright test src/test/e2e/sync-workflow.spec.ts
```

### When to Use E2E Tests

**Use E2E tests for:**
- ✅ Testing sync workflows with real Linkding API
- ✅ Validating service worker registration and lifecycle
- ✅ Testing offline behavior and caching
- ✅ Verifying PWA functionality in real browser
- ✅ Testing multi-tab coordination
- ✅ Debugging complex service worker issues

**Don't use E2E tests for:**
- ❌ Testing individual components (use unit/integration tests)
- ❌ Testing UI rendering and styling (use Playwright visual tests)
- ❌ Fast feedback during development (too slow)
- ❌ Testing business logic (use unit tests)

### E2E Test Structure

Example E2E test:

```typescript
import { test, expect } from '@playwright/test';
import {
  injectPocketDingSettings,
  waitForSyncComplete,
  navigateToBookmarks,
  getBookmarkCount,
} from './utils/playwright-helpers';

test('should sync bookmarks from real Linkding server', async ({ page }) => {
  // Get Linkding connection info from environment
  const linkdingUrl = process.env['E2E_LINKDING_URL'];
  const linkdingToken = process.env['E2E_LINKDING_TOKEN'];

  // Configure Pocket Ding
  await injectPocketDingSettings(page, {
    linkding_url: linkdingUrl,
    linkding_token: linkdingToken,
  });

  // Navigate and sync
  await navigateToBookmarks(page);
  await waitForSyncComplete(page);

  // Verify bookmarks synced
  const count = await getBookmarkCount(page);
  expect(count).toBeGreaterThan(0);
});
```

### E2E Testing Best Practices

1. **Docker Availability**: E2E tests are automatically skipped if Docker is not available
2. **Test Isolation**: Each test clears browser storage before running
3. **Shared Container**: Global setup runs once, tests share the same Linkding instance
4. **Test Data**: Linkding is populated with realistic bookmarks in global setup
5. **Timeouts**: Use appropriate timeouts for container startup (90s) and sync operations (30s)
6. **Cleanup**: TestContainers automatically cleans up containers after tests complete

### Troubleshooting E2E Tests

**Tests skipped with "Docker not available":**
- Ensure Docker is installed and running: `docker info`
- Check Docker socket is accessible: `ls -la /var/run/docker.sock`

**Container startup timeouts:**
- Increase `startupTimeout` in `global-setup.ts` (default: 90000ms)
- Check Docker has enough resources (memory, CPU)
- Check internet connection for Docker image download

**Tests fail with "Linkding environment variables not set":**
- Global setup may have failed
- Check Playwright output for global setup errors
- Verify Docker can pull `sissbruecker/linkding:latest` image

**Service worker not activating:**
- Ensure production build exists: `npm run build`
- Check Playwright `webServer` configuration starts preview server
- Verify service worker is served from correct path

## Docker Requirements for E2E Tests

E2E tests require Docker to run TestContainers. If Docker is not available:
- Tests will be skipped automatically
- Set `E2E_TESTS_DISABLED=true` to skip globally
- Unit and integration tests will still run normally

To install Docker:
- **Linux**: `sudo apt install docker.io` or follow [Docker docs](https://docs.docker.com/engine/install/)
- **macOS**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
- **Windows**: Install [Docker Desktop](https://www.docker.com/products/docker-desktop)
