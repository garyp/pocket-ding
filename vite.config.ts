import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { shoelaceIcons } from './vite-plugins/shoelace-icons'

export default defineConfig({
  root: '.',
  plugins: [
    shoelaceIcons(),
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
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/icon-512.png',
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
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'https://linkding.realify.com',
        changeOrigin: true,
        secure: true
      }
    }
  },
  assetsInclude: ['**/*.svg']
})
