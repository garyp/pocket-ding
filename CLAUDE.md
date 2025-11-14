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
- **Run E2E tests**: `npm run test:e2e` (requires Docker, runs headless)
- **Run E2E tests (quick)**: `npm run test:e2e:quick` (chromium only, faster)
- **Debug E2E tests**: `npm run test:e2e:debug` (opens browser with inspector)

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

## Testing

**IMPORTANT**: This codebase follows a **user-behavior-focused testing approach** that prioritizes maintainability and clarity over implementation coverage. All tests should pass before considering features complete.

### Quick Reference

For comprehensive testing documentation, including:
- Test organization and directory structure
- When to use each test type (unit/integration/workflow/E2E)
- Testing philosophy and best practices
- Component-aware testing utilities
- E2E testing with TestContainers and Playwright
- Troubleshooting guide

**See [src/test/README.md](src/test/README.md)** for the complete testing guide.

### Core Principles

1. **Test User Behavior, Not Implementation**: Focus on what users can do and see
2. **Minimal Mocking**: Only mock external dependencies (APIs, databases)
3. **Integration Over Units**: Prefer integration tests that exercise complete workflows
4. **Fast & Reliable**: Test suite runs in <6 seconds with zero flaky tests

### Common Commands

```bash
# Run all unit/integration/workflow tests
npm test

# Run E2E tests (requires Docker)
npm run test:e2e:quick

# Run tests in watch mode
npm run test:watch
```

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
