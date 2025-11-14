import { defineConfig, devices } from '@playwright/test';

/**
 * NOTE: Browser security must be disabled until linkding PR #1128 (CORS support) is merged
 * https://github.com/sissbruecker/linkding/pull/1128
 * Once merged and released, we can enable proper CORS testing by:
 * 1. Removing these launchOptions
 * 2. Uncommenting the CORS environment variables in linkding-container.ts
 */
const securityDisabledLaunchOptions = {
  args: ['--disable-web-security', '--disable-features=IsolateOrigins,site-per-process']
};

/**
 * Playwright configuration for E2E tests with TestContainers
 *
 * These tests run against a real Linkding Docker instance and test the complete
 * application stack including service workers, sync, and offline functionality.
 *
 * IMPORTANT: Service worker network events are enabled via the experimental feature
 * PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1. This allows proper offline testing
 * where the service worker can access Cache API while network requests are blocked.
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://playwright.dev/docs/service-workers-experimental
 */
export default defineConfig({
  testDir: './src/test/e2e',
  /* Global setup/teardown for E2E tests with TestContainers */
  globalSetup: './src/test/e2e/global-setup.ts',
  globalTeardown: './src/test/e2e/global-teardown.ts',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: process.env.CI
    ? [['github'], ['list']] // GitHub Actions annotations + list output
    : 'list',
  /* Global timeout for each test (increase for CI due to container startup) */
  timeout: process.env.CI ? 60000 : 30000,
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: 'http://localhost:4173/',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Take screenshot on failure */
    screenshot: 'only-on-failure',

    /* Allow service workers for offline testing with experimental network events */
    serviceWorkers: 'allow',
  },

  /* Configure projects for major browsers */
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: securityDisabledLaunchOptions
      },
    },
    {
      name: 'mobile-chrome',
      use: {
        ...devices['Pixel 5'],
        launchOptions: securityDisabledLaunchOptions
      },
    },
    {
      name: 'tablet-chrome',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 768, height: 1024 },
        launchOptions: securityDisabledLaunchOptions
      },
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
