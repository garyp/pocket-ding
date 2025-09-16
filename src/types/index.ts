export type SyncPhase = 'bookmarks' | 'archived-bookmarks' | 'assets' | 'read-status' | 'complete';

export interface LinkdingBookmark {
  id: number;
  url: string;
  title: string;
  description: string;
  notes: string;
  website_title: string;
  website_description: string;
  web_archive_snapshot_url: string;
  favicon_url: string;
  preview_image_url: string;
  is_archived: boolean;
  unread: boolean;
  shared: boolean;
  tag_names: string[];
  date_added: string;
  date_modified: string;
}

export interface LinkdingResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LinkdingBookmark[];
}

export interface LinkdingAssetResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: LinkdingAsset[];
}

export interface LocalBookmark extends LinkdingBookmark {
  last_read_at?: string;
  read_progress?: number;
  reading_mode?: 'original' | 'readability';
  is_synced?: boolean;
  needs_read_sync?: boolean;
  needs_asset_sync?: boolean;
}

export interface ReadProgress {
  bookmark_id: number;
  progress: number;
  last_read_at: string;
  reading_mode: 'original' | 'readability';
  scroll_position: number;
  dark_mode_override?: 'light' | 'dark' | null;
}

export interface LinkdingAsset {
  id: number;
  asset_type: string;
  content_type: string;
  display_name: string;
  file_size: number;
  status: 'pending' | 'complete' | 'failure';
  date_created: string;
}

export interface LocalAsset extends LinkdingAsset {
  bookmark_id: number;
  content?: ArrayBuffer;
  cached_at?: string;
}

export interface AppSettings {
  linkding_url: string;
  linkding_token: string;
  auto_sync: boolean;
  reading_mode: 'original' | 'readability';
  theme_mode?: ThemeMode;
  debug_mode?: boolean;
}

export type ContentSource = 'asset' | 'readability' | 'url';

export interface ContentSourceOption {
  type: ContentSource;
  label: string;
  assetId?: number;
}

// Content fetcher result types - structured data instead of HTML
export interface ContentResult {
  source: ContentSource;
  content_type: 'html' | 'iframe' | 'error' | 'unsupported';
  html_content?: string;
  readability_content?: string | null;
  iframe_url?: string;
  error?: ContentError;
  metadata?: ContentMetadata;
}

export interface ContentError {
  type: 'cors' | 'network' | 'not_found' | 'unsupported' | 'server_error';
  message: string;
  details?: string;
  suggestions?: string[];
}

export interface ContentMetadata {
  content_type?: string;
  file_size?: number;
  asset_id?: number;
  display_name?: string;
  url?: string;
}

export type ThemeMode = 'light' | 'dark' | 'system';

// BookmarkList Container/Presentation Component Types

export interface BookmarkListProps {
  // Data props (reactive)
  bookmarks: LocalBookmark[];
  isLoading: boolean;
  bookmarksWithAssets: Set<number>;
  
  // Favicon props
  faviconCache: Map<number, string>;
  
  // Sync props
  syncedBookmarkIds: Set<number>;
  
  // Pagination state
  paginationState: PaginationState;
  
  // Callback props (actions)
  onBookmarkSelect: (bookmarkId: number) => void;
  onFaviconLoadRequested: (bookmarkId: number, faviconUrl: string) => void;
  onVisibilityChanged: (visibleBookmarkIds: number[]) => void;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: BookmarkFilter) => void;
}

export interface BookmarkListCallbacks {
  onBookmarkSelect: (bookmarkId: number) => void;
  onFaviconLoadRequested: (bookmarkId: number, faviconUrl: string) => void;
  onVisibilityChanged: (visibleBookmarkIds: number[]) => void;
}

// Bookmark List State Types
export type BookmarkFilter = 'all' | 'unread' | 'archived';

export interface BookmarkListState {
  scrollPosition: number;
}

export interface FilterCounts {
  all: number;
  unread: number;
  archived: number;
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  anchorBookmarkId?: number;
  filter: BookmarkFilter;
  filterCounts?: FilterCounts;
}

export interface BookmarkListContainerState {
  currentPage: number;
  pageSize: number;
  filter: BookmarkFilter;
  anchorBookmarkId?: number;
}

// Debug Mode Types
export interface DebugLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  category: 'sync' | 'api' | 'database' | 'app';
  operation: string;
  message: string;
  details?: any;
  error?: Error;
}

export interface DebugAppState {
  bookmarks: {
    total: number;
    unread: number;
    archived: number;
    withAssets: number;
  };
  sync: {
    isInProgress: boolean;
    lastSyncAt?: string;
    lastSyncError?: string;
    retryCount?: number;
    unarchivedOffset?: number;
    archivedOffset?: number;
    bookmarksNeedingAssetSync?: number;
    bookmarksNeedingReadSync?: number;
    currentProgress?: { current: number; total: number };
    nextScheduledAt?: string;
    serviceWorker?: {
      supported: boolean;
      registered: boolean;
      active: boolean;
      periodicSyncSupported: boolean;
      backgroundSyncSupported: boolean;
      permissionState: string;
      scope?: string;
      updateViaCache?: string;
      syncTags?: string[];
      periodicTags?: string[];
    };
  };
  api: {
    isConnected?: boolean;
    lastTestAt?: string;
    baseUrl?: string;
  };
  storage: {
    sizeEstimate?: number;
    quotaUsed?: number;
    quotaAvailable?: number;
  };
}

// Sync State Types
export interface SyncState {
  isSyncing: boolean;
  syncProgress: number;
  syncTotal: number;
  syncedBookmarkIds: Set<number>;
  syncPhase?: SyncPhase | undefined;
  syncStatus?: 'idle' | 'starting' | 'syncing' | 'completed' | 'failed' | 'cancelled';
  lastError?: string;
  retryCount?: number;
  getPercentage(): number;
}

export interface SyncControllerOptions {
  onSyncCompleted?: () => void;
  onSyncError?: (error: any) => void;
  onBookmarkSynced?: (bookmarkId: number, bookmark: any) => void;
}
