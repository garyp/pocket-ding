# Architecture Proposal: Simplified Context-Aware Code Separation

## Problem
Our current architecture allows browser-specific code to be imported in service workers, creating:
- Runtime errors when browser APIs are called in SW context
- Maintenance overhead from workarounds
- Unclear boundaries about what code can be used where

## Solution: Directory-Based Context Separation

### Directory Structure
```
src/
├── shared/                 # Context-agnostic code (works in both browser and worker)
│   ├── types/             # Type definitions (currently src/types/)
│   ├── services/          # Context-agnostic services
│   │   ├── database.ts    # Already context-agnostic (uses Dexie)
│   │   ├── linkding-api.ts # Pure HTTP/fetch operations
│   │   ├── favicon-service.ts # Pure data processing
│   │   ├── content-fetcher.ts # Uses fetch API (available in both contexts)
│   │   └── debug-service.ts # Logging only
│   └── utils/             # Pure utility functions
│       ├── fetch-helper.ts # Currently uses window.location - needs refactoring
│       └── base-path.ts    # Pure string manipulation
├── browser/               # Browser-only code
│   ├── services/          # Browser-specific services
│   │   ├── theme-service.ts # Uses document, window, localStorage
│   │   ├── export-service.ts # Uses document for downloads
│   │   ├── import-service.ts # File handling
│   │   ├── settings-service.ts # May use localStorage
│   │   └── version-service.ts # May use browser APIs
│   ├── components/        # All UI components (unchanged)
│   └── controllers/       # All controllers (unchanged)
├── worker/                # Service worker only (unchanged)
│   ├── sw.ts
│   ├── sync-worker.ts
│   ├── sync-service.ts
│   └── sw-logger.ts
├── test/                  # Test organization
│   ├── shared/            # Tests for shared code
│   │   ├── unit/          # Unit tests for shared services
│   │   └── integration/   # Integration tests crossing contexts
│   ├── browser/           # Tests for browser-specific code
│   │   ├── unit/          # Component and browser service tests
│   │   ├── integration/   # Browser integration tests
│   │   ├── workflows/     # User workflow tests
│   │   └── playwright/    # E2E tests
│   ├── worker/            # Tests for worker-specific code
│   │   └── unit/          # Service worker tests
│   ├── mocks/             # Test mocks and utilities
│   └── utils/             # Test utilities
└── main.ts               # Browser entry point (unchanged)
```

### Key Principles

1. **Minimal Abstractions**: No interfaces for services that already work in both contexts
2. **Clear Boundaries**: Directory structure makes context explicit
3. **Existing Logic Preserved**: Services move but internal logic stays the same
4. **Test Organization**: Tests organized by the code they're testing

### Build-Time Enforcement

#### TypeScript Path Mapping
```typescript
// tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@shared/*": ["./src/shared/*"],
      "@browser/*": ["./src/browser/*"],
      "@worker/*": ["./src/worker/*"]
    }
  }
}
```

#### ESLint Rules for Context Boundaries
```javascript
// .eslintrc.js
{
  "rules": {
    "no-restricted-imports": [
      "error",
      {
        "patterns": [
          {
            "group": ["../browser/*", "@browser/*"],
            "importNames": ["*"],
            "message": "Service worker code cannot import browser-specific modules"
          }
        ]
      }
    ]
  },
  "overrides": [
    {
      "files": ["src/worker/**/*"],
      "rules": {
        "no-restricted-globals": ["error", "window", "document", "localStorage"]
      }
    }
  ]
}
```

### Services Classification

**Shared (Context-Agnostic):**
- `database.ts` - Uses Dexie (works everywhere)
- `linkding-api.ts` - Pure fetch operations
- `favicon-service.ts` - Data processing only
- `content-fetcher.ts` - Uses fetch (available in both)
- `debug-service.ts` - Logging only

**Browser-Only:**
- `theme-service.ts` - Uses document, window, localStorage
- `export-service.ts` - Creates DOM elements for downloads
- `import-service.ts` - File input handling
- `settings-service.ts` - May use localStorage
- `version-service.ts` - May use browser-specific APIs

**Needs Refactoring:**
- `fetch-helper.ts` - Currently uses `window.location`, needs to accept baseURL parameter

### Benefits

1. **Clear Boundaries**: Impossible to accidentally import browser code in SW
2. **Build-Time Enforcement**: TypeScript and ESLint catch issues early
3. **Maintainability**: Clear organization without over-abstraction
4. **Testing**: Test organization matches code organization
5. **Preserved Logic**: Existing service implementations stay intact
6. **Future-Proof**: No workarounds needed

### Migration Strategy

1. **Phase 1**: Create directory structure (`shared/`, `browser/`)
2. **Phase 2**: Move context-agnostic code to `shared/`
3. **Phase 3**: Move browser-specific code to `browser/`
4. **Phase 4**: Reorganize tests to match new structure
5. **Phase 5**: Add TypeScript path mapping and ESLint rules
6. **Phase 6**: Update all import statements to use new paths

### Implementation Example

```typescript
// After migration, imports become explicit about context:

// shared/services/database.ts - works in both contexts
export class DatabaseService {
  // Existing implementation unchanged
}

// browser/services/theme-service.ts - browser only
export class ThemeService {
  // Uses document, window, localStorage
}

// worker/sw.ts
import { DatabaseService } from '@shared/services/database';
// import { ThemeService } from '@browser/services/theme-service'; // ❌ ESLint error!

// browser/components/app-root.ts
import { DatabaseService } from '@shared/services/database';
import { ThemeService } from '@browser/services/theme-service'; // ✅ OK
```

This simplified architecture provides clear context boundaries without complex abstractions, making it impossible to accidentally use browser APIs in service worker code while preserving all existing functionality.