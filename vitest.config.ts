import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/playwright/**',
      '**/src/test/playwright/**'
    ],
    deps: {
      inline: [/^lit/, /^@lit/, /^@shoelace-style/]
    }
  }
})