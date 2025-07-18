/**
 * Cloudflare Worker for Pocket Ding CORS Proxy
 * 
 * This worker proxies requests to Linkding servers to bypass CORS restrictions.
 * Deploy this to Cloudflare Workers and use the worker URL in your Pocket Ding configuration.
 * 
 * How to deploy:
 * 1. Go to https://dash.cloudflare.com/
 * 2. Navigate to Workers & Pages
 * 3. Create a new Worker
 * 4. Replace the default code with this file's contents
 * 5. Deploy and note the worker URL (e.g., https://pocket-ding-proxy.your-subdomain.workers.dev)
 * 6. Update VITE_CORS_PROXY_URL in your app configuration
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
    if (request.method === 'OPTIONS') {
      return handleCORS();
    }

    try {
      const url = new URL(request.url);
      
      // Extract the target URL from the 'target' query parameter
      const targetUrl = url.searchParams.get('target');
      
      if (!targetUrl) {
        return new Response('Missing target URL parameter', { 
          status: 400,
          headers: getCORSHeaders()
        });
      }

      // Validate that the target is a Linkding API endpoint
      if (!isValidLinkdingUrl(targetUrl)) {
        return new Response('Invalid target URL - must be a Linkding API endpoint', { 
          status: 403,
          headers: getCORSHeaders()
        });
      }

      // Forward the request to the target URL
      const modifiedRequest = new Request(targetUrl, {
        method: request.method,
        headers: request.headers,
        body: request.body,
      });

      // Make the request to the Linkding server
      const response = await fetch(modifiedRequest);
      
      // Create a new response with CORS headers
      const modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          ...Object.fromEntries(response.headers.entries()),
          ...getCORSHeaders()
        }
      });

      return modifiedResponse;

    } catch (error) {
      console.error('Proxy error:', error);
      return new Response(`Proxy error: ${error.message}`, { 
        status: 500,
        headers: getCORSHeaders()
      });
    }
  }
};

/**
 * Handle CORS preflight requests
 */
function handleCORS() {
  return new Response(null, {
    status: 204,
    headers: getCORSHeaders()
  });
}

/**
 * Get CORS headers for all responses
 */
function getCORSHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400', // 24 hours
  };
}

/**
 * Validate that the target URL is a legitimate Linkding API endpoint
 * This prevents the proxy from being abused to proxy arbitrary requests
 */
function isValidLinkdingUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // Must be HTTPS (security requirement)
    if (parsedUrl.protocol !== 'https:') {
      return false;
    }
    
    // Must be an API endpoint (contains /api/)
    if (!parsedUrl.pathname.includes('/api/')) {
      return false;
    }
    
    // Allowed API endpoints patterns
    const allowedPaths = [
      '/api/bookmarks/',
      '/api/bookmarks/archived/',
      '/api/bookmarks/\\d+/',
      '/api/bookmarks/\\d+/assets/',
      '/api/user-profile/'
    ];
    
    // Check if the path matches any allowed pattern
    return allowedPaths.some(pattern => {
      const regex = new RegExp(pattern);
      return regex.test(parsedUrl.pathname);
    });
    
  } catch (error) {
    return false;
  }
}