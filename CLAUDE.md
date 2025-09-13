# AGENTS.md

This file provides guidance to AI agents (including Claude, GPT, etc.) when working with code in this repository.

## Project Overview

Pocket Ding is a Progressive Web App (PWA) that provides an offline reading experience for Linkding bookmarks. It's built with Lit framework, TypeScript, and Vite, utilizing Dexie for local IndexedDB storage and Mozilla Readability for enhanced content reading.

## Development Commands

- **Start development server**: `npm run dev`
- **Build for production**: `npm run build` (runs TypeScript compilation + Vite build)
- **Preview production build**: `npm run preview`
- **Run all tests**: `npm test`
- **Run unit tests only**: `npm run test:unit`
- **Run integration tests only**: `npm run test:integration`
- **Run tests in watch mode**: `npm run test:watch`

## Architecture & Tech Stack

### Core Technologies
- **Framework**: Lit (Web Components)
- **Build Tool**: Vite
- **TypeScript**: Strict mode enabled with experimental decorators
- **UI Components**: Material Web Components (Material Design 3)
- **Database**: Dexie (IndexedDB wrapper)
- **Content Processing**: Mozilla Readability
- **Testing**: Vitest with Happy DOM environment

### Application Structure

**Components** (`src/components/`):
- `app-root.ts`: Main application shell with routing between views
- `bookmark-list.ts`: Displays and filters bookmarks with reactive database queries
- `bookmark-reader.ts`: Reading interface with original/readability modes
- `settings-panel.ts`: Configuration UI for Linkding API connection

**Services** (`src/services/`):
- `linkding-api.ts`: Handles API communication with Linkding server
- `database.ts`: Local storage operations using Dexie/IndexedDB with reactive queries
- `sync-service.ts`: Synchronizes bookmarks between Linkding and local storage
- `content-fetcher.ts`: Processes article content with Readability

**Controllers** (`src/controllers/`):
- `reactive-query-controller.ts`: Manages reactive database queries with automatic UI updates
- `state-controller.ts`: Handles persistent component state

**Data Flow**:
1. Settings configured → API connection established
2. Sync service fetches bookmarks from Linkding
3. Reactive queries automatically update UI when data changes
4. Local database stores bookmarks and reading progress
5. Components display cached content with real-time reactivity

### Key Features
- Offline reading with content caching
- Reactive database queries with automatic UI updates
- Reading progress tracking with scroll position
- Dual reading modes (original HTML vs. Readability processed)
- Background sync with configurable intervals
- PWA capabilities with service worker

## Testing

Tests use Vitest with Happy DOM environment. The setup includes:
- **Unit tests**: Individual service and utility testing
- **Integration tests**: Full component interaction flows
- **Mocking**: Database and API services are mocked for reliable testing
- **Custom Elements**: Lit components are properly registered for testing

All tests should pass before considering features complete. The CI expects zero test failures.

## Code Style Guidelines

### Private Class Members
**IMPORTANT**: Use JavaScript `#` syntax for private class variables and methods instead of TypeScript `private` syntax.

**❌ Bad - TypeScript private syntax:**
```typescript
class MyComponent extends LitElement {
  private myProperty: string = '';
  private myMethod() { /* ... */ }
}
```

**✅ Good - JavaScript # syntax:**
```typescript
class MyComponent extends LitElement {
  #myProperty: string = '';
  #myMethod() { /* ... */ }
}
```

### Reactive Query Controller Naming
**IMPORTANT**: When creating instances of `ReactiveQueryController`, use the suffix `Query` instead of `Controller` for clarity.

**❌ Bad - Controller suffix:**
```typescript
class BookmarkList extends LitElement {
  private bookmarksController = new ReactiveQueryController(/*...*/);
}
```

**✅ Good - Query suffix:**
```typescript
class BookmarkList extends LitElement {
  #bookmarksQuery = new ReactiveQueryController(/*...*/);
}
```

### Other Style Rules

- **Interface Naming**: Do NOT use "I" prefix for interfaces. Name interfaces directly (e.g., `LinkdingAPI` not `ILinkdingAPI`)
- **Event Handlers**: Use arrow functions instead of `bind()` for configuring event handlers. Arrow functions maintain lexical scope and are more readable than `.bind(this)` calls.

### Build Process

**IMPORTANT**: Always run both tests AND build after making changes.

- Run `npm test` to verify functionality
- Run `npm run build` to verify TypeScript compilation
- Both must pass before committing changes
- CI will fail if either tests or build fail

### Material Icons

**IMPORTANT**: Material Web Components uses Material Icons with simpler integration.

When adding new Material icons:
1. Use the icon in your component: `<md-icon>icon_name</md-icon>`
2. Icons are loaded from Google Material Icons font
3. No explicit registration required

Find available icons at: https://fonts.google.com/icons

### Dark Mode Support

The application includes comprehensive dark mode support:
- **System Detection**: Automatically follows system dark mode preference
- **Per-Bookmark Override**: Users can override dark mode per bookmark in the reader
- **Theme Service**: Manages global theme state and Material Design theme switching
- **Persistent Preferences**: Dark mode overrides are saved per bookmark

## Reactive Database Architecture

**IMPORTANT**: The app uses reactive database queries that automatically update the UI when data changes.

### Key Components:
- **ReactiveQueryController**: Manages Dexie liveQuery subscriptions with proper lifecycle
- **Database Service**: Provides both traditional and reactive (`*Live()`) query methods
- **Automatic Updates**: Components re-render when relevant database data changes

### Usage Pattern:
```typescript
class MyComponent extends LitElement {
  #dataQuery = new ReactiveQueryController(
    this,
    () => DatabaseService.getDataLive()
  );
  
  get data() { return this.#dataQuery.value ?? []; }
  get isLoading() { return this.#dataQuery.loading; }
}
```

### Benefits:
- No manual refresh callbacks needed
- Automatic UI updates on database changes
- Simplified component logic
- Better performance through targeted updates

## Testing Philosophy

**IMPORTANT**: This codebase follows a **user-behavior-focused testing approach** that prioritizes maintainability and clarity over implementation coverage.

### Core Testing Principles:
1. **Test User Behavior, Not Implementation**: Focus on what users can do and see, not internal code structure
2. **Minimal Mocking**: Only mock external dependencies (APIs, databases), never internal services
3. **Integration Over Units**: Prefer integration tests that exercise complete user workflows
4. **Regression Protection**: Tests should catch bugs that break real user functionality
5. **Fast & Reliable**: Test suite runs in <3 seconds with zero flaky tests

### Test Suite Architecture:

**Test Categories:**
1. **Unit Tests** (`src/test/unit/`): Core service logic (ContentFetcher, SecurityService)
2. **Integration Tests** (`src/test/integration/`): Component interactions and security workflows
3. **Workflow Tests** (`src/test/workflows/`): User journeys, error scenarios, and accessibility testing

### Testing Guidelines:

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

### New Feature Testing:

When adding new features, write **all tests necessary to validate the user workflows**:
1. **Integration tests** covering all user workflows enabled by the feature
2. **Unit tests** for complex service logic with edge cases
3. **Error handling tests** for user-visible failure scenarios
4. **Accessibility tests** when the feature affects user interaction

Focus on **quality and conciseness over quantity** - write comprehensive tests for user journeys and error scenarios, but avoid testing implementation details.

### Test Writing Patterns:

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

### Coverage Philosophy:

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

### Component-Aware Testing Utilities

**IMPORTANT**: Use component-aware utilities for testing Lit components with timing dependencies.

#### waitForComponent() - Enhanced waitFor with Timer Management

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

#### Targeted Fake Timers for Specific Tests

For testing specific timing behavior, use targeted fake timers:

```typescript
import { withFakeTimers, createTestTimeout } from '../utils/targeted-fake-timers';

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

#### Testing Patterns:

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

#### Key Benefits:
- **Component-compatible**: Works seamlessly with Lit component lifecycle
- **Deterministic**: Controlled timer advancement eliminates flakiness  
- **Flexible**: Can be customized or disabled per test scenario
- **Drop-in replacement**: Gradual adoption without breaking existing tests

### Reader View Optimization

**IMPORTANT**: The reader view must take as little space as possible to maximize content area.

- Minimize toolbar height and unnecessary UI elements
- Remove loading indicators and unnecessary header blocks from Live URL content
- Keep the user interface minimal to prioritize reading experience
- Consider hiding progress tracking UI when it's not applicable (e.g., Live URL iframes)

### Development Best Practices

- Always check that the build works after you've gotten the tests passing
- Use reactive database queries instead of manual data management
- Follow the JavaScript `#` syntax for private members
- Name reactive query controllers with `Query` suffix for clarity
