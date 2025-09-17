import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig(({ command }) => {
  // Determine base path based on environment
  // For GitHub Pages, use the repository name as base path
  const isGitHubPages = process.env.GITHUB_PAGES === 'true' ||
                        process.env.GITHUB_ACTIONS === 'true' ||
                        process.env.CI === 'true'

  const base = isGitHubPages ? '/pocket-ding/' : '/'

  // Generate version information
  const buildTimestamp = new Date().toISOString()
  const githubRunId = process.env.GITHUB_RUN_ID || null
  const versionInfo = {
    buildTimestamp,
    githubRunId,
    // Create a short version string for display
    shortVersion: buildTimestamp.replace(/[T:]/g, '-').substring(0, 16) + (githubRunId ? `-${githubRunId}` : '')
  }

  return {
    base,
    root: '.',
    define: {
      // Inject version info into the build
      __APP_VERSION__: JSON.stringify(versionInfo),
    },
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        strategies: 'injectManifest',
        srcDir: 'src/worker',
        filename: 'sw.ts',
        injectManifest: {
          globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        },
        workbox: {
          skipWaiting: true,
          clientsClaim: true,
        },
        manifest: {
          name: 'Pocket Ding',
          short_name: 'Pocket Ding',
          description: 'A PWA reader for Linkding bookmarks',
          theme_color: '#2563eb',
          background_color: '#ffffff',
          display: 'standalone',
          orientation: 'portrait',
          scope: base,
          start_url: base,
          categories: ['productivity', 'utilities'],
          lang: 'en',
          icons: [
            {
              src: base + 'icon-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any maskable'
            },
            {
              src: base + 'icon-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    build: {
      target: 'es2024',
      rollupOptions: {
        input: {
          main: './index.html',
          'sync-worker': './src/worker/sync-worker.ts'
        },
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
