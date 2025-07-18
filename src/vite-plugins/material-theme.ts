/**
 * Vite plugin for Material Web Components theme files
 * 
 * This plugin is now simplified since we use CSS imports instead of
 * serving files from node_modules. The theme CSS files are bundled
 * directly with the application.
 */

import type { Plugin } from 'vite'

export function materialTheme(): Plugin {
  return {
    name: 'material-theme',
    // No longer needed since we use CSS imports
    // The theme files are now bundled as part of the application
    buildStart() {
      console.log('Material theme CSS files will be bundled with the application')
    }
  }
}