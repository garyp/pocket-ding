/**
 * Centralized fetch helper that handles development proxy routing
 * and provides a consistent interface for all HTTP requests.
 */

// Global configuration for the fetch helper
let linkdingBaseUrl: string | null = null;

/**
 * Configure the fetch helper with the Linkding base URL
 * This should be called when the app starts or when settings are loaded
 */
export function configureFetchHelper(baseUrl: string) {
  linkdingBaseUrl = baseUrl;
}

/**
 * Determines if we're running in development mode
 */
function isDevelopmentMode(): boolean {
  const isTestEnvironment = typeof process !== 'undefined' && process.env?.['NODE_ENV'] === 'test';
  const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  return isLocalhost && !isTestEnvironment;
}

/**
 * Transforms URLs to use the development proxy when needed
 */
function transformUrlForProxy(url: string): string {
  if (!isDevelopmentMode() || !linkdingBaseUrl) {
    return url;
  }

  // Extract the base URL without protocol for matching
  try {
    const configuredUrl = new URL(linkdingBaseUrl);
    const requestUrl = new URL(url);
    
    // If the request is to the configured Linkding server, route through proxy
    if (requestUrl.hostname === configuredUrl.hostname && requestUrl.port === configuredUrl.port) {
      return url.replace(linkdingBaseUrl, '');
    }
  } catch (error) {
    // If URL parsing fails, return original URL
    console.debug('URL parsing failed in fetch helper:', error);
  }

  return url;
}

/**
 * Enhanced fetch that automatically handles development proxy routing
 * and sets consistent User-Agent header for all requests
 */
export async function appFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let url: string;
  
  if (input instanceof URL) {
    url = input.toString();
  } else if (typeof input === 'string') {
    url = input;
  } else {
    // RequestInfo is a Request object
    url = input.url;
  }

  const transformedUrl = transformUrlForProxy(url);
  
  // Merge headers with default User-Agent
  const defaultHeaders = {
    'User-Agent': 'PocketDing/1.0 (Progressive Web App)'
  };
  
  const mergedInit = {
    ...init,
    headers: {
      ...defaultHeaders,
      ...init?.headers
    }
  };
  
  // If input was a Request object, we need to create a new one with the transformed URL
  if (typeof input === 'object' && 'url' in input) {
    const newRequest = new Request(transformedUrl, {
      method: input.method,
      headers: {
        ...defaultHeaders,
        ...Object.fromEntries(input.headers.entries()),
        ...init?.headers
      },
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      integrity: input.integrity,
      ...init // Allow overrides (excluding headers which we handled above)
    });
    return fetch(newRequest);
  }

  return fetch(transformedUrl, mergedInit);
}

/**
 * Convenience method for common use cases
 */
export const fetchHelper = {
  /**
   * GET request with automatic proxy handling
   */
  get: (url: string, init?: RequestInit) => 
    appFetch(url, { ...init, method: 'GET' }),

  /**
   * POST request with automatic proxy handling
   */
  post: (url: string, body?: BodyInit, init?: RequestInit) =>
    appFetch(url, { ...init, method: 'POST', ...(body && { body }) }),

  /**
   * PUT request with automatic proxy handling
   */
  put: (url: string, body?: BodyInit, init?: RequestInit) =>
    appFetch(url, { ...init, method: 'PUT', ...(body && { body }) }),

  /**
   * PATCH request with automatic proxy handling
   */
  patch: (url: string, body?: BodyInit, init?: RequestInit) =>
    appFetch(url, { ...init, method: 'PATCH', ...(body && { body }) }),

  /**
   * DELETE request with automatic proxy handling
   */
  delete: (url: string, init?: RequestInit) =>
    appFetch(url, { ...init, method: 'DELETE' }),
};