# CORS Proxy Setup with Cloudflare Workers

This guide explains how to set up a Cloudflare Worker to proxy requests from Pocket Ding to your Linkding server, bypassing CORS restrictions.

## Why This Is Needed

When Pocket Ding is deployed to GitHub Pages (or any domain different from your Linkding server), browsers block API requests due to CORS (Cross-Origin Resource Sharing) restrictions. The Cloudflare Worker acts as a proxy, adding the necessary CORS headers.

## Step 1: Deploy the Cloudflare Worker

The worker code is already set up in the `worker/` directory. You can deploy it using the automated scripts:

### Option A: Automated Deployment (Recommended)

1. **Install Wrangler globally** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Setup worker dependencies**:
   ```bash
   npm run worker:setup
   ```

3. **Login to Cloudflare**:
   ```bash
   cd worker && npm run login
   ```

4. **Deploy to production**:
   ```bash
   npm run worker:deploy
   ```

5. **Note your Worker URL**:
   - After deployment, you'll get a URL like: `https://pocket-ding-proxy.your-subdomain.workers.dev`
   - Copy this URL - you'll need it for configuration

### Option B: Manual Deployment

1. **Sign up for Cloudflare** (free tier is sufficient):
   - Go to https://dash.cloudflare.com/
   - Create a free account if you don't have one

2. **Create a new Worker**:
   - Navigate to "Workers & Pages" in the sidebar
   - Click "Create Application"
   - Select "Create Worker"
   - Give it a name like `pocket-ding-proxy`

3. **Deploy the Worker code**:
   - Replace the default code with the contents of `worker/cloudflare-worker.js`
   - Click "Save and Deploy"

4. **Note your Worker URL**:
   - After deployment, you'll get a URL like: `https://pocket-ding-proxy.your-subdomain.workers.dev`
   - Copy this URL - you'll need it for configuration

## Step 2: Configure Pocket Ding

1. **Create environment file**:
   ```bash
   cp .env.example .env
   ```

2. **Update the proxy URL**:
   ```
   VITE_CORS_PROXY_URL=https://pocket-ding-proxy.your-subdomain.workers.dev
   ```

3. **For GitHub Pages deployment**, add the environment variable to your build workflow:
   ```yaml
   - name: Build
     run: npm run build
     env:
       GITHUB_PAGES: 'true'
       VITE_CORS_PROXY_URL: https://pocket-ding-proxy.your-subdomain.workers.dev
   ```

## Step 3: Test the Setup

1. **Deploy your changes** to GitHub Pages
2. **Open your app** in a browser
3. **Configure Linkding settings** in the app
4. **Test the connection** - it should work without CORS errors

## How It Works

### Development Mode
- Requests go through Vite's dev server proxy (no CORS issues)
- No external services needed

### Production Mode
- Requests to Linkding API are automatically routed through your Cloudflare Worker
- Worker adds CORS headers and forwards requests
- Browser receives response with proper CORS headers

### URL Transformation Example
```
Original:     https://linkding.realify.com/api/bookmarks/
Transformed:  https://your-worker.workers.dev?target=https%3A//linkding.realify.com/api/bookmarks/
```

## Security Features

The Cloudflare Worker includes several security measures:

1. **URL Validation**: Only allows requests to Linkding API endpoints
2. **HTTPS Enforcement**: Rejects non-HTTPS target URLs
3. **Path Filtering**: Only allows specific API paths (bookmarks, assets, etc.)
4. **No Open Proxy**: Cannot be used to proxy arbitrary requests

## Limitations

- **Free Tier**: 100,000 requests per day (more than sufficient for personal use)
- **Cold Start**: First request may be slightly slower
- **Single Worker**: One worker can serve multiple Pocket Ding instances

## Development and Monitoring

### Available Commands

From the root directory:
- `npm run worker:setup` - Install worker dependencies
- `npm run worker:dev` - Start local worker development server
- `npm run worker:deploy` - Deploy worker to production
- `npm run worker:deploy:dev` - Deploy worker to development environment
- `npm run worker:tail` - View real-time worker logs

### Local Development

To test the worker locally:
```bash
npm run worker:dev
```

This starts a local server at `http://localhost:8787` that you can use for testing.

### Monitoring

View real-time logs:
```bash
npm run worker:tail
```

Or check the Cloudflare dashboard for analytics and error tracking.

## Troubleshooting

### Worker Not Working
- Check the worker URL is correct in your environment variables
- Verify the worker is deployed and active in Cloudflare dashboard
- Test the worker directly: `https://your-worker.workers.dev?target=https%3A//httpbin.org/get`

### Permission Denied During Deploy
- Make sure you're logged in: `cd worker && npm run login`
- Check your Cloudflare account has Workers enabled

### Still Getting CORS Errors
- Clear browser cache and hard refresh
- Check browser developer tools for specific error messages
- Verify your Linkding URL is using HTTPS

### API Requests Failing
- Check that your Linkding API token is valid
- Verify your Linkding server is accessible from the internet
- Test direct API access: `curl -H "Authorization: Token YOUR_TOKEN" https://your-linkding.com/api/bookmarks/`

## Cost

- **Cloudflare Workers Free Tier**: 100k requests/day, 10ms CPU time per request
- **Typical Usage**: A Pocket Ding instance uses ~100-500 requests per day
- **Cost for Heavy Use**: $0.50 per million requests beyond free tier

## Alternative: Custom Domain

If you control the domain where your Linkding is hosted, you can deploy Pocket Ding to a subdomain (e.g., `reader.yourdomain.com`) to avoid CORS entirely. See the main README for Cloudflare Pages setup instructions.