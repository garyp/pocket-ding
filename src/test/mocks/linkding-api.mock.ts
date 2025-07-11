import { LinkdingBookmark, LinkdingResponse } from '../../types';

export const mockBookmarks: LinkdingBookmark[] = [
  {
    id: 1,
    url: 'https://example.com/article1',
    title: 'Test Article 1',
    description: 'This is a test article description',
    notes: '',
    website_title: 'Example Site',
    website_description: 'Example website',
    web_archive_snapshot_url: '',
    favicon_url: 'https://example.com/favicon.ico',
    preview_image_url: '',
    is_archived: false,
    unread: true,
    shared: false,
    tag_names: ['tech', 'programming'],
    date_added: '2024-01-01T10:00:00Z',
    date_modified: '2024-01-01T10:00:00Z',
  },
  {
    id: 2,
    url: 'https://example.com/article2',
    title: 'Test Article 2',
    description: 'Another test article',
    notes: 'Some notes',
    website_title: 'Example Site',
    website_description: 'Example website',
    web_archive_snapshot_url: '',
    favicon_url: 'https://example.com/favicon.ico',
    preview_image_url: '',
    is_archived: false,
    unread: false,
    shared: false,
    tag_names: ['design'],
    date_added: '2024-01-02T10:00:00Z',
    date_modified: '2024-01-02T10:00:00Z',
  },
];

export const mockLinkdingResponse: LinkdingResponse = {
  count: mockBookmarks.length,
  next: null,
  previous: null,
  results: mockBookmarks,
};

export class MockLinkdingAPI {
  static async getBookmarks(): Promise<LinkdingResponse> {
    return mockLinkdingResponse;
  }

  static async getAllBookmarks(): Promise<LinkdingBookmark[]> {
    return mockBookmarks;
  }

  static async getBookmark(id: number): Promise<LinkdingBookmark> {
    const bookmark = mockBookmarks.find(b => b.id === id);
    if (!bookmark) {
      throw new Error('Bookmark not found');
    }
    return bookmark;
  }

  static async testConnection(): Promise<boolean> {
    return true;
  }
}