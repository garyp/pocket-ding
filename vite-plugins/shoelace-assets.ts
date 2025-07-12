/**
 * Vite plugin for managing Shoelace Design System assets
 * 
 * This plugin handles:
 * - Icons: Copies only explicitly registered icons from src/icons/index.ts
 * - Themes: Copies light.css and dark.css for dynamic theme switching
 * - Development server: Serves assets from node_modules during development
 * - Production build: Copies assets to dist/shoelace/ for deployment
 * 
 * Icons must be explicitly registered in REQUIRED_ICONS array - no automatic scanning.
 */

import { Plugin } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'

export function shoelaceAssets(): Plugin {
  return {
    name: 'shoelace-assets',
    configureServer(server) {
      // Serve Shoelace assets during development
      
      // Serve icons
      server.middlewares.use('/shoelace/assets/icons', (req, res, next) => {
        // Extract icon name from URL like "/gear.svg" -> "gear"
        const iconName = req.url?.replace('/', '').replace('.svg', '')
        
        if (iconName) {
          const shoelaceIconsDir = resolve(process.cwd(), 'node_modules/@shoelace-style/shoelace/dist/assets/icons')
          const iconPath = join(shoelaceIconsDir, `${iconName}.svg`)
          
          if (existsSync(iconPath)) {
            res.setHeader('Content-Type', 'image/svg+xml')
            const iconContent = readFileSync(iconPath)
            res.end(iconContent)
            return
          }
        }
        next()
      })
      
      // Serve theme CSS files
      server.middlewares.use('/shoelace/themes', (req, res, next) => {
        // Extract theme name from URL like "/light.css" -> "light.css"
        const themeName = req.url?.replace('/', '')
        
        if (themeName && (themeName === 'light.css' || themeName === 'dark.css')) {
          const shoelaceThemesDir = resolve(process.cwd(), 'node_modules/@shoelace-style/shoelace/dist/themes')
          const themePath = join(shoelaceThemesDir, themeName)
          
          if (existsSync(themePath)) {
            res.setHeader('Content-Type', 'text/css')
            const themeContent = readFileSync(themePath)
            res.end(themeContent)
            return
          }
        }
        next()
      })
    },
    generateBundle() {
      // Get explicitly registered icons from the icon registry
      let registeredIcons: string[] = [];
      
      try {
        const iconRegistryPath = resolve(process.cwd(), 'src/icons/index.ts')
        if (existsSync(iconRegistryPath)) {
          // Read the file and extract icon names from the REQUIRED_ICONS array
          const content = readFileSync(iconRegistryPath, 'utf-8')
          
          // Match the REQUIRED_ICONS array content
          const arrayMatch = content.match(/REQUIRED_ICONS\s*=\s*\[([\s\S]*?)\]/);
          if (arrayMatch) {
            const arrayContent = arrayMatch[1];
            const iconMatches = arrayContent.match(/'([^']+)'/g);
            if (iconMatches) {
              registeredIcons = iconMatches.map(match => match.slice(1, -1)); // Remove quotes
            }
          }
        }
      } catch (error) {
        console.warn('Could not read icon registry:', error)
      }
      
      // Use only explicitly registered icons
      const allIcons = new Set(registeredIcons)
      
      console.log(`Using ${allIcons.size} explicitly registered Shoelace icons:`, Array.from(allIcons).sort())
      
      // Create shoelace directory in dist to match base path
      const distShoelaceDir = resolve(process.cwd(), 'dist/shoelace')
      const distThemesDir = join(distShoelaceDir, 'themes')
      const iconsDir = join(distShoelaceDir, 'assets/icons')
      
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true })
      }
      
      if (!existsSync(distThemesDir)) {
        mkdirSync(distThemesDir, { recursive: true })
      }
      
      // Copy only the used icons
      const shoelaceIconsDir = resolve(process.cwd(), 'node_modules/@shoelace-style/shoelace/dist/assets/icons')
      
      for (const iconName of allIcons) {
        const srcPath = join(shoelaceIconsDir, `${iconName}.svg`)
        const destPath = join(iconsDir, `${iconName}.svg`)
        
        if (existsSync(srcPath)) {
          const iconContent = readFileSync(srcPath)
          writeFileSync(destPath, iconContent)
        } else {
          console.warn(`Warning: Icon '${iconName}' not found in Shoelace assets`)
        }
      }
      
      console.log(`Copied ${allIcons.size} icons to dist/shoelace/assets/icons/`)
      
      // Copy theme CSS files
      const shoelaceThemesDir = resolve(process.cwd(), 'node_modules/@shoelace-style/shoelace/dist/themes')
      const themeFiles = ['light.css', 'dark.css']
      
      for (const themeFile of themeFiles) {
        const srcPath = join(shoelaceThemesDir, themeFile)
        const destPath = join(distThemesDir, themeFile)
        
        if (existsSync(srcPath)) {
          const themeContent = readFileSync(srcPath)
          writeFileSync(destPath, themeContent)
        } else {
          console.warn(`Warning: Theme file '${themeFile}' not found in Shoelace themes`)
        }
      }
      
      console.log(`Copied theme CSS files to dist/shoelace/themes/`)
    }
  }
}