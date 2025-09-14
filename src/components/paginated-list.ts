import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@material/web/progress/linear-progress.js';
import '@material/web/icon/icon.js';
import './pagination-controls.js';

/**
 * PaginatedListProps interface defines the properties for the generic paginated list component
 */
export interface PaginatedListProps {
  totalCount: number;      // Total items available
  currentPage: number;     // Current page (1-based)
  pageSize: number;        // Items per page
  loading?: boolean;       // Loading state
  onPageChange: (page: number) => void;  // Page change callback
}

/**
 * Generic pagination wrapper component that is completely data-agnostic.
 * Uses slot-based content rendering for maximum flexibility and integrates
 * with the existing pagination-controls component.
 */
@customElement('paginated-list')
export class PaginatedList extends LitElement {
  @property({ type: Number }) totalCount = 0;
  @property({ type: Number }) currentPage = 1;
  @property({ type: Number }) pageSize = 25;
  @property({ type: Boolean }) loading = false;
  @property({ type: Function }) onPageChange: (page: number) => void = () => {};

  static override styles = css`
    :host {
      display: block;
      width: 100%;
    }

    .container {
      display: flex;
      flex-direction: column;
      min-height: 100%;
    }

    .loading-indicator {
      padding: 1rem;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .content-area {
      flex: 1;
      min-height: 0;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 3rem 1rem;
      text-align: center;
      color: var(--md-sys-color-on-surface-variant);
      gap: 1rem;
    }

    .empty-state md-icon {
      font-size: 3rem;
      opacity: 0.6;
    }

    .empty-state-title {
      font-size: 1.25rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
    }

    .empty-state-message {
      font-size: 0.875rem;
      line-height: 1.4;
      max-width: 400px;
    }

    .pagination-container {
      flex-shrink: 0;
      border-top: 1px solid var(--md-sys-color-outline-variant);
      background-color: var(--md-sys-color-surface);
    }

    /* Hide pagination when there's no content or only one page */
    .pagination-container.hidden {
      display: none;
    }

    /* Loading overlay when content exists but is refreshing */
    .content-loading {
      position: relative;
    }

    .content-loading::after {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: var(--md-sys-color-surface-container);
      opacity: 0.5;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    @media (max-width: 768px) {
      .empty-state {
        padding: 2rem 1rem;
      }

      .empty-state md-icon {
        font-size: 2.5rem;
      }

      .empty-state-title {
        font-size: 1.125rem;
      }

      .empty-state-message {
        font-size: 0.8125rem;
      }
    }
  `;

  /**
   * Calculate total pages based on totalCount and pageSize
   */
  get #totalPages(): number {
    return Math.max(1, Math.ceil(this.totalCount / this.pageSize));
  }

  /**
   * Check if there's any content to display (non-zero totalCount)
   */
  get #hasContent(): boolean {
    return this.totalCount > 0;
  }

  /**
   * Check if pagination controls should be shown
   */
  get #showPagination(): boolean {
    return this.#hasContent && this.#totalPages > 1;
  }

  /**
   * Handle page change from pagination controls
   */
  #handlePageChange = (page: number) => {
    if (page !== this.currentPage && page >= 1 && page <= this.#totalPages) {
      this.onPageChange(page);
    }
  };

  /**
   * Render the empty state when no content is available
   */
  #renderEmptyState() {
    return html`
      <div class="empty-state">
        <md-icon>inbox</md-icon>
        <div class="empty-state-title">No items found</div>
        <div class="empty-state-message">
          There are no items to display at this time.
        </div>
      </div>
    `;
  }

  /**
   * Render the loading indicator for initial load
   */
  #renderLoadingState() {
    return html`
      <div class="loading-indicator">
        <md-linear-progress indeterminate></md-linear-progress>
      </div>
    `;
  }

  /**
   * Render the content area with slotted content
   */
  #renderContentArea() {
    // If loading and no content yet, show loading state
    if (this.loading && !this.#hasContent) {
      return this.#renderLoadingState();
    }

    // If no content (and not loading), show empty state
    if (!this.#hasContent) {
      return this.#renderEmptyState();
    }

    // Show content with optional loading overlay
    return html`
      <div class="content-area ${this.loading ? 'content-loading' : ''}">
        <slot></slot>
      </div>
    `;
  }

  /**
   * Render the pagination controls if needed
   */
  #renderPagination() {
    if (!this.#showPagination) {
      return html`<div class="pagination-container hidden"></div>`;
    }

    return html`
      <div class="pagination-container">
        <pagination-controls
          .currentPage=${this.currentPage}
          .totalPages=${this.#totalPages}
          .disabled=${this.loading}
          .onPageChange=${this.#handlePageChange}
        ></pagination-controls>
      </div>
    `;
  }

  override render() {
    return html`
      <div class="container">
        ${this.#renderContentArea()}
        ${this.#renderPagination()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'paginated-list': PaginatedList;
  }
}