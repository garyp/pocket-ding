/**
 * Centralized fetch helper that handles development proxy routing,
 * production CORS proxy, and provides a consistent interface for all HTTP requests.
 */

// Global configuration for the fetch helper
let linkdingBaseUrl: string | null = null;

// CORS proxy configuration
const CORS_PROXY_URL = import.meta.env.VITE_CORS_PROXY_URL || 'https://pocket-ding-proxy.your-subdomain.workers.dev';

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
 * Determines if the URL is a Linkding API request
 */
function isLinkdingApiRequest(url: string): boolean {
  if (!linkdingBaseUrl) return false;
  
  try {
    const configuredUrl = new URL(linkdingBaseUrl);
    const requestUrl = new URL(url);
    
    return requestUrl.hostname === configuredUrl.hostname && 
           requestUrl.port === configuredUrl.port &&
           requestUrl.pathname.includes('/api/');
  } catch (error) {
    return false;
  }
}

/**
 * Transforms URLs for development proxy or production CORS proxy
 */
function transformUrlForProxy(url: string): string {
  // In development, use Vite's proxy
  if (isDevelopmentMode() && linkdingBaseUrl && isLinkdingApiRequest(url)) {
    return url.replace(linkdingBaseUrl, '');
  }
  
  // In production, use Cloudflare Worker CORS proxy for Linkding API requests
  if (!isDevelopmentMode() && isLinkdingApiRequest(url)) {
    const encodedTargetUrl = encodeURIComponent(url);
    return `${CORS_PROXY_URL}?target=${encodedTargetUrl}`;
  }

  return url;
}

/**
 * Enhanced fetch that automatically handles development proxy routing and production CORS proxy
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
  
  // If input was a Request object, we need to create a new one with the transformed URL
  if (typeof input === 'object' && 'url' in input) {
    const newRequest = new Request(transformedUrl, {
      method: input.method,
      headers: input.headers,
      body: input.body,
      mode: input.mode,
      credentials: input.credentials,
      cache: input.cache,
      redirect: input.redirect,
      referrer: input.referrer,
      integrity: input.integrity,
      ...init // Allow overrides
    });
    return fetch(newRequest);
  }

  return fetch(transformedUrl, init);
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