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

export interface LocalBookmark extends LinkdingBookmark {
  content?: string;
  readability_content?: string;
  cached_at?: string;
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
}

export interface AppSettings {
  linkding_url: string;
  linkding_token: string;
  sync_interval: number;
  auto_sync: boolean;
  reading_mode: 'original' | 'readability';
}