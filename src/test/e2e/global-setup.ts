/**
 * Global setup for E2E tests
 *
 * Starts a Linkding TestContainer that all E2E tests can use.
 * The container URL and credentials are stored in environment variables
 * for tests to access.
 */

import type { FullConfig } from '@playwright/test';
import {
  startLinkdingContainer,
  isDockerAvailable,
} from './utils/linkding-container';
import type { LinkdingContainerInfo } from './utils/linkding-container';
import {
  createLinkdingClient,
  populateTestData,
} from './utils/test-data';

// Store container info globally
let linkdingContainer: LinkdingContainerInfo | null = null;

export default async function globalSetup(_config: FullConfig) {
  console.log('\n🚀 Starting E2E test environment setup...\n');

  // Configure TestContainers based on environment
  // GitHub Actions has Docker available by default, local dev may use Podman
  const isCI = process.env['CI'] === 'true';

  if (isCI) {
    // GitHub Actions environment - use default Docker setup
    console.log('Running in CI environment - using GitHub Actions Docker');
    // GitHub Actions has Docker daemon available at the default socket
    // No need to set DOCKER_HOST
  } else {
    // Local development - configure for rootless Podman if DOCKER_HOST not set
    if (!process.env['DOCKER_HOST']) {
      // Use Podman socket path (rootless)
      const uid = process.getuid?.() || 1000;
      process.env['DOCKER_HOST'] = `unix:///run/user/${uid}/podman/podman.sock`;
      console.log(`Configuring for rootless Podman (UID: ${uid})`);
    }

    // Disable Ryuk for rootless Podman (required for compatibility)
    process.env['TESTCONTAINERS_RYUK_DISABLED'] = 'true';
  }

  // Check if Docker is available
  const dockerAvailable = await isDockerAvailable();
  if (!dockerAvailable) {
    console.error('❌ Docker is not available!');
    console.error('E2E tests require Docker to be installed and running.');
    console.error('Skipping E2E test setup.\n');
    process.env['E2E_TESTS_DISABLED'] = 'true';
    return;
  }

  try {
    // Start Linkding container
    linkdingContainer = await startLinkdingContainer({
      startupTimeout: 90000, // 90 seconds for slower systems
    });

    // Verify API token was retrieved
    if (!linkdingContainer.apiToken) {
      throw new Error('Failed to retrieve API token from Linkding container');
    }

    // Store connection info in environment variables for tests
    process.env['E2E_LINKDING_URL'] = linkdingContainer.url;
    process.env['E2E_LINKDING_TOKEN'] = linkdingContainer.apiToken;
    process.env['E2E_LINKDING_USERNAME'] = linkdingContainer.username;
    process.env['E2E_LINKDING_PASSWORD'] = linkdingContainer.password;

    // Populate with test data
    const client = createLinkdingClient(
      linkdingContainer.url,
      linkdingContainer.apiToken
    );

    await populateTestData(client, 'realistic');

    console.log('\n✅ E2E test environment ready!');
    console.log(`   Linkding URL: ${linkdingContainer.url}`);
    console.log(`   Username: ${linkdingContainer.username}`);
    console.log(`   API Token: ${linkdingContainer.apiToken.substring(0, 10)}...`);
    console.log('');

  } catch (error) {
    console.error('❌ Failed to set up E2E test environment:', error);

    // Clean up container if it was started
    if (linkdingContainer) {
      try {
        await linkdingContainer.container.stop();
      } catch {
        // Ignore cleanup errors
      }
    }

    throw error;
  }
}

/**
 * Global teardown - stops the Linkding container
 */
export async function globalTeardown() {
  console.log('\n🧹 Cleaning up E2E test environment...\n');

  if (linkdingContainer) {
    try {
      await linkdingContainer.container.stop();
      console.log('✅ Linkding container stopped\n');
    } catch (error) {
      console.error('⚠ Error stopping Linkding container:', error);
    }
  }
}
