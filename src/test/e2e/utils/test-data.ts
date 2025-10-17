/**
 * Test data generation and population utilities for E2E tests
 */

export interface BookmarkData {
  url: string;
  title?: string;
  description?: string;
  notes?: string | undefined;
  tag_names?: string[];
  is_archived?: boolean;
  unread?: boolean;
  shared?: boolean;
}

export interface LinkdingAPIClient {
  baseUrl: string;
  apiToken: string;
}

/**
 * Create a Linkding API client for test data population
 *
 * @param baseUrl - Base URL of Linkding instance (e.g., http://localhost:9090)
 * @param apiToken - API token for authentication
 */
export function createLinkdingClient(
  baseUrl: string,
  apiToken: string
): LinkdingAPIClient {
  return {
    baseUrl: baseUrl.replace(/\/$/, ''), // Remove trailing slash
    apiToken,
  };
}

/**
 * Create a bookmark via Linkding API
 *
 * @param client - Linkding API client
 * @param bookmark - Bookmark data to create
 * @returns Created bookmark object from API
 */
export async function createBookmark(
  client: LinkdingAPIClient,
  bookmark: BookmarkData
): Promise<any> {
  const response = await fetch(`${client.baseUrl}/api/bookmarks/`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${client.apiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bookmark),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `Failed to create bookmark: ${response.status} ${response.statusText}\n${text}`
    );
  }

  return response.json();
}

/**
 * Create multiple bookmarks in batch
 *
 * @param client - Linkding API client
 * @param bookmarks - Array of bookmark data
 * @returns Array of created bookmark objects
 */
export async function createBookmarksBatch(
  client: LinkdingAPIClient,
  bookmarks: BookmarkData[]
): Promise<any[]> {
  const results: any[] = [];

  for (const bookmark of bookmarks) {
    try {
      const result = await createBookmark(client, bookmark);
      results.push(result);
      // Small delay to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to create bookmark ${bookmark.url}:`, error);
      throw error;
    }
  }

  return results;
}

/**
 * Get all bookmarks from Linkding
 *
 * @param client - Linkding API client
 * @param params - Optional query parameters
 * @returns Array of bookmarks
 */
export async function getBookmarks(
  client: LinkdingAPIClient,
  params?: {
    q?: string;
    tag?: string;
    limit?: number;
    offset?: number;
  }
): Promise<any[]> {
  const queryParams = new URLSearchParams();
  if (params?.q) queryParams.set('q', params.q);
  if (params?.tag) queryParams.set('tag', params.tag);
  if (params?.limit) queryParams.set('limit', params.limit.toString());
  if (params?.offset) queryParams.set('offset', params.offset.toString());

  const url = `${client.baseUrl}/api/bookmarks/?${queryParams}`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Token ${client.apiToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to get bookmarks: ${response.status} ${response.statusText}`
    );
  }

  const data = await response.json();
  return data.results || [];
}

/**
 * Check if a URL is already bookmarked
 *
 * @param client - Linkding API client
 * @param url - URL to check
 * @returns Bookmark object if exists, null otherwise
 */
export async function checkBookmark(
  client: LinkdingAPIClient,
  url: string
): Promise<any | null> {
  const encodedUrl = encodeURIComponent(url);
  const response = await fetch(
    `${client.baseUrl}/api/bookmarks/check/?url=${encodedUrl}`,
    {
      headers: {
        'Authorization': `Token ${client.apiToken}`,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  return data.bookmark || null;
}

/**
 * Delete all bookmarks (useful for test cleanup)
 *
 * @param client - Linkding API client
 */
export async function deleteAllBookmarks(
  client: LinkdingAPIClient
): Promise<void> {
  const bookmarks = await getBookmarks(client, { limit: 1000 });

  for (const bookmark of bookmarks) {
    await fetch(`${client.baseUrl}/api/bookmarks/${bookmark.id}/`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Token ${client.apiToken}`,
      },
    });
  }
}

/**
 * Generate mock bookmark data for testing
 *
 * @param count - Number of bookmarks to generate (default: 10)
 * @returns Array of bookmark data objects
 */
export function generateMockBookmarks(count = 10): BookmarkData[] {
  const bookmarks: BookmarkData[] = [];
  const tags = ['technology', 'programming', 'news', 'reference', 'tutorial', 'documentation'];
  const domains = ['github.com', 'stackoverflow.com', 'dev.to', 'medium.com', 'reddit.com'];

  for (let i = 1; i <= count; i++) {
    const domain = domains[i % domains.length];
    const tagCount = 1 + (i % 3); // 1-3 tags per bookmark
    const selectedTags = tags.slice(0, tagCount);

    bookmarks.push({
      url: `https://${domain}/article-${i}`,
      title: `Test Bookmark ${i}`,
      description: `Description for test bookmark ${i}`,
      notes: i % 3 === 0 ? `# Notes\n\nSome markdown notes for bookmark ${i}` : undefined,
      tag_names: selectedTags,
      is_archived: i % 5 === 0, // Every 5th bookmark is archived
      unread: i % 4 === 0,       // Every 4th bookmark is unread
      shared: i % 3 === 0,       // Every 3rd bookmark is shared
    });
  }

  return bookmarks;
}

/**
 * Generate a realistic set of bookmarks with various content types
 */
export function generateRealisticBookmarks(): BookmarkData[] {
  return [
    {
      url: 'https://github.com/sissbruecker/linkding',
      title: 'Linkding - Self-hosted Bookmark Manager',
      description: 'Self-hosted bookmark manager that is designed to be minimal, fast, and easy to set up',
      tag_names: ['github', 'bookmarks', 'self-hosted'],
      unread: false,
      shared: true,
    },
    {
      url: 'https://developer.mozilla.org/en-US/docs/Web/API',
      title: 'Web APIs | MDN',
      description: 'When writing code for the Web, there are a large number of Web APIs available',
      tag_names: ['documentation', 'web', 'api'],
      unread: false,
      shared: true,
    },
    {
      url: 'https://stackoverflow.com/questions/tagged/javascript',
      title: 'Newest JavaScript Questions',
      description: 'Stack Overflow questions tagged with JavaScript',
      tag_names: ['programming', 'javascript', 'q&a'],
      unread: true,
      shared: false,
    },
    {
      url: 'https://www.typescriptlang.org/docs/',
      title: 'TypeScript Documentation',
      description: 'TypeScript is JavaScript with syntax for types',
      tag_names: ['typescript', 'documentation', 'programming'],
      notes: '# TypeScript\n\nStrongly typed superset of JavaScript',
      unread: false,
      shared: true,
    },
    {
      url: 'https://lit.dev/',
      title: 'Lit - Simple. Fast. Web Components.',
      description: 'Lit is a simple library for building fast, lightweight web components',
      tag_names: ['web-components', 'lit', 'framework'],
      unread: false,
      shared: false,
    },
    {
      url: 'https://playwright.dev/',
      title: 'Playwright - Fast and reliable end-to-end testing',
      description: 'Playwright enables reliable end-to-end testing for modern web apps',
      tag_names: ['testing', 'e2e', 'automation'],
      unread: true,
      shared: false,
    },
    {
      url: 'https://vitejs.dev/',
      title: 'Vite - Next Generation Frontend Tooling',
      description: 'Get ready for a development environment that can finally catch up with you',
      tag_names: ['build-tools', 'vite', 'frontend'],
      unread: false,
      shared: true,
    },
    {
      url: 'https://dexie.org/',
      title: 'Dexie.js - Minimalistic IndexedDB Wrapper',
      description: 'A Minimalistic Wrapper for IndexedDB',
      tag_names: ['database', 'indexeddb', 'javascript'],
      unread: false,
      shared: false,
    },
    {
      url: 'https://web.dev/progressive-web-apps/',
      title: 'Progressive Web Apps',
      description: 'Learn how to build high quality Progressive Web Apps',
      tag_names: ['pwa', 'web', 'tutorial'],
      unread: true,
      shared: true,
    },
    {
      url: 'https://news.ycombinator.com/',
      title: 'Hacker News',
      description: 'Social news website focusing on computer science and entrepreneurship',
      tag_names: ['news', 'technology', 'community'],
      is_archived: true,
      unread: false,
      shared: false,
    },
  ];
}

/**
 * Populate a Linkding instance with test data
 *
 * @param client - Linkding API client
 * @param preset - Preset type ('minimal' | 'realistic' | 'large')
 * @returns Array of created bookmarks
 */
export async function populateTestData(
  client: LinkdingAPIClient,
  preset: 'minimal' | 'realistic' | 'large' = 'realistic'
): Promise<any[]> {
  let bookmarks: BookmarkData[];

  switch (preset) {
    case 'minimal':
      bookmarks = generateMockBookmarks(5);
      break;
    case 'realistic':
      bookmarks = generateRealisticBookmarks();
      break;
    case 'large':
      bookmarks = generateMockBookmarks(50);
      break;
  }

  console.log(`Populating Linkding with ${bookmarks.length} test bookmarks...`);
  const results = await createBookmarksBatch(client, bookmarks);
  console.log(`✓ Created ${results.length} bookmarks`);

  return results;
}
