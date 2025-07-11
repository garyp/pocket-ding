import { css } from 'lit';
import { setBasePath } from '@shoelace-style/shoelace/dist/utilities/base-path.js';
import './components/app-root';

// Set Shoelace base path for bundled assets
setBasePath('/assets/');

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
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
      'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
      sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    background: var(--sl-color-neutral-50);
    color: var(--sl-color-neutral-900);
  }
  
  html {
    height: 100%;
  }
  
  #app {
    height: 100%;
  }
`;

// Apply global styles
const style = document.createElement('style');
style.textContent = globalStyles.cssText;
document.head.appendChild(style);

// Apply CSS custom properties for consistent theming
const theme = css`
  :root {
    --sl-color-primary-50: #eff6ff;
    --sl-color-primary-100: #dbeafe;
    --sl-color-primary-200: #bfdbfe;
    --sl-color-primary-300: #93c5fd;
    --sl-color-primary-400: #60a5fa;
    --sl-color-primary-500: #3b82f6;
    --sl-color-primary-600: #2563eb;
    --sl-color-primary-700: #1d4ed8;
    --sl-color-primary-800: #1e40af;
    --sl-color-primary-900: #1e3a8a;
    --sl-color-primary-950: #172554;
  }
`;

const themeStyle = document.createElement('style');
themeStyle.textContent = theme.cssText;
document.head.appendChild(themeStyle);