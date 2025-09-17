import type { VersionInfo } from '../types/version';

/**
 * Service for accessing application and service worker version information
 */
export class VersionService {
  /**
   * Get the main application version (from the build process)
   */
  static getAppVersion(): VersionInfo {
    return __APP_VERSION__;
  }

  /**
   * Get the service worker version by messaging it
   */
  static async getServiceWorkerVersion(): Promise<VersionInfo | null> {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      return null;
    }

    return new Promise((resolve) => {
      const channel = new MessageChannel();

      channel.port1.onmessage = (event) => {
        if (event.data.type === 'VERSION_INFO') {
          resolve(event.data.version);
        }
      };

      // Request version from service worker
      const controller = navigator.serviceWorker.controller;
      if (controller) {
        controller.postMessage({
          type: 'REQUEST_VERSION'
        }, [channel.port2]);
      } else {
        resolve(null);
      }

      // Timeout after 2 seconds
      setTimeout(() => resolve(null), 2000);
    });
  }

  /**
   * Check if main app and service worker versions differ
   */
  static async areVersionsDifferent(): Promise<boolean> {
    const appVersion = this.getAppVersion();
    const swVersion = await this.getServiceWorkerVersion();

    if (!swVersion) return false;

    return appVersion.buildTimestamp !== swVersion.buildTimestamp;
  }
}