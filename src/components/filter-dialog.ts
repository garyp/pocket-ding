import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { FilterState } from '../types';
import { FilterService } from '../services/filter-service';
import '@material/web/dialog/dialog.js';
import '@material/web/button/text-button.js';
import '@material/web/button/filled-button.js';
import '@material/web/chips/chip-set.js';
import '@material/web/chips/filter-chip.js';
import '@material/web/radio/radio.js';
import '@material/web/textfield/outlined-text-field.js';
import '@material/web/icon/icon.js';

@customElement('filter-dialog')
export class FilterDialog extends LitElement {
  @property({ type: Boolean }) open = false;
  @property({ type: Object }) filters!: FilterState;

  // Available tags from database (private state - no decorators on # fields)
  #availableTags: string[] = [];

  // Temporary filter state (modified in dialog, applied on confirm)
  #tempFilters!: FilterState;

  static override styles = css`
    :host {
      display: contents;
    }

    .filter-section {
      margin-bottom: 1.5rem;
    }

    .filter-section:last-of-type {
      margin-bottom: 0;
    }

    .section-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: var(--md-sys-color-on-surface);
      margin-bottom: 0.75rem;
      letter-spacing: 0.0625rem;
      text-transform: uppercase;
    }

    .tag-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .radio-group {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.5rem;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: background-color 0.2s;
    }

    .radio-option:hover {
      background-color: var(--md-sys-color-surface-container);
    }

    .radio-option label {
      flex: 1;
      cursor: pointer;
      font-size: 0.875rem;
      color: var(--md-sys-color-on-surface);
    }

    .date-presets {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 0.5rem;
      margin-bottom: 1rem;
    }

    .date-preset-btn {
      padding: 0.75rem;
      border: 1px solid var(--md-sys-color-outline);
      border-radius: 0.5rem;
      background: var(--md-sys-color-surface);
      color: var(--md-sys-color-on-surface);
      cursor: pointer;
      font-size: 0.875rem;
      transition: all 0.2s;
      text-align: center;
    }

    .date-preset-btn:hover {
      background: var(--md-sys-color-surface-container);
      border-color: var(--md-sys-color-primary);
    }

    .date-preset-btn.active {
      background: var(--md-sys-color-primary-container);
      border-color: var(--md-sys-color-primary);
      color: var(--md-sys-color-on-primary-container);
      font-weight: 500;
    }

    .custom-date-range {
      display: flex;
      gap: 0.75rem;
      margin-top: 0.75rem;
    }

    .custom-date-range md-outlined-text-field {
      flex: 1;
    }

    .dialog-actions {
      display: flex;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .no-tags-message {
      color: var(--md-sys-color-on-surface-variant);
      font-size: 0.875rem;
      font-style: italic;
      padding: 0.5rem;
    }

    @media (max-width: 48rem) {
      .date-presets {
        grid-template-columns: 1fr;
      }

      .custom-date-range {
        flex-direction: column;
      }
    }
  `;

  override connectedCallback() {
    super.connectedCallback();
    this.#loadAvailableTags();
    this.#initializeTempFilters();
  }

  override willUpdate(changedProperties: Map<string, any>) {
    if (changedProperties.has('filters') && this.filters) {
      this.#initializeTempFilters();
    }
    if (changedProperties.has('open') && this.open) {
      this.#loadAvailableTags();
    }
  }

  async #loadAvailableTags() {
    try {
      this.#availableTags = await FilterService.getAllTags();
      this.requestUpdate();
    } catch (error) {
      // Gracefully handle database errors (e.g., in test environments)
      this.#availableTags = [];
      this.requestUpdate();
    }
  }

  #initializeTempFilters() {
    if (this.filters) {
      // Deep copy the filters to avoid mutating the original
      this.#tempFilters = {
        ...this.filters,
        dateFilter: { ...this.filters.dateFilter }
      };
    } else {
      this.#tempFilters = FilterService.getDefaultFilterState();
    }
    this.requestUpdate();
  }

  #handleTagToggle(tag: string, selected: boolean) {
    if (selected) {
      if (!this.#tempFilters.tags.includes(tag)) {
        this.#tempFilters = {
          ...this.#tempFilters,
          tags: [...this.#tempFilters.tags, tag]
        };
      }
    } else {
      this.#tempFilters = {
        ...this.#tempFilters,
        tags: this.#tempFilters.tags.filter(t => t !== tag)
      };
    }
    this.requestUpdate();
  }

  #handleReadStatusChange(status: FilterState['readStatus']) {
    this.#tempFilters = {
      ...this.#tempFilters,
      readStatus: status
    };
    this.requestUpdate();
  }

  #handleArchivedStatusChange(status: FilterState['archivedStatus']) {
    this.#tempFilters = {
      ...this.#tempFilters,
      archivedStatus: status
    };
    this.requestUpdate();
  }

  #handleHasAssetsStatusChange(status: FilterState['hasAssetsStatus']) {
    this.#tempFilters = {
      ...this.#tempFilters,
      hasAssetsStatus: status
    };
    this.requestUpdate();
  }

  #handleDatePresetClick(preset: 'today' | 'last7days' | 'last30days' | 'thisyear') {
    this.#tempFilters = {
      ...this.#tempFilters,
      dateFilter: {
        type: 'preset',
        preset
      }
    };
    this.requestUpdate();
  }

  #handleDateAllClick() {
    this.#tempFilters = {
      ...this.#tempFilters,
      dateFilter: {
        type: 'all'
      }
    };
    this.requestUpdate();
  }

  #handleCustomDateChange(field: 'customFrom' | 'customTo', value: string) {
    const newDateFilter = {
      ...this.#tempFilters.dateFilter,
      type: 'custom' as const,
      [field]: value
    };

    this.#tempFilters = {
      ...this.#tempFilters,
      dateFilter: newDateFilter
    };
    this.requestUpdate();
  }

  #handleClearAll() {
    this.#tempFilters = FilterService.getDefaultFilterState();
    this.requestUpdate();
  }

  #handleApply() {
    this.dispatchEvent(new CustomEvent('apply-filters', {
      detail: this.#tempFilters,
      bubbles: true,
      composed: true
    }));
    this.#handleClose();
  }

  #handleClose() {
    this.dispatchEvent(new CustomEvent('close', {
      bubbles: true,
      composed: true
    }));
  }

  #renderTagsSection() {
    return html`
      <div class="filter-section">
        <div class="section-title">Tags</div>
        ${this.#availableTags.length === 0 ? html`
          <div class="no-tags-message">No tags available</div>
        ` : html`
          <md-chip-set>
            <div class="tag-chips">
              ${this.#availableTags.map(tag => html`
                <md-filter-chip
                  label="${tag}"
                  ?selected="${this.#tempFilters.tags.includes(tag)}"
                  @click="${(e: Event) => {
                    const chip = e.target as any;
                    this.#handleTagToggle(tag, chip.selected);
                  }}"
                ></md-filter-chip>
              `)}
            </div>
          </md-chip-set>
        `}
      </div>
    `;
  }

  #renderStatusSection() {
    return html`
      <div class="filter-section">
        <div class="section-title">Read Status</div>
        <div class="radio-group">
          <div class="radio-option" @click="${() => this.#handleReadStatusChange('all')}">
            <md-radio
              name="read-status"
              value="all"
              ?checked="${this.#tempFilters.readStatus === 'all'}"
              @change="${() => this.#handleReadStatusChange('all')}"
            ></md-radio>
            <label>All</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleReadStatusChange('unread')}">
            <md-radio
              name="read-status"
              value="unread"
              ?checked="${this.#tempFilters.readStatus === 'unread'}"
              @change="${() => this.#handleReadStatusChange('unread')}"
            ></md-radio>
            <label>Unread only</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleReadStatusChange('read')}">
            <md-radio
              name="read-status"
              value="read"
              ?checked="${this.#tempFilters.readStatus === 'read'}"
              @change="${() => this.#handleReadStatusChange('read')}"
            ></md-radio>
            <label>Read only</label>
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="section-title">Archived Status</div>
        <div class="radio-group">
          <div class="radio-option" @click="${() => this.#handleArchivedStatusChange('all')}">
            <md-radio
              name="archived-status"
              value="all"
              ?checked="${this.#tempFilters.archivedStatus === 'all'}"
              @change="${() => this.#handleArchivedStatusChange('all')}"
            ></md-radio>
            <label>All</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleArchivedStatusChange('unarchived')}">
            <md-radio
              name="archived-status"
              value="unarchived"
              ?checked="${this.#tempFilters.archivedStatus === 'unarchived'}"
              @change="${() => this.#handleArchivedStatusChange('unarchived')}"
            ></md-radio>
            <label>Active only</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleArchivedStatusChange('archived')}">
            <md-radio
              name="archived-status"
              value="archived"
              ?checked="${this.#tempFilters.archivedStatus === 'archived'}"
              @change="${() => this.#handleArchivedStatusChange('archived')}"
            ></md-radio>
            <label>Archived only</label>
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="section-title">Offline Content</div>
        <div class="radio-group">
          <div class="radio-option" @click="${() => this.#handleHasAssetsStatusChange('all')}">
            <md-radio
              name="assets-status"
              value="all"
              ?checked="${this.#tempFilters.hasAssetsStatus === 'all'}"
              @change="${() => this.#handleHasAssetsStatusChange('all')}"
            ></md-radio>
            <label>All</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleHasAssetsStatusChange('has-assets')}">
            <md-radio
              name="assets-status"
              value="has-assets"
              ?checked="${this.#tempFilters.hasAssetsStatus === 'has-assets'}"
              @change="${() => this.#handleHasAssetsStatusChange('has-assets')}"
            ></md-radio>
            <label>With offline content</label>
          </div>
          <div class="radio-option" @click="${() => this.#handleHasAssetsStatusChange('no-assets')}">
            <md-radio
              name="assets-status"
              value="no-assets"
              ?checked="${this.#tempFilters.hasAssetsStatus === 'no-assets'}"
              @change="${() => this.#handleHasAssetsStatusChange('no-assets')}"
            ></md-radio>
            <label>Without offline content</label>
          </div>
        </div>
      </div>
    `;
  }

  #renderDateSection() {
    const { dateFilter } = this.#tempFilters;

    return html`
      <div class="filter-section">
        <div class="section-title">Date Added</div>
        <div class="date-presets">
          <button
            class="date-preset-btn ${dateFilter.type === 'all' ? 'active' : ''}"
            @click="${this.#handleDateAllClick}"
          >
            All time
          </button>
          <button
            class="date-preset-btn ${dateFilter.type === 'preset' && dateFilter.preset === 'today' ? 'active' : ''}"
            @click="${() => this.#handleDatePresetClick('today')}"
          >
            Today
          </button>
          <button
            class="date-preset-btn ${dateFilter.type === 'preset' && dateFilter.preset === 'last7days' ? 'active' : ''}"
            @click="${() => this.#handleDatePresetClick('last7days')}"
          >
            Last 7 days
          </button>
          <button
            class="date-preset-btn ${dateFilter.type === 'preset' && dateFilter.preset === 'last30days' ? 'active' : ''}"
            @click="${() => this.#handleDatePresetClick('last30days')}"
          >
            Last 30 days
          </button>
          <button
            class="date-preset-btn ${dateFilter.type === 'preset' && dateFilter.preset === 'thisyear' ? 'active' : ''}"
            @click="${() => this.#handleDatePresetClick('thisyear')}"
          >
            This year
          </button>
        </div>
        <div class="custom-date-range">
          <md-outlined-text-field
            type="date"
            label="From date"
            .value="${dateFilter.customFrom || ''}"
            @input="${(e: Event) => {
              const input = e.target as HTMLInputElement;
              this.#handleCustomDateChange('customFrom', input.value);
            }}"
          ></md-outlined-text-field>
          <md-outlined-text-field
            type="date"
            label="To date"
            .value="${dateFilter.customTo || ''}"
            @input="${(e: Event) => {
              const input = e.target as HTMLInputElement;
              this.#handleCustomDateChange('customTo', input.value);
            }}"
          ></md-outlined-text-field>
        </div>
      </div>
    `;
  }

  override render() {
    if (!this.open) return html``;

    return html`
      <md-dialog ?open="${this.open}" @close="${this.#handleClose}">
        <div slot="headline">Filter Bookmarks</div>
        <div slot="content">
          ${this.#renderTagsSection()}
          ${this.#renderStatusSection()}
          ${this.#renderDateSection()}
        </div>
        <div slot="actions">
          <div class="dialog-actions">
            <md-text-button @click="${this.#handleClearAll}">
              Clear All
            </md-text-button>
            <div>
              <md-text-button @click="${this.#handleClose}">
                Cancel
              </md-text-button>
              <md-filled-button @click="${this.#handleApply}">
                Apply
              </md-filled-button>
            </div>
          </div>
        </div>
      </md-dialog>
    `;
  }
}
