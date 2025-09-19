# Service Worker Development Guidelines

## ⚠️ CRITICAL: Context Boundaries

Service workers run in a different context than browser code. Follow these rules:

### ✅ SAFE to import in service workers:
- `../types/*` - Type definitions only
- `./sw-*` - Service worker specific utilities
- `workbox-*` - Workbox libraries
- Pure utility functions with no side effects

### ❌ DANGEROUS to import in service workers:
- `../services/*` - Browser services (may use DOM APIs)
- `../components/*` - UI components
- `../controllers/*` - Browser controllers
- Anything that uses `window`, `document`, `localStorage`

### 🔍 Before adding ANY import:
1. Check if the imported code uses browser APIs
2. Test the service worker in production build mode
3. Verify version display works in settings

### Current Technical Debt:
- `DatabaseService` import should be refactored to use context-specific implementations
- Consider creating `@shared`, `@browser`, `@worker` directories in future