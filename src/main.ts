import { css } from 'lit';
import { ThemeService } from './services/theme-service';
import { DebugService } from './services/debug-service';
import './components/app-root';

// Material Symbols font bundled locally for offline use
import '@fontsource/material-symbols-outlined';

// Material Web Components will be imported directly in components as needed
// Import Material Web typography scale styles
import '@material/web/typography/md-typescale-styles.js';

// Initialize theme service for dark mode support
ThemeService.init();

// Initialize debug service
DebugService.initialize();

// Register service worker with VitePWA
import { registerSW } from 'virtual:pwa-register';

DebugService.log('info', 'app', 'pwa-registration', 'Starting service worker registration');

const updateSW = registerSW({
  onNeedRefresh() {
    DebugService.log('info', 'app', 'pwa-update', 'New version detected! Service worker needs refresh');
    const currentVersion = (window as any).__APP_VERSION__;
    DebugService.log('info', 'app', 'pwa-update', 'Current app version', { version: currentVersion });

    // Show a prompt to user and handle their response
    if (confirm('🔄 A new version is available. Reload now to get the latest features?')) {
      DebugService.log('info', 'app', 'pwa-update', 'User accepted update. Forcing service worker update');
      updateSW(true); // Force update and reload
    } else {
      DebugService.log('info', 'app', 'pwa-update', 'User declined update');
    }
  },
  onOfflineReady() {
    DebugService.log('info', 'app', 'pwa-registration', 'App is ready to work offline');
  },
  onRegistered(swRegistration) {
    DebugService.log('info', 'app', 'pwa-registration', 'Service worker registered successfully');
    if (swRegistration) {
      DebugService.log('info', 'app', 'pwa-registration', 'Registration details', {
        scope: swRegistration.scope,
        active: !!swRegistration.active,
        installing: !!swRegistration.installing,
        waiting: !!swRegistration.waiting
      });
    }
  },
  onRegisterError(error) {
    DebugService.log('error', 'app', 'pwa-registration', 'Service worker registration failed', undefined, error);
  },
});

// Listen for service worker activation messages
navigator.serviceWorker.addEventListener('message', (event) => {
  const { type, version, timestamp } = event.data;

  if (type === 'SW_ACTIVATED') {
    DebugService.log('info', 'app', 'pwa-activation', 'Service worker activated with new version', {
      version,
      activationTime: new Date(timestamp).toISOString()
    });

    // Compare with current app version
    const currentVersion = (window as any).__APP_VERSION__;
    if (currentVersion && version.buildTimestamp !== currentVersion.buildTimestamp) {
      DebugService.log('warn', 'app', 'pwa-activation', 'Version mismatch detected', {
        appVersion: currentVersion.buildTimestamp,
        swVersion: version.buildTimestamp
      });
    } else {
      DebugService.log('info', 'app', 'pwa-activation', 'App and service worker versions match');
    }
  }
});

const initialVersion = (window as any).__APP_VERSION__;
DebugService.log('info', 'app', 'pwa-initialization', 'Initial app version loaded', { version: initialVersion });

// Create and mount the app
const app = document.createElement('app-root');
document.body.appendChild(app);

// Apply global styles
const globalStyles = css`
  * {
    box-sizing: border-box;
  }
  
  body {
    margin: 0;
    font-family: 'Roboto', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: var(--md-sys-color-surface);
    color: var(--md-sys-color-on-surface);
    transition: background-color 0.2s ease, color 0.2s ease;
  }
  
  html {
    height: 100%;
  }
  
  :root.dark {
    color-scheme: dark;
  }
  
  :root.light {
    color-scheme: light;
  }
  
  #app {
    height: 100%;
  }
`;

// Apply global styles
const style = document.createElement('style');
style.textContent = globalStyles.cssText;
document.head.appendChild(style);

// Material Design tokens will be applied by the theme service and Material components