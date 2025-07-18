# Pocket Ding CORS Proxy Worker

This Cloudflare Worker provides CORS proxy functionality for Pocket Ding, allowing the app to communicate with Linkding servers without CORS restrictions.

## Quick Start

1. **Install Wrangler** (if not already installed):
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   npm run login
   ```

3. **Deploy to production**:
   ```bash
   npm run deploy
   ```

4. **Get your worker URL**:
   After deployment, note the URL (e.g., `https://pocket-ding-proxy.your-subdomain.workers.dev`)

## Commands

- `npm run dev` - Start local development server
- `npm run deploy` - Deploy to production
- `npm run deploy:dev` - Deploy to development environment
- `npm run tail` - View real-time logs
- `npm run whoami` - Check current Cloudflare account
- `npm run login` - Login to Cloudflare
- `npm run logout` - Logout from Cloudflare

## Configuration

The worker is configured via `wrangler.toml`:

- **Production**: `pocket-ding-proxy` (main worker)
- **Development**: `pocket-ding-proxy-dev` (testing)

## Security Features

- Only allows HTTPS Linkding API endpoints
- Validates URL patterns to prevent abuse
- Adds proper CORS headers
- Includes request logging for debugging

## Monitoring

View logs in real-time:
```bash
npm run tail
```

Or check the Cloudflare dashboard for analytics and error tracking.

## Custom Domain (Optional)

To use a custom domain:
1. Add your domain to Cloudflare
2. Uncomment the `[env.production.route]` section in `wrangler.toml`
3. Update the pattern and zone_name
4. Redeploy: `npm run deploy`

## Environment Variables

Set secrets using Wrangler:
```bash
wrangler secret put SECRET_NAME --env production
```

## Troubleshooting

**Permission Denied**: Make sure you're logged in with `npm run login`

**Deploy Failed**: Check your account has Workers enabled and within limits

**Worker Not Found**: Verify the worker name in `wrangler.toml` matches your deployment