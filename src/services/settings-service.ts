import { liveQuery } from 'dexie';
import { DatabaseService } from './database';
import type { AppSettings } from '../types';

/**
 * Service for managing application settings with both reactive and traditional access patterns.
 * Provides a centralized way to access settings across the application while supporting
 * reactive patterns for components and traditional async access for services.
 */
export class SettingsService {
  static #currentSettings: AppSettings | undefined = undefined;
  static #settingsSubscription: { unsubscribe(): void } | undefined = undefined;
  static #isInitialized = false;

  /**
   * Initialize the settings service. This sets up internal state tracking
   * to provide synchronous access to settings for services.
   */
  static async initialize(): Promise<void> {
    if (this.#isInitialized) {
      return;
    }

    // Set up reactive subscription to keep current settings in sync
    this.#settingsSubscription = liveQuery(() => DatabaseService.getSettings()).subscribe({
      next: (settings: AppSettings | undefined) => {
        this.#currentSettings = settings;
      },
      error: (error: Error) => {
        console.error('SettingsService: Failed to update settings', error);
      }
    });

    // Load initial settings
    this.#currentSettings = await DatabaseService.getSettings();
    this.#isInitialized = true;
  }

  /**
   * Clean up the settings service subscriptions
   */
  static cleanup(): void {
    if (this.#settingsSubscription) {
      this.#settingsSubscription.unsubscribe();
      this.#settingsSubscription = undefined;
    }
    this.#currentSettings = undefined;
    this.#isInitialized = false;
  }

  /**
   * Get current settings synchronously. Returns undefined if no settings are configured
   * or if the service hasn't been initialized yet.
   *
   * This method is suitable for services that need immediate access to settings.
   */
  static getCurrentSettings(): AppSettings | undefined {
    return this.#currentSettings;
  }

  /**
   * Get settings asynchronously. This is the traditional database access pattern.
   *
   * This method is suitable when you need to ensure you have the latest settings
   * or when working in contexts where reactive patterns aren't available.
   */
  static async getSettings(): Promise<AppSettings | undefined> {
    // Ensure service is initialized
    if (!this.#isInitialized) {
      await this.initialize();
    }
    return DatabaseService.getSettings();
  }

  /**
   * Get a reactive observable for settings. This returns a Dexie liveQuery
   * that can be used with ReactiveQueryController or subscribed to directly.
   *
   * This method is suitable for components that need reactive updates.
   */
  static getSettingsLive() {
    return liveQuery(() => DatabaseService.getSettings());
  }

  /**
   * Save settings to the database. This will trigger reactive updates
   * across all consumers.
   */
  static async saveSettings(settings: AppSettings): Promise<void> {
    await DatabaseService.saveSettings(settings);
  }

  /**
   * Check if settings are currently available and valid for API operations
   */
  static hasValidSettings(): boolean {
    const settings = this.#currentSettings;
    return !!(settings?.linkding_url && settings?.linkding_token);
  }

  /**
   * Get the current Linkding URL if available
   */
  static getLinkdingUrl(): string | undefined {
    return this.#currentSettings?.linkding_url;
  }

  /**
   * Get the current Linkding token if available
   */
  static getLinkdingToken(): string | undefined {
    return this.#currentSettings?.linkding_token;
  }
}