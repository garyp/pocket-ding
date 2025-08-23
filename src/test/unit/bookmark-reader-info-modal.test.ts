import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BookmarkReader } from '../../components/bookmark-reader';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';
import { ThemeService } from '../../services/theme-service';
import type { LocalBookmark } from '../../types';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service');

describe('BookmarkReader Info Modal', () => {
  let element: BookmarkReader;
  let mockBookmark: LocalBookmark;

  beforeEach(async () => {
    // Reset all mocks
    vi.clearAllMocks();

    // Mock bookmark data
    mockBookmark = {
      id: 1,
      url: 'https://example.com/article',
      title: 'Test Article',
      description: 'Test description',
      notes: '',
      website_title: 'Example Site',
      website_description: 'Example description',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      web_archive_snapshot_url: 'https://web.archive.org/test',
      tag_names: ['tech', 'programming'],
      date_added: '2023-01-01T00:00:00Z',
      date_modified: '2023-01-01T00:00:00Z',
      unread: false,
      shared: false,
      reading_mode: 'readability',
    };

    // Mock database service
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue(undefined);
    
    // Mock content fetcher
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue([
      { type: 'url', label: 'Live URL' }
    ]);
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      content: '<p>Test content</p>',
      readability_content: '<p>Readable content</p>',
      source: 'url'
    });

    // Mock theme service
    vi.mocked(ThemeService.getCurrentTheme).mockReturnValue('light');
    vi.mocked(ThemeService.addThemeChangeListener).mockImplementation(() => {});
    vi.mocked(ThemeService.removeThemeChangeListener).mockImplementation(() => {});

    // Create component instance
    element = new BookmarkReader();
    element.bookmarkId = 1;
    
    // Add to DOM
    document.body.appendChild(element);
    
    // Wait for component to initialize
    await element.updateComplete;
    // Additional wait for async loading
    await new Promise(resolve => setTimeout(resolve, 0));
  });

  afterEach(() => {
    // Clean up DOM
    if (element.parentNode) {
      element.parentNode.removeChild(element);
    }
  });

  it('should show info button in readability mode', async () => {
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]');
    expect(infoButton).toBeTruthy();
    
    const infoIcon = infoButton?.querySelector('md-icon');
    expect(infoIcon?.textContent?.trim()).toBe('info');
  });

  it('should show info button in original mode', async () => {
    // Switch to original mode
    const processButton = element.shadowRoot!.querySelector('.processing-mode-button') as HTMLElement;
    processButton.click();
    await element.updateComplete;
    
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]');
    expect(infoButton).toBeTruthy();
    
    const infoIcon = infoButton?.querySelector('md-icon');
    expect(infoIcon?.textContent?.trim()).toBe('info');
  });

  it('should show both dark mode toggle and info button in readability mode', async () => {
    // Should show dark mode toggle
    const darkModeButton = element.shadowRoot!.querySelector('md-icon-button[title*="Theme"], md-icon-button[title*="Dark Mode"], md-icon-button[title*="Light Mode"]');
    expect(darkModeButton).toBeTruthy();
    
    // Should also show info button
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]');
    expect(infoButton).toBeTruthy();
  });

  it('should open info modal when info button is clicked', async () => {
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]') as HTMLElement;
    expect(infoButton).toBeTruthy();
    
    infoButton.click();
    await element.updateComplete;
    
    const dialog = element.shadowRoot!.querySelector('md-dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
  });

  it('should display bookmark information in modal', async () => {
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]') as HTMLElement;
    infoButton.click();
    await element.updateComplete;
    
    const modalContent = element.shadowRoot!.querySelector('.info-modal-body');
    expect(modalContent).toBeTruthy();
    
    // Verify content is present (basic check since exact selectors may vary)
    expect(modalContent!.textContent).toContain(mockBookmark.title);
    expect(modalContent!.textContent).toContain(mockBookmark.url);
    expect(modalContent!.textContent).toContain(mockBookmark.description);
    expect(modalContent!.textContent).toContain('tech, programming');
  });

  it('should close modal when close button is clicked', async () => {
    // Open modal
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]') as HTMLElement;
    infoButton.click();
    await element.updateComplete;
    
    // Verify modal is open
    let dialog = element.shadowRoot!.querySelector('md-dialog');
    expect(dialog?.hasAttribute('open')).toBe(true);
    
    // Click close button
    const closeButton = element.shadowRoot!.querySelector('.info-modal-actions md-text-button') as HTMLElement;
    expect(closeButton).toBeTruthy();
    closeButton.click();
    await element.updateComplete;
    
    // Verify modal is closed
    dialog = element.shadowRoot!.querySelector('md-dialog');
    expect(dialog?.hasAttribute('open')).toBe(false);
  });

  it('should handle bookmark with no description or tags', async () => {
    const bookmarkWithoutOptionals: LocalBookmark = {
      ...mockBookmark,
      description: '',
      tag_names: []
    };
    
    // Create new element with updated mock
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(bookmarkWithoutOptionals);
    
    const newElement = new BookmarkReader();
    newElement.bookmarkId = 1;
    document.body.appendChild(newElement);
    await newElement.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 0));
    
    const infoButton = newElement.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]') as HTMLElement;
    infoButton.click();
    await newElement.updateComplete;
    
    const modalContent = newElement.shadowRoot!.querySelector('.info-modal-body');
    expect(modalContent).toBeTruthy();
    
    // Should still display title and URL
    expect(modalContent!.textContent).toContain(bookmarkWithoutOptionals.title);
    expect(modalContent!.textContent).toContain(bookmarkWithoutOptionals.url);
    
    // Should not display empty description or tags sections (conditional rendering)
    expect(modalContent!.textContent).not.toContain('Description');
    expect(modalContent!.textContent).not.toContain('Tags');
    
    // Clean up
    newElement.parentNode?.removeChild(newElement);
  });

  it('should handle modal when bookmark is null', async () => {
    // Create new element with null bookmark mock
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);
    
    const newElement = new BookmarkReader();
    newElement.bookmarkId = 1;
    document.body.appendChild(newElement);
    await newElement.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Component should show error state, not crash
    const errorMessage = newElement.shadowRoot!.querySelector('.error-message');
    expect(errorMessage).toBeTruthy();
    expect(errorMessage!.textContent).toContain('Bookmark not found');
    
    // Clean up
    newElement.parentNode?.removeChild(newElement);
  });

  it('should format date correctly in modal', async () => {
    const infoButton = element.shadowRoot!.querySelector('md-icon-button[title="Show bookmark info"]') as HTMLElement;
    infoButton.click();
    await element.updateComplete;
    
    const modalContent = element.shadowRoot!.querySelector('.info-modal-body');
    expect(modalContent).toBeTruthy();
    
    // Should format date as "January 1, 2023"
    expect(modalContent!.textContent).toContain('January 1, 2023');
  });
});