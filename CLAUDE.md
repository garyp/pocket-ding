# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `bookmark-list.ts`: Displays and filters bookmarks with sync functionality
- `bookmark-reader.ts`: Reading interface with original/readability modes
- `settings-panel.ts`: Configuration UI for Linkding API connection

**Services** (`src/services/`):
- `linkding-api.ts`: Handles API communication with Linkding server
- `database.ts`: Local storage operations using Dexie/IndexedDB
- `sync-service.ts`: Synchronizes bookmarks between Linkding and local storage
- `content-fetcher.ts`: Processes article content with Readability

**Data Flow**:
1. Settings configured → API connection established
2. Sync service fetches bookmarks from Linkding
3. Content fetcher processes articles for offline reading
4. Local database stores bookmarks and reading progress
5. Components display cached content with real-time sync

### Key Features
- Offline reading with content caching
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

## Development Notes

- Uses Material Web Components for UI with Material Design 3 styling
- Implements strict TypeScript with unused parameter/variable checking
- Service worker registration for PWA functionality
- CSS custom properties for theming consistency
- Web Components follow Lit's reactive property patterns

### Code Style

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

## Testing Requirements

**IMPORTANT**: Always add comprehensive tests for new features without being asked. This includes:

### Required Test Coverage for New Features:
1. **Unit Tests**: Core functionality and edge cases
2. **Component Tests**: UI behavior and event handling  
3. **Integration Tests**: Full user workflows
4. **Error Handling**: Failure scenarios and recovery
5. **Performance**: Non-blocking behavior and responsiveness

### Test File Locations:
- Unit tests: `src/test/unit/[feature-name].test.ts`
- Component tests: `src/test/unit/[component-name].test.ts` 
- Integration tests: `src/test/integration/[workflow-name].test.ts`

### Test Categories to Cover:
- Happy path functionality
- Error conditions and recovery
- Component lifecycle (connect/disconnect)
- Event system behavior
- State persistence across navigation
- User interaction during background operations
- Performance and responsiveness

Remember: Tests should be written as part of feature development, not as an afterthought.

### Testing Instead of Manual Validation

**IMPORTANT**: Always use tests to verify changes instead of running the development server.

- When implementing fixes or new features, write tests to validate the behavior
- Do NOT use `npm run dev` or manual testing to verify changes work correctly  
- Tests provide reliable, repeatable validation and prevent regressions
- Manual testing with the dev server should only be used for exploratory work, not validation

### Fake Timers for Deterministic Testing

**IMPORTANT**: Use vitest fake timers instead of real delays for deterministic tests.

**❌ Bad - Brittle timing with real delays:**
```typescript
// Don't do this - brittle and slow
await new Promise(resolve => setTimeout(resolve, 1000));
expect(someAsyncBehavior).toHaveOccurred();

// Don't do this - incorrect workaround
vi.stubGlobal('setTimeout', (fn: Function) => fn());
```

**✅ Good - Deterministic fake timers:**
```typescript
it('should clear highlights after timeout', () => {
  vi.useFakeTimers();
  
  try {
    // Trigger code that uses setTimeout
    component.startTimeout();
    
    // Fast-forward time deterministically
    vi.advanceTimersByTime(3000);
    
    // Assert expected behavior
    expect(component.isHighlighted()).toBe(false);
  } finally {
    vi.useRealTimers(); // Always restore
  }
});
```

**When to use fake timers:**
- Any code that uses `setTimeout`, `setInterval`, or other timer functions
- Debounced operations (like save-after-scroll)
- Delayed UI state changes (like clearing highlights)
- Background processes with timing dependencies

**Fake timer patterns:**
- `vi.useFakeTimers()` - Enable fake timers at start of test
- `vi.advanceTimersByTime(ms)` - Fast-forward time by specified milliseconds
- `vi.runAllTimers()` - Execute all pending timers immediately
- `vi.useRealTimers()` - Always restore in finally block or afterEach

### Development Best Practices

- Always check that the build works after you've gotten the tests passing