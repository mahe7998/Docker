#!/bin/bash

# Certificate Refresh Script
# This script helps refresh Tailscale HTTPS certificates when they're not working
# It provides instructions and automates the container restart process

set -e

echo "========================================="
echo "Tailscale Certificate Refresh"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found. Please run this script from the n8n-compose directory."
    exit 1
fi

# Get domain name
DOMAIN_NAME=$(grep "^DOMAIN_NAME=" .env | cut -d'=' -f2 2>/dev/null || echo "n8n.tail60cd1d.ts.net")

echo "This script will help you refresh HTTPS certificates for: $DOMAIN_NAME"
echo ""
echo "IMPORTANT: Before continuing, please follow these steps:"
echo ""
echo "1. Open Tailscale Admin Console: https://login.tailscale.com/admin/dns"
echo "2. Scroll to 'HTTPS Certificates' section"
echo "3. Click 'Disable HTTPS' (if currently enabled)"
echo "4. Wait 5 seconds"
echo "5. Click 'Enable HTTPS' again"
echo ""
read -p "Have you completed the above steps? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please complete the steps above and run this script again."
    exit 1
fi

echo ""
echo "Restarting Tailscale and Traefik to fetch new certificates..."
echo ""

# Method 1: Try to restart just Tailscale and Traefik
echo "Attempting graceful restart..."
if docker-compose restart tailscale traefik 2>/dev/null; then
    echo "✓ Services restarted successfully"
else
    echo "Graceful restart failed, performing full restart..."
    docker-compose down
    docker-compose up -d
fi

echo ""
echo "Waiting for services to initialize..."
sleep 8

# Test certificate
echo ""
echo "Testing certificate provisioning..."
if docker-compose exec -T tailscale tailscale cert "$DOMAIN_NAME" 2>&1 | grep -q "Wrote public cert"; then
    echo "✓ Certificates are working!"
    echo ""
    echo "You can now access n8n at: https://$DOMAIN_NAME"
else
    echo "❌ Certificate provisioning failed"
    echo ""
    echo "Please check:"
    echo "1. HTTPS certificates are enabled in Tailscale admin console"
    echo "2. The node 'n8n' appears in your Tailscale machines list"
    echo "3. Check logs: docker-compose logs tailscale | grep cert"
    echo ""
    echo "If the issue persists, try running: ./recover-tailscale.sh"
fi

echo ""
echo "Service status:"
docker-compose ps

echo ""
