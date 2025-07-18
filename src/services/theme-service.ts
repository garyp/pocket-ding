export type ThemeMode = 'light' | 'dark' | 'system';

export class ThemeService {
  private static currentTheme: ThemeMode = 'system';
  private static mediaQuery: MediaQueryList | null = null;
  private static listeners: ((theme: 'light' | 'dark') => void)[] = [];

  // For testing purposes - reset the service state
  static reset() {
    this.currentTheme = 'system';
    this.mediaQuery = null;
    this.listeners = [];
    document.documentElement.className = '';
    document.querySelectorAll('link[data-material-theme]').forEach(link => link.remove());
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
    
    // Update Material theme
    this.updateMaterialTheme(resolvedTheme);
    
    // Notify listeners
    this.listeners.forEach(listener => listener(resolvedTheme));
  }

  private static updateMaterialTheme(theme: 'light' | 'dark') {
    // Remove existing theme link
    const existingLink = document.querySelector('link[data-material-theme]');
    if (existingLink) {
      existingLink.remove();
    }

    // Material Web Components uses CSS custom properties for theming
    // Import the theme CSS file that defines Material Design tokens
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `/node_modules/material/demo/css/${theme}.css`;
    link.setAttribute('data-material-theme', theme);
    document.head.appendChild(link);
  }
}