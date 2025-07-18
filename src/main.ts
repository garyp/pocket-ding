import { css } from 'lit';
import { ThemeService } from './services/theme-service';
import './components/app-root';

// Material Symbols font loaded via Google Fonts link in index.html

// Material Web Components will be imported directly in components as needed

// Initialize theme service for dark mode support
ThemeService.init();

// Register service worker with VitePWA
import { registerSW } from 'virtual:pwa-register';

registerSW({
  onNeedRefresh() {
    // Show a prompt to user
    console.log('A new version is available. Please refresh to update.');
  },
  onOfflineReady() {
    // Show a ready to work offline to user
    console.log('App is ready to work offline');
  },
});

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