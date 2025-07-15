import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { shoelaceAssets } from './vite-plugins/shoelace-assets'

export default defineConfig(({ command }) => {
  // Determine base path based on environment
  // For GitHub Pages, use the repository name as base path
  const isGitHubPages = process.env.GITHUB_PAGES === 'true' || 
                        process.env.GITHUB_ACTIONS === 'true' ||
                        process.env.CI === 'true'
  
  const base = isGitHubPages ? '/pocket-ding/' : '/'

  return {
    base,
    root: '.',
    plugins: [
      shoelaceAssets(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365 // 1 year
                }
              }
            }
          ]
        },
        manifest: {
          name: 'Pocket Ding',
          short_name: 'LinkReader',
          description: 'A PWA reader for Linkding bookmarks',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          icons: [
            {
              src: base + 'icon-192.png',
              sizes: '192x192',
              type: 'image/png'
            },
            {
              src: base + 'icon-512.png',
              sizes: '512x512',
              type: 'image/png'
            }
          ]
        }
      })
    ],
    build: {
      target: 'es2024',
      rollupOptions: {
        output: {
          manualChunks(id) {
            // Automatically chunk node_modules into vendor bundle
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          }
        }
      }
    },
    esbuild: {
      target: 'es2024'
    },
    server: {
      port: 5175,
      fs: {
        allow: ['..']
      },
      proxy: {
        '/api': {
          target: process.env.LINKDING_URL || 'http://localhost:9090',
          changeOrigin: true,
          secure: true
        },
        '/static': {
          target: process.env.LINKDING_URL || 'http://localhost:9090',
          changeOrigin: true,
          secure: true
        }
      }
    },
    assetsInclude: ['**/*.svg']
  }
})
