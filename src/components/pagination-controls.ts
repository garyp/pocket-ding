import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/icon/icon.js';
import '@material/web/textfield/outlined-text-field.js';

@customElement('pagination-controls')
export class PaginationControls extends LitElement {
  @property({ type: Number }) currentPage = 1;
  @property({ type: Number }) totalPages = 1;
  @property({ type: Boolean }) disabled = false;
  @property({ type: Function }) onPageChange: (page: number) => void = () => {};

  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      padding: 1rem;
      flex-wrap: nowrap;
      overflow-x: auto;
      min-height: 56px;
    }

    .pagination-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--md-sys-color-on-surface);
      font-size: 0.875rem;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .page-input {
      width: 60px;
      flex-shrink: 0;
    }

    .page-numbers {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-wrap: nowrap;
      flex-shrink: 1;
      min-width: 0;
    }

    .page-button {
      min-width: 40px;
      height: 40px;
      flex-shrink: 0;
    }

    .nav-buttons {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-shrink: 0;
    }

    .ellipsis {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      height: 40px;
      color: var(--md-sys-color-on-surface-variant);
      flex-shrink: 0;
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.5rem;
        gap: 0.25rem;
        min-height: 48px;
      }

      .page-button {
        min-width: 28px;
        height: 28px;
        font-size: 0.75rem;
      }

      .ellipsis {
        min-width: 28px;
        height: 28px;
        font-size: 0.75rem;
      }

      .pagination-info {
        font-size: 0.75rem;
      }

      .page-input {
        width: 40px;
      }
    }

    @media (max-width: 480px) {
      :host {
        gap: 0.125rem;
        padding: 0.25rem;
      }
      
      .page-button {
        min-width: 24px;
        height: 24px;
        font-size: 0.7rem;
      }

      .ellipsis {
        min-width: 24px;
        height: 24px;
      }

      .page-input {
        width: 36px;
      }
    }
  `;

  private generatePageNumbers(): number[] {
    const pages: number[] = [];
    const totalPages = Math.max(1, this.totalPages);
    const current = Math.min(Math.max(1, this.currentPage), totalPages);
    
    // Responsive page number limits based on viewport
    const width = window.innerWidth;
    let maxVisiblePages: number;
    
    if (width <= 480) {
      maxVisiblePages = 3; // Very narrow screens: show only 3 pages max
    } else if (width <= 768) {
      maxVisiblePages = 4; // Mobile: show 4 pages max  
    } else {
      maxVisiblePages = 7; // Desktop: show up to 7 pages
    }

    if (totalPages <= maxVisiblePages) {
      // Show all pages if within limit
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (width <= 480) {
        // Very narrow screens: minimal pagination
        if (totalPages <= 3) {
          for (let i = 2; i <= totalPages; i++) {
            pages.push(i);
          }
        } else {
          // Just show current or last page with ellipsis
          if (current !== 1 && current !== totalPages) {
            pages.push(-1); // Ellipsis
          }
          if (current !== 1 && current !== totalPages) {
            pages.push(current);
          }
          if (totalPages > 1) {
            pages.push(-1); // Ellipsis
            pages.push(totalPages);
          }
        }
      } else if (width <= 768) {
        // Mobile layout: show fewer pages
        if (current <= 2) {
          // Near the beginning
          if (totalPages > 2) pages.push(2);
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        } else if (current >= totalPages - 1) {
          // Near the end
          pages.push(-1); // Ellipsis
          if (totalPages > 2) pages.push(totalPages - 1);
          if (totalPages > 1) pages.push(totalPages);
        } else {
          // In the middle
          pages.push(-1); // Ellipsis
          pages.push(current);
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        }
      } else {
        // Desktop layout: show more pages
        if (current <= 4) {
          // Near the beginning
          for (let i = 2; i <= Math.min(5, totalPages - 1); i++) {
            pages.push(i);
          }
          if (totalPages > 5) pages.push(-1); // Ellipsis
          pages.push(totalPages);
        } else if (current >= totalPages - 3) {
          // Near the end
          pages.push(-1); // Ellipsis
          for (let i = Math.max(2, totalPages - 4); i <= totalPages; i++) {
            if (i !== 1) pages.push(i);
          }
        } else {
          // In the middle
          pages.push(-1); // Ellipsis
          for (let i = current - 1; i <= current + 1; i++) {
            pages.push(i);
          }
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        }
      }
    }

    return pages;
  }

  private handlePageClick(page: number) {
    if (page !== this.currentPage && page >= 1 && page <= this.totalPages && !this.disabled) {
      this.onPageChange(page);
    }
  }

  private handlePrevious() {
    if (this.currentPage > 1 && !this.disabled) {
      this.onPageChange(this.currentPage - 1);
    }
  }

  private handleNext() {
    if (this.currentPage < this.totalPages && !this.disabled) {
      this.onPageChange(this.currentPage + 1);
    }
  }

  private handlePageInputKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      const input = event.target as HTMLInputElement;
      const page = parseInt(input.value);
      if (!isNaN(page) && page >= 1 && page <= this.totalPages) {
        this.handlePageClick(page);
      }
      input.value = this.currentPage.toString();
    }
  }

  override render() {
    if (this.totalPages <= 1) {
      return html``;
    }

    const pageNumbers = this.generatePageNumbers();
    const canGoPrevious = this.currentPage > 1 && !this.disabled;
    const canGoNext = this.currentPage < this.totalPages && !this.disabled;

    return html`
      <div class="nav-buttons">
        <md-text-button
          class="page-button"
          ?disabled=${!canGoPrevious}
          @click=${this.handlePrevious}
          title="Previous page"
        >
          <md-icon slot="icon">chevron_left</md-icon>
        </md-text-button>
      </div>

      <div class="page-numbers">
        ${pageNumbers.map(page => {
          if (page === -1) {
            return html`<span class="ellipsis">…</span>`;
          }
          
          const isCurrent = page === this.currentPage;
          return isCurrent ? html`
            <md-filled-button
              class="page-button"
              ?disabled=${this.disabled}
            >
              ${page}
            </md-filled-button>
          ` : html`
            <md-text-button
              class="page-button"
              ?disabled=${this.disabled}
              @click=${() => this.handlePageClick(page)}
            >
              ${page}
            </md-text-button>
          `;
        })}
      </div>

      <div class="nav-buttons">
        <md-text-button
          class="page-button"
          ?disabled=${!canGoNext}
          @click=${this.handleNext}
          title="Next page"
        >
          <md-icon slot="icon">chevron_right</md-icon>
        </md-text-button>
      </div>

      <div class="pagination-info">
        ${window.innerWidth <= 768 ? html`
          <span>${this.currentPage} of ${this.totalPages}</span>
        ` : html`
          <span>Page</span>
          <md-outlined-text-field
            class="page-input"
            type="number"
            .value=${this.currentPage.toString()}
            min="1"
            max=${this.totalPages.toString()}
            ?disabled=${this.disabled}
            @keydown=${this.handlePageInputKeydown}
          ></md-outlined-text-field>
          <span>of ${this.totalPages}</span>
        `}
      </div>
    `;
  }
}