# Bookmark Filtering - Requirements & Implementation Plan

## Overview

This document outlines the requirements and implementation plan for adding comprehensive filtering capabilities to Pocket Ding's bookmark list.

## Requirements

### Functional Requirements

#### 1. Filter Criteria

Users shall be able to filter bookmarks by the following metadata:

- **Tags**: Select one or more tags
- **Read Status**: Unread, Read, or both
- **Archived Status**: Archived, Unarchived, or both
- **Date Added**: Filter by when bookmarks were added to Linkding

**Out of Scope for Initial Release:**
- Text search (title, description, URL) - planned for future enhancement

#### 2. Filter Logic

- Multiple filters use **AND logic** (all selected filters must match)
- Example: Selecting tag "tech" AND "unread" shows only unread bookmarks with the tech tag
- Within the same filter type, behavior depends on the filter:
  - Tags: OR logic (bookmark must have ANY selected tag)
  - Status filters: User selects one option (read/unread/both, archived/unarchived/both)

#### 3. User Interface

**Filter Access:**
- Filter button in the bookmark list toolbar
- Button opens a modal/dialog for filter configuration

**Filter Dialog Layout:**
- Grouped by filter type (Tags, Status, Date)
- **Tags Section**: Chip/badge selection interface for choosing tags
- **Status Section**: Radio buttons or toggle options for read/unread and archived/unarchived
- **Date Section**:
  - Predefined ranges: Today, Last 7 days, Last 30 days, This year
  - Custom date range picker (from/to dates)
- **Clear All Filters** button to reset all filters at once
- **Apply/Close** buttons to confirm or cancel changes

**Active Filter Display:**
- Replace current "All" chip with a filter summary text
- Summary shows active filters (e.g., "3 tags, Unread, Last 30 days")
- Remove dedicated "Unread" and "Archived" chips (functionality moves to filter dialog)

**Empty State:**
- When active filters result in zero bookmarks, show:
  - Message explaining no bookmarks match current filters
  - Suggestion to clear or adjust filters

#### 4. Persistence

- Active filters persist across sessions
- Filters saved to local storage
- When user reopens app, previously applied filters are automatically restored

#### 5. UI Philosophy Alignment

- Minimal UI to maximize reading space
- Filter dialog only visible when needed
- Clean, Material Design 3 compliant interface
- Accessible and mobile-friendly

### Non-Functional Requirements

- **Performance**: Filtering should be near-instantaneous (<100ms) for up to 10,000 bookmarks
- **Reactivity**: Use reactive database queries for automatic UI updates
- **Accessibility**: Keyboard navigation, screen reader support, proper ARIA labels
- **Mobile**: Touch-friendly controls, responsive layout
- **Testing**: Comprehensive test coverage following project testing philosophy

## Implementation Plan

### Phase 1: Data Layer (Services & Database)

#### 1.1 Database Schema Updates

**File:** `src/services/database.ts`

- Add filter state storage table or use existing key-value storage
- Schema for persisted filter state:
  ```typescript
  interface FilterState {
    tags: string[];
    readStatus: 'all' | 'read' | 'unread';
    archivedStatus: 'all' | 'archived' | 'unarchived';
    dateFilter: {
      type: 'all' | 'preset' | 'custom';
      preset?: 'today' | 'last7days' | 'last30days' | 'thisyear';
      customFrom?: Date;
      customTo?: Date;
    };
  }
  ```

#### 1.2 Filter Service

**New File:** `src/services/filter-service.ts`

- `saveFilterState(filters: FilterState): Promise<void>` - Persist filters to database
- `loadFilterState(): Promise<FilterState | null>` - Retrieve saved filters
- `clearFilterState(): Promise<void>` - Remove saved filters
- `applyFilters(bookmarks: Bookmark[], filters: FilterState): Bookmark[]` - Apply filter logic

**Filter Logic Implementation:**
- Tag filtering: Check if bookmark has ANY of the selected tags (OR logic)
- Read status: Filter based on `is_archived` or custom read tracking
- Archived status: Filter based on `is_archived` field
- Date filtering: Compare bookmark `date_added` against selected range

#### 1.3 Reactive Query Updates

**File:** `src/services/database.ts`

- Update `getBookmarksLive()` to accept optional filter parameters
- Ensure reactive queries work with filtered results
- Maintain performance with Dexie indexing

### Phase 2: UI Components

#### 2.1 Filter Dialog Component

**New File:** `src/components/filter-dialog.ts`

**Component Structure:**
```typescript
class FilterDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) filters: FilterState;

  // Internal state for temporary filter selections
  #tempFilters: FilterState;

  // Available tags from database
  #availableTagsQuery = new ReactiveQueryController(...);

  render() {
    // Material Dialog with sections:
    // - Tags (chip selection)
    // - Status (radio buttons/toggles)
    // - Date (preset buttons + custom range)
    // - Actions (Clear All, Cancel, Apply)
  }
}
```

**Features:**
- Material Web Components (md-dialog, md-chip-set, md-radio, etc.)
- Grouped sections with clear visual hierarchy
- Chip/badge interface for tag selection
- Date picker integration (Material date pickers or native input type="date")
- Form validation for custom date ranges
- Emit custom events when filters are applied or cleared

#### 2.2 Filter Button & Summary

**File:** `src/components/bookmark-list.ts`

**Updates:**
- Add filter button to toolbar (Material icon button with filter icon)
- Remove existing "Unread" and "Archived" chips
- Replace "All" chip with filter summary component
- Summary text generation:
  - No filters: "All bookmarks"
  - With filters: "3 tags, Unread, Last 30 days" (concise summary)

**Filter Summary Component** (option: inline or separate component):
```typescript
#renderFilterSummary() {
  const parts = [];
  if (this.#filters.tags.length > 0) {
    parts.push(`${this.#filters.tags.length} tag${this.#filters.tags.length > 1 ? 's' : ''}`);
  }
  if (this.#filters.readStatus !== 'all') {
    parts.push(this.#filters.readStatus === 'read' ? 'Read' : 'Unread');
  }
  if (this.#filters.archivedStatus !== 'all') {
    parts.push(this.#filters.archivedStatus === 'archived' ? 'Archived' : 'Active');
  }
  if (this.#filters.dateFilter.type !== 'all') {
    parts.push(this.#getDateFilterLabel());
  }
  return parts.length > 0 ? parts.join(', ') : 'All bookmarks';
}
```

#### 2.3 Empty State Component

**File:** `src/components/bookmark-list.ts`

**Updates:**
- Add empty state rendering when `bookmarks.length === 0` and filters active
- Display friendly message: "No bookmarks match your current filters"
- Include helpful suggestions: "Try adjusting or clearing your filters"
- Show "Clear Filters" action button

### Phase 3: State Management & Integration

#### 3.1 Bookmark List Updates

**File:** `src/components/bookmark-list.ts`

**Changes:**
- Add filter state property: `#filters: FilterState`
- Load saved filters on component initialization
- Update reactive query to use filters:
  ```typescript
  #bookmarksQuery = new ReactiveQueryController(
    this,
    () => {
      const bookmarks = await DatabaseService.getBookmarksLive();
      return FilterService.applyFilters(bookmarks, this.#filters);
    }
  );
  ```
- Handle filter dialog events (open, apply, clear)
- Update filter summary when filters change
- Persist filters when changed

#### 3.2 Event Flow

1. User clicks filter button → Open filter dialog
2. User adjusts filters in dialog → Update temporary filter state
3. User clicks "Apply" → Update component filter state, persist to DB, close dialog
4. Reactive query automatically re-runs with new filters
5. UI updates with filtered bookmarks
6. Filter summary updates to show active filters

### Phase 4: Styling & Polish

#### 4.1 Material Design 3 Styling

**File:** `src/components/filter-dialog.ts` and related styles

- Follow Material Design 3 guidelines for dialogs
- Use elevation and surface colors appropriately
- Ensure proper spacing and typography
- Dark mode support (inherit from theme service)
- Responsive layout for mobile devices

#### 4.2 Accessibility

- Proper ARIA labels for all interactive elements
- Keyboard navigation (Tab, Enter, Escape)
- Focus management (dialog trap, return focus on close)
- Screen reader announcements for filter changes
- Sufficient color contrast for all text

#### 4.3 Animations

- Smooth dialog open/close transitions (Material motion)
- Chip selection animations
- Filter summary updates (subtle fade/slide)
- Empty state appearance (fade in)

### Phase 5: Testing

Following the project's user-behavior-focused testing approach:

#### 5.1 Unit Tests

**File:** `src/services/filter-service.test.ts`

- Test filter logic with various combinations
- Edge cases: empty filters, all filters applied, date boundaries
- Tag matching (OR logic within tags)
- Status filtering (read/unread, archived/unarchived)
- Date range calculations

#### 5.2 Integration Tests

**File:** `src/components/filter-dialog.test.ts`

- Dialog opening/closing
- Filter selection and clearing
- Persistence to database
- Event emission on apply/cancel
- Form validation for custom date ranges

**File:** `src/components/bookmark-list.test.ts`

- Filter button interaction
- Filter summary updates
- Reactive query updates with filters
- Empty state rendering
- Filter persistence across component lifecycle

#### 5.3 Workflow Tests

**File:** `src/test/workflow/filtering-workflow.test.ts`

- Complete filtering workflows from user perspective:
  - Open dialog → Select tags → Apply → See filtered results
  - Apply multiple filters → Clear all → See all bookmarks
  - Set filters → Reload page → See persisted filters
  - Filter to zero results → See empty state → Clear filters
  - Mobile interaction patterns

#### 5.4 E2E Tests

**File:** `tests/e2e/filtering.spec.ts`

- End-to-end filtering scenarios with real Linkding data
- Filter persistence across browser sessions
- Cross-browser compatibility
- Mobile device testing
- Performance with large bookmark sets

### Phase 6: Documentation & Migration

#### 6.1 User Documentation

**File:** `README.md` updates

- Add filtering section to features list
- Screenshot or GIF of filter dialog
- Explain filter logic (AND behavior)

#### 6.2 Developer Documentation

**File:** `CLAUDE.md` updates

- Document filter architecture
- Add filter service to architecture overview
- Note removal of dedicated filter chips

#### 6.3 Migration Considerations

- Existing users won't have saved filters (graceful degradation)
- Default state: No filters applied (show all bookmarks)
- No database migration required (new tables/keys only)

## Technical Considerations

### Performance Optimization

- **Debounce filter changes** in dialog to avoid excessive queries
- **Index database** on commonly filtered fields (date_added, is_archived)
- **Memoize filter results** when filter state hasn't changed
- **Virtual scrolling** maintained with filtered results

### Edge Cases

- **No tags available**: Hide or disable tag filter section
- **Invalid date ranges**: Validate that "from" date is before "to" date
- **Empty bookmarks**: Show different message than "no results from filters"
- **Very long tag names**: Truncate with ellipsis in chips
- **Many tags**: Consider scrollable chip container or search within tags

### Future Enhancements (Out of Scope)

- Text search filtering (title, description, URL, content)
- Saved filter presets
- OR logic option for filter combinations
- Filter by reading progress
- Advanced tag operators (NOT, exact match)
- Filter by domain/website
- Export filtered bookmarks

## Implementation Timeline

**Estimated Effort:** 3-4 development sessions

1. **Session 1**: Data layer (filter service, database updates, filter logic)
2. **Session 2**: Filter dialog component (UI, Material components, interactions)
3. **Session 3**: Integration (bookmark list updates, state management, persistence)
4. **Session 4**: Testing, polish, documentation

## Success Criteria

- ✅ Users can filter bookmarks by tags, read status, archived status, and date
- ✅ Multiple filters work together with AND logic
- ✅ Filters persist across app sessions
- ✅ Filter dialog is accessible and mobile-friendly
- ✅ Active filters clearly displayed in summary
- ✅ Empty state shown when no results match filters
- ✅ All tests pass (unit, integration, workflow, E2E)
- ✅ Build completes successfully
- ✅ Performance remains fast (<100ms filtering)
- ✅ UI maintains minimal, clean aesthetic

## Questions & Decisions Log

1. **Q:** What metadata to filter by?
   **A:** All available metadata (tags, read/unread, archived, date) except text search

2. **Q:** UI pattern for filters?
   **A:** Filter button that opens modal/dialog (aligns with minimal UI philosophy)

3. **Q:** Multiple filter logic?
   **A:** AND logic (all selected filters must match)

4. **Q:** Persist filters?
   **A:** Yes, save to local storage and restore on app load

5. **Q:** How to show active filters?
   **A:** Replace "All" chip with summary text, remove dedicated Unread/Archived chips

6. **Q:** Tag selection UI?
   **A:** Chip/badge selection interface

7. **Q:** Dialog layout?
   **A:** Grouped by filter type for better organization

8. **Q:** Date filtering options?
   **A:** Predefined ranges (Today, Last 7/30 days, This year) + custom date picker

9. **Q:** Empty results handling?
   **A:** Show message explaining no matches and suggest clearing filters

10. **Q:** Clear all filters option?
    **A:** Yes, include "Clear All Filters" button in dialog
