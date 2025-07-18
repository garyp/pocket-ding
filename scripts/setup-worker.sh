#!/bin/bash

# Pocket Ding Worker Setup Script
# This script automates the setup and deployment of the Cloudflare Worker

set -e

echo "🚀 Setting up Pocket Ding CORS Proxy Worker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if wrangler is installed
if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Installing Wrangler CLI...${NC}"
    npm install -g wrangler
fi

# Setup worker dependencies
echo -e "${YELLOW}Installing worker dependencies...${NC}"
npm run worker:setup

# Check if user is logged in
cd worker
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Please login to Cloudflare:${NC}"
    npm run login
fi

# Deploy the worker
echo -e "${YELLOW}Deploying worker to production...${NC}"
npm run deploy

# Get the worker URL
echo -e "${GREEN}✅ Worker deployed successfully!${NC}"
echo -e "${YELLOW}Your worker URL is:${NC} https://pocket-ding-proxy.$(wrangler whoami | grep -oP '(?<=Account ID: ).*' | tr -d ' ').workers.dev"

echo ""
echo -e "${GREEN}Next steps:${NC}"
echo "1. Copy the worker URL above"
echo "2. Add it to your GitHub repository secrets as VITE_CORS_PROXY_URL"
echo "3. Push changes to deploy your updated Pocket Ding app"
echo ""
echo -e "${YELLOW}For local development, create a .env file with:${NC}"
echo "VITE_CORS_PROXY_URL=https://pocket-ding-proxy.your-subdomain.workers.dev"