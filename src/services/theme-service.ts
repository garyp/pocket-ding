export type ThemeMode = 'light' | 'dark' | 'system';

export class ThemeService {
  private static currentTheme: ThemeMode = 'system';
  private static mediaQuery: MediaQueryList | null = null;
  private static listeners: ((theme: 'light' | 'dark') => void)[] = [];
  private static updateInProgress: Promise<void> | null = null;

  // For testing purposes - reset the service state
  static reset() {
    this.currentTheme = 'system';
    this.mediaQuery = null;
    this.listeners = [];
    this.updateInProgress = null;
    document.documentElement.className = '';
    document.querySelectorAll('style[data-material-theme]').forEach(style => style.remove());
  }

  static init() {
    try {
      // Check for saved theme preference
      const savedTheme = localStorage.getItem('theme-mode') as ThemeMode;
      if (savedTheme && ['light', 'dark', 'system'].includes(savedTheme)) {
        this.currentTheme = savedTheme;
      }

      // Set up system preference listener
      this.mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      this.mediaQuery.addEventListener('change', () => {
        if (this.currentTheme === 'system') {
          this.applyTheme();
        }
      });

      // Apply initial theme
      this.applyTheme();
    } catch (error) {
      console.warn('Failed to initialize theme service:', error);
      // Fall back to light theme if initialization fails
      this.currentTheme = 'light';
      this.applyTheme();
    }
  }

  static setTheme(theme: ThemeMode) {
    this.currentTheme = theme;
    localStorage.setItem('theme-mode', theme);
    this.applyTheme();
  }

  static setThemeFromSettings(theme: ThemeMode) {
    this.currentTheme = theme;
    // Don't save to localStorage - settings will handle persistence
    this.applyTheme();
  }

  static getCurrentTheme(): ThemeMode {
    return this.currentTheme;
  }

  static getResolvedTheme(): 'light' | 'dark' {
    if (this.currentTheme === 'system') {
      return this.mediaQuery?.matches ? 'dark' : 'light';
    }
    return this.currentTheme;
  }

  static addThemeChangeListener(listener: (theme: 'light' | 'dark') => void) {
    this.listeners.push(listener);
    // Call immediately with current theme
    listener(this.getResolvedTheme());
  }

  static removeThemeChangeListener(listener: (theme: 'light' | 'dark') => void) {
    const index = this.listeners.indexOf(listener);
    if (index > -1) {
      this.listeners.splice(index, 1);
    }
  }

  private static applyTheme() {
    const resolvedTheme = this.getResolvedTheme();
    
    // Update document root class for global styles
    document.documentElement.className = resolvedTheme;
    
    // Update Material theme (async) - wait for previous update to complete
    if (this.updateInProgress) {
      this.updateInProgress = this.updateInProgress.then(() => this.updateMaterialTheme(resolvedTheme));
    } else {
      this.updateInProgress = this.updateMaterialTheme(resolvedTheme);
    }
    
    // Notify listeners
    this.listeners.forEach(listener => listener(resolvedTheme));
  }

  private static async updateMaterialTheme(theme: 'light' | 'dark') {
    // Remove existing theme styles (remove all to handle race conditions)
    const existingStyles = document.querySelectorAll('style[data-material-theme]');
    existingStyles.forEach(style => style.remove());

    // Import the theme CSS dynamically
    try {
      const themeModule = await import(`../styles/material-theme-${theme}.css?inline`);
      const themeCSS = themeModule.default;
      
      // Create a style element with the theme CSS
      const styleElement = document.createElement('style');
      styleElement.textContent = themeCSS;
      styleElement.setAttribute('data-material-theme', theme);
      document.head.appendChild(styleElement);
    } catch (error) {
      console.warn(`Failed to load Material theme '${theme}':`, error);
      
      // Fallback: create a placeholder style element for tests
      const styleElement = document.createElement('style');
      styleElement.textContent = `/* Material theme ${theme} placeholder */`;
      styleElement.setAttribute('data-material-theme', theme);
      document.head.appendChild(styleElement);
    }
  }
}