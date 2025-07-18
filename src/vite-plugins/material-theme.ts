/**
 * Vite plugin for Material Web Components theme files
 * 
 * This plugin handles:
 * - Theme CSS: Serves light.css and dark.css from Material Web Components
 * - Development server: Serves theme files from node_modules during development  
 * - Production build: Copies theme files to dist/material/ for deployment
 */

import type { Plugin } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join } from 'path'

export function materialTheme(): Plugin {
  return {
    name: 'material-theme',
    configureServer(server) {
      // Serve Material theme CSS files during development
      server.middlewares.use('/node_modules/material/demo/css', (req, res, next) => {
        // Extract theme name from URL like "/light.css" -> "light.css"
        const themeName = req.url?.replace('/', '')
        
        if (themeName && (themeName === 'light.css' || themeName === 'dark.css')) {
          const materialThemesDir = resolve(process.cwd(), 'node_modules/material/demo/css')
          const themePath = join(materialThemesDir, themeName)
          
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
      // Create material directory in dist to match serving path
      const distMaterialDir = resolve(process.cwd(), 'dist/node_modules/material/demo/css')
      
      if (!existsSync(distMaterialDir)) {
        mkdirSync(distMaterialDir, { recursive: true })
      }
      
      // Copy theme CSS files
      const materialThemesDir = resolve(process.cwd(), 'node_modules/material/demo/css')
      const themeFiles = ['light.css', 'dark.css']
      
      for (const themeFile of themeFiles) {
        const srcPath = join(materialThemesDir, themeFile)
        const destPath = join(distMaterialDir, themeFile)
        
        if (existsSync(srcPath)) {
          const themeContent = readFileSync(srcPath)
          writeFileSync(destPath, themeContent)
        } else {
          console.warn(`Warning: Theme file '${themeFile}' not found in Material themes`)
        }
      }
      
      console.log(`Copied Material theme CSS files to dist/node_modules/material/demo/css/`)
    }
  }
}