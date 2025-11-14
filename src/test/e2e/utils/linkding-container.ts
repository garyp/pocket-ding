/**
 * TestContainers utility for managing Linkding Docker containers in E2E tests
 */

import { GenericContainer, Wait } from 'testcontainers';
import type { StartedTestContainer } from 'testcontainers';

export interface LinkdingContainerConfig {
  /** Docker image to use (default: sissbruecker/linkding:latest) */
  image?: string;
  /** Superuser username (default: testadmin) */
  superuserName?: string;
  /** Superuser password (default: testpass123) */
  superuserPassword?: string;
  /** Disable background tasks for deterministic tests (default: true) */
  disableBackgroundTasks?: boolean;
  /** Disable URL validation (default: false) */
  disableUrlValidation?: boolean;
  /** Startup timeout in milliseconds (default: 60000) */
  startupTimeout?: number;
}

export interface LinkdingContainerInfo {
  /** Started container instance */
  container: StartedTestContainer;
  /** Base URL for accessing Linkding (e.g., http://localhost:12345) */
  url: string;
  /** Mapped port for HTTP access */
  port: number;
  /** Superuser username */
  username: string;
  /** Superuser password */
  password: string;
  /** API token (retrieved after startup) */
  apiToken: string | null;
}

/**
 * Start a Linkding container with TestContainers
 *
 * @param config - Container configuration options
 * @returns Container info with URL, port, and credentials
 */
export async function startLinkdingContainer(
  config: LinkdingContainerConfig = {}
): Promise<LinkdingContainerInfo> {
  const {
    image = 'sissbruecker/linkding:latest',
    superuserName = 'testadmin',
    superuserPassword = 'testpass123',
    disableBackgroundTasks = true,
    disableUrlValidation = false,
    startupTimeout = 60000,
  } = config;

  console.log(`Starting Linkding container (${image})...`);

  const environment: Record<string, string> = {
    LD_SUPERUSER_NAME: superuserName,
    LD_SUPERUSER_PASSWORD: superuserPassword,
  };

  // TODO: Uncomment CORS/CSRF environment variables once linkding PR #1128 is merged and released
  // https://github.com/sissbruecker/linkding/pull/1128
  // Until then, E2E tests run with --disable-web-security (see playwright.e2e.config.ts)
  //
  // environment['LD_CSRF_TRUSTED_ORIGINS'] = 'http://localhost:4173 http://127.0.0.1:4173';
  // environment['LD_CORS_ALLOW_ALL_ORIGINS'] = 'True';  // For testing only - use specific origins in production

  if (disableBackgroundTasks) {
    environment['LD_DISABLE_BACKGROUND_TASKS'] = 'True';
  }

  if (disableUrlValidation) {
    environment['LD_DISABLE_URL_VALIDATION'] = 'True';
  }

  const container = await new GenericContainer(image)
    .withExposedPorts(9090)
    .withEnvironment(environment)
    .withWaitStrategy(
      Wait.forHttp('/health', 9090)
        .forStatusCode(200)
        .withStartupTimeout(startupTimeout)
    )
    .start();

  const mappedPort = container.getMappedPort(9090);
  const baseUrl = `http://${container.getHost()}:${mappedPort}`;

  console.log(`✓ Linkding container ready at: ${baseUrl}`);

  // Get API token for the superuser
  let apiToken: string | null = null;
  try {
    apiToken = await getApiToken(container, superuserName);
    console.log(`✓ Retrieved API token for user: ${superuserName}`);
  } catch (error) {
    console.warn(`⚠ Could not retrieve API token: ${error}`);
  }

  return {
    container,
    url: baseUrl,
    port: mappedPort,
    username: superuserName,
    password: superuserPassword,
    apiToken,
  };
}

/**
 * Stop a Linkding container
 *
 * @param containerInfo - Container info from startLinkdingContainer
 */
export async function stopLinkdingContainer(
  containerInfo: LinkdingContainerInfo
): Promise<void> {
  console.log('Stopping Linkding container...');
  await containerInfo.container.stop();
  console.log('✓ Linkding container stopped');
}

/**
 * Get API token for a user from the Linkding container
 *
 * This executes the Django management command inside the container
 * to create/retrieve the API token.
 *
 * @param container - Started TestContainer instance
 * @param username - Username to get token for
 * @returns API token string
 */
async function getApiToken(
  container: StartedTestContainer,
  username: string
): Promise<string> {
  // Execute Django management command to create/get token
  const result = await container.exec([
    'python',
    'manage.py',
    'drf_create_token',
    username,
  ]);

  // Parse output - format is typically: "Generated token {token} for user {username}"
  // or "Token for user {username}: {token}"
  const output = result.output;

  // Look for token pattern (40 character hexadecimal string)
  const tokenMatch = output.match(/([a-f0-9]{40})/i);

  if (!tokenMatch || !tokenMatch[1]) {
    throw new Error(`Could not extract API token from output: ${output}`);
  }

  return tokenMatch[1];
}

/**
 * Wait for Linkding container to be fully ready
 *
 * Sometimes the health endpoint returns 200 before the app is fully ready.
 * This function performs additional checks.
 *
 * @param url - Base URL of Linkding instance
 * @param maxAttempts - Maximum number of attempts (default: 10)
 * @param delayMs - Delay between attempts in milliseconds (default: 1000)
 */
export async function waitForLinkdingReady(
  url: string,
  maxAttempts = 10,
  delayMs = 1000
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.status === 200) {
        // Additional check: try to access the API endpoint
        const apiResponse = await fetch(`${url}/api/bookmarks/`, {
          headers: { 'Authorization': 'Token invalid' },
        });

        // Even with invalid token, should get 401, not 500 or connection error
        if (apiResponse.status === 401 || apiResponse.status === 200) {
          return;
        }
      }
    } catch (error) {
      // Connection error, continue waiting
    }

    if (i < maxAttempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  throw new Error(`Linkding not ready after ${maxAttempts} attempts`);
}

/**
 * Check if Docker is available on the system
 *
 * This can be used in test setup to skip E2E tests if Docker isn't available.
 */
export async function isDockerAvailable(): Promise<boolean> {
  try {
    const { spawn } = await import('child_process');
    return new Promise((resolve) => {
      const proc = spawn('docker', ['info']);
      proc.on('close', (code) => {
        resolve(code === 0);
      });
      proc.on('error', () => {
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}
