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
      flex-wrap: wrap;
    }

    .pagination-info {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      color: var(--md-sys-color-on-surface);
      font-size: 0.875rem;
    }

    .page-input {
      width: 60px;
    }

    .page-numbers {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      flex-wrap: wrap;
    }

    .page-button {
      min-width: 40px;
      height: 40px;
    }

    .nav-buttons {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }

    .ellipsis {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 40px;
      height: 40px;
      color: var(--md-sys-color-on-surface-variant);
    }

    @media (max-width: 768px) {
      :host {
        padding: 0.5rem;
        gap: 0.25rem;
      }

      .page-button {
        min-width: 32px;
        height: 32px;
      }

      .ellipsis {
        min-width: 32px;
        height: 32px;
      }

      .page-input {
        width: 50px;
      }

      .pagination-info {
        font-size: 0.75rem;
      }
    }
  `;

  private generatePageNumbers(): number[] {
    const pages: number[] = [];
    const totalPages = Math.max(1, this.totalPages);
    const current = Math.min(Math.max(1, this.currentPage), totalPages);

    // On mobile, show fewer page numbers to prevent overflow
    const isMobile = window.innerWidth <= 768;
    const maxPages = isMobile ? 5 : 7;

    if (totalPages <= maxPages) {
      // Show all pages if within limit
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      // Always show first page
      pages.push(1);

      if (isMobile) {
        // Mobile: show minimal pages
        if (current <= 3) {
          // Near the beginning
          pages.push(2);
          pages.push(3);
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        } else if (current >= totalPages - 2) {
          // Near the end
          pages.push(-1); // Ellipsis
          pages.push(totalPages - 2);
          pages.push(totalPages - 1);
          pages.push(totalPages);
        } else {
          // In the middle
          pages.push(-1); // Ellipsis
          pages.push(current);
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        }
      } else {
        // Desktop: show more pages
        if (current <= 4) {
          // Near the beginning
          for (let i = 2; i <= 5; i++) {
            pages.push(i);
          }
          pages.push(-1); // Ellipsis
          pages.push(totalPages);
        } else if (current >= totalPages - 3) {
          // Near the end
          pages.push(-1); // Ellipsis
          for (let i = totalPages - 4; i <= totalPages; i++) {
            pages.push(i);
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

      ${window.innerWidth > 768 ? html`
        <div class="pagination-info">
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
        </div>
      ` : html`
        <div class="pagination-info">
          <span>${this.currentPage} of ${this.totalPages}</span>
        </div>
      `}
    `;
  }
}