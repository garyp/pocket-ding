import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BookmarkReader } from '../../components/bookmark-reader';
import type { LocalBookmark, ContentSourceOption } from '../../types';
import { DatabaseService } from '../../services/database';
import { ContentFetcher } from '../../services/content-fetcher';

// Mock services
vi.mock('../../services/database');
vi.mock('../../services/content-fetcher');
vi.mock('../../services/theme-service', () => ({
  ThemeService: {
    addThemeChangeListener: vi.fn(),
    removeThemeChangeListener: vi.fn(),
  }
}));

describe('BookmarkReader - Info Modal', () => {
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
      description: 'Test description for the bookmark',
      notes: '',
      website_title: 'Example Site',
      website_description: '',
      web_archive_snapshot_url: '',
      favicon_url: '',
      preview_image_url: '',
      is_archived: false,
      unread: true,
      shared: false,
      tag_names: ['tech', 'programming'],
      date_added: '2024-01-01T00:00:00Z',
      date_modified: '2024-01-01T00:00:00Z',
    };

    // Mock content sources with asset to ensure we're in original mode
    const contentSources: ContentSourceOption[] = [
      {
        type: 'asset',
        label: 'HTML snapshot from 08/05/2025',
        assetId: 1
      },
      {
        type: 'url',
        label: 'Live URL'
      }
    ];

    // Mock service responses
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.saveReadProgress).mockResolvedValue();
    vi.mocked(DatabaseService.saveBookmark).mockResolvedValue();
    vi.mocked(ContentFetcher.getAvailableContentSources).mockResolvedValue(contentSources);
    vi.mocked(ContentFetcher.fetchBookmarkContent).mockResolvedValue({
      source: 'asset',
      content_type: 'html',
      html_content: '<div>Test content</div>',
      readability_content: '<div>Readable content</div>'
    });

    // Create element
    element = new BookmarkReader();
    document.body.appendChild(element);
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
  });

  it('should show info button only in original (non-readability) mode', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Set to original mode
    element['readingMode'] = 'original';
    await element.updateComplete;

    // Find info button
    const infoButton = Array.from(element.shadowRoot?.querySelectorAll('md-icon-button') || [])
      .find((btn) => {
        const icon = btn.querySelector('md-icon');
        return icon?.textContent?.trim() === 'info';
      });

    expect(infoButton).toBeTruthy();

    // Set to readability mode
    element['readingMode'] = 'readability';
    await element.updateComplete;

    // Info button should not be present
    const infoButtonAfter = Array.from(element.shadowRoot?.querySelectorAll('md-icon-button') || [])
      .find((btn) => {
        const icon = btn.querySelector('md-icon');
        return icon?.textContent?.trim() === 'info';
      });

    expect(infoButtonAfter).toBeFalsy();
  });

  it('should open info modal when info button is clicked', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Set to original mode to show info button
    element['readingMode'] = 'original';
    await element.updateComplete;

    // Modal should not be open initially
    expect(element['showInfoModal']).toBe(false);

    // Find and click info button
    const infoButton = Array.from(element.shadowRoot?.querySelectorAll('md-icon-button') || [])
      .find((btn) => {
        const icon = btn.querySelector('md-icon');
        return icon?.textContent?.trim() === 'info';
      }) as HTMLElement;

    expect(infoButton).toBeTruthy();
    infoButton.click();
    await element.updateComplete;

    // Modal should now be open
    expect(element['showInfoModal']).toBe(true);

    // Dialog should be present in DOM and open
    const dialog = element.shadowRoot?.querySelector('md-dialog') as any;
    expect(dialog).toBeTruthy();
    expect(dialog.open).toBe(true);
  });

  it('should display bookmark information in the modal', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Set to original mode and open modal
    element['readingMode'] = 'original';
    element['showInfoModal'] = true;
    await element.updateComplete;

    // Find the content slot within the dialog
    const dialog = element.shadowRoot?.querySelector('md-dialog');
    const contentSlot = dialog?.querySelector('div[slot="content"]');
    const modalBody = contentSlot?.querySelector('.info-modal-body');
    expect(modalBody).toBeTruthy();

    // Check title field
    const titleField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Title');
    expect(titleField).toBeTruthy();
    expect(titleField?.querySelector('.info-value')?.textContent?.trim()).toBe('Test Article');

    // Check URL field
    const urlField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'URL');
    expect(urlField).toBeTruthy();
    const urlLink = urlField?.querySelector('.info-url') as HTMLAnchorElement;
    expect(urlLink?.href).toBe('https://example.com/article');
    expect(urlLink?.textContent?.trim()).toBe('https://example.com/article');

    // Check date field
    const dateField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Date Added');
    expect(dateField).toBeTruthy();
    expect(dateField?.querySelector('.info-value')?.textContent?.trim()).toBe('January 1, 2024');

    // Check description field
    const descriptionField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Description');
    expect(descriptionField).toBeTruthy();
    expect(descriptionField?.querySelector('.info-value')?.textContent?.trim()).toBe('Test description for the bookmark');

    // Check tags field
    const tagsField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Tags');
    expect(tagsField).toBeTruthy();
    expect(tagsField?.querySelector('.info-value')?.textContent?.trim()).toBe('tech, programming');
  });

  it('should handle bookmark without description and tags', async () => {
    // Update mock to not have description and tags
    const mockBookmarkMinimal: LocalBookmark = {
      ...mockBookmark,
      description: '',
      tag_names: []
    };
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmarkMinimal);

    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Set to original mode and open modal
    element['readingMode'] = 'original';
    element['showInfoModal'] = true;
    await element.updateComplete;

    // Find the content slot within the dialog
    const dialog = element.shadowRoot?.querySelector('md-dialog');
    const contentSlot = dialog?.querySelector('div[slot="content"]');
    const modalBody = contentSlot?.querySelector('.info-modal-body');
    expect(modalBody).toBeTruthy();

    // Description field should not be present
    const descriptionField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Description');
    expect(descriptionField).toBeFalsy();

    // Tags field should not be present
    const tagsField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Tags');
    expect(tagsField).toBeFalsy();
  });

  it('should close modal when close button is clicked', async () => {
    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Set to original mode and open modal
    element['readingMode'] = 'original';
    element['showInfoModal'] = true;
    await element.updateComplete;

    // Find and click close button in the actions slot
    const dialog = element.shadowRoot?.querySelector('md-dialog');
    const actionsSlot = dialog?.querySelector('div[slot="actions"]');
    const closeButton = actionsSlot?.querySelector('md-text-button') as HTMLElement;
    expect(closeButton).toBeTruthy();
    expect(closeButton.textContent?.trim()).toBe('Close');
    
    closeButton.click();
    await element.updateComplete;

    // Modal should now be closed
    expect(element['showInfoModal']).toBe(false);

    const dialogElement = element.shadowRoot?.querySelector('md-dialog') as any;
    expect(dialogElement.open).toBe(false);
  });

  it('should show loading state when bookmark is null', async () => {
    // Mock getBookmark to return null
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(undefined);

    element.bookmarkId = 1;
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 50));

    // Even with null bookmark, modal should render with loading state
    element['showInfoModal'] = true;
    await element.updateComplete;

    // Find the content slot within the dialog
    const dialog = element.shadowRoot?.querySelector('md-dialog');
    const contentSlot = dialog?.querySelector('div[slot="content"]');
    const modalBody = contentSlot?.querySelector('.info-modal-body');
    expect(modalBody).toBeTruthy();

    // Should show loading state when bookmark is null
    const loadingContainer = modalBody?.querySelector('.loading-container');
    expect(loadingContainer).toBeTruthy();
    
    const spinner = loadingContainer?.querySelector('md-circular-progress');
    expect(spinner).toBeTruthy();
    
    const loadingText = loadingContainer?.querySelector('p');
    expect(loadingText?.textContent?.trim()).toBe('Loading bookmark information...');

    // Should have no info fields when bookmark is null
    const infoFields = modalBody?.querySelectorAll('.info-field');
    expect(infoFields?.length).toBe(0);
  });

  it('should show content when bookmark loads after modal opens', async () => {
    // Start with loading state - mock reactive queries to be loading initially
    vi.mocked(DatabaseService.getBookmark).mockResolvedValue(mockBookmark);
    vi.mocked(DatabaseService.getReadProgress).mockResolvedValue(undefined);
    vi.mocked(DatabaseService.getCompletedAssetsByBookmarkId).mockResolvedValue([]);

    element.bookmarkId = 1;
    // Wait for reactive queries to complete
    await element.updateComplete;
    await new Promise(resolve => setTimeout(resolve, 100));

    // Open modal after bookmark is loaded
    element['showInfoModal'] = true;
    await element.updateComplete;

    // Modal should show bookmark content
    const dialog = element.shadowRoot?.querySelector('md-dialog');
    const contentSlot = dialog?.querySelector('div[slot="content"]');
    const modalBody = contentSlot?.querySelector('.info-modal-body');
    
    const titleField = Array.from(modalBody?.querySelectorAll('.info-field') || [])
      .find(field => field.querySelector('.info-label')?.textContent?.trim() === 'Title');
    expect(titleField).toBeTruthy();
    expect(titleField?.querySelector('.info-value')?.textContent?.trim()).toBe('Test Article');

    // Should not have loading container when bookmark is loaded
    expect(modalBody?.querySelector('.loading-container')).toBeFalsy();
  });
});