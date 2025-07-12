import { Plugin } from 'vite'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { resolve, join, dirname } from 'path'
import { globSync } from 'glob'

export function shoelaceIcons(): Plugin {
  return {
    name: 'shoelace-icons',
    configureServer(server) {
      // Serve Shoelace icons during development
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
    },
    generateBundle() {
      // Scan all source files for sl-icon name attributes
      const sourceFiles = globSync('src/**/*.{ts,js,html}', { absolute: true })
      const usedIcons = new Set<string>()
      
      // Regex to find sl-icon name attributes
      const iconNameRegex = /<sl-icon[^>]+name=["']([^"']+)["']/g
      
      for (const file of sourceFiles) {
        const content = readFileSync(file, 'utf-8')
        let match
        
        while ((match = iconNameRegex.exec(content)) !== null) {
          usedIcons.add(match[1])
        }
      }
      
      console.log(`Found ${usedIcons.size} unique Shoelace icons:`, Array.from(usedIcons).sort())
      
      // Create shoelace directory in dist to match base path
      const distShoelaceDir = resolve(process.cwd(), 'dist/shoelace/assets')
      const iconsDir = join(distShoelaceDir, 'icons')
      
      if (!existsSync(iconsDir)) {
        mkdirSync(iconsDir, { recursive: true })
      }
      
      // Copy only the used icons
      const shoelaceIconsDir = resolve(process.cwd(), 'node_modules/@shoelace-style/shoelace/dist/assets/icons')
      
      for (const iconName of usedIcons) {
        const srcPath = join(shoelaceIconsDir, `${iconName}.svg`)
        const destPath = join(iconsDir, `${iconName}.svg`)
        
        if (existsSync(srcPath)) {
          const iconContent = readFileSync(srcPath)
          writeFileSync(destPath, iconContent)
        } else {
          console.warn(`Warning: Icon '${iconName}' not found in Shoelace assets`)
        }
      }
      
      console.log(`Copied ${usedIcons.size} icons to dist/shoelace/assets/icons/`)
    }
  }
}