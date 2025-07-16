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
- **UI Components**: Shoelace Design System
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

- Uses Shoelace CDN for UI components with base path configuration
- Implements strict TypeScript with unused parameter/variable checking
- Service worker registration for PWA functionality
- CSS custom properties for theming consistency
- Web Components follow Lit's reactive property patterns

### Shoelace Icons

**IMPORTANT**: Icons must be explicitly registered to be included in builds.

When adding new Shoelace icons:
1. Add the icon name to the `REQUIRED_ICONS` array in `src/icons/index.ts`
2. Use the icon in your component: `<sl-icon name="icon-name"></sl-icon>`
3. The build system will automatically copy the icon to the output

The build system does NOT automatically scan for icons. All icons must be explicitly registered in the `REQUIRED_ICONS` array. Find available icons at: https://shoelace.style/components/icon

### Dark Mode Support

The application includes comprehensive dark mode support:
- **System Detection**: Automatically follows system dark mode preference
- **Per-Bookmark Override**: Users can override dark mode per bookmark in the reader
- **Theme Service**: Manages global theme state and Shoelace CSS switching
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

### Development Best Practices

- Always check that the build works after you've gotten the tests passing