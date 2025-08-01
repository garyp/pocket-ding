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
  sync_interval: number;
  auto_sync: boolean;
  reading_mode: 'original' | 'readability';
  theme_mode?: ThemeMode;
}

export type ContentSource = 'asset' | 'readability';

export interface ContentSourceOption {
  type: ContentSource;
  label: string;
  assetId?: number;
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
  onSyncRequested: () => void;
  onFaviconLoadRequested: (bookmarkId: number, faviconUrl: string) => void;
  onVisibilityChanged: (visibleBookmarkIds: number[]) => void;
  onPageChange: (page: number) => void;
  onFilterChange: (filter: BookmarkFilter) => void;
}

export interface BookmarkListCallbacks {
  onBookmarkSelect: (bookmarkId: number) => void;
  onSyncRequested: () => void;
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
