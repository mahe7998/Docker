#!/bin/bash

# Tailscale N8N Recovery Script
# This script automates the process of recovering the Tailscale connection
# and refreshing HTTPS certificates when the node gets disconnected

set -e  # Exit on error

echo "========================================="
echo "Tailscale N8N Recovery Script"
echo "========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "docker-compose.yml" ]; then
    echo "Error: docker-compose.yml not found. Please run this script from the n8n-compose directory."
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "Error: .env file not found. Please ensure .env exists with TS_AUTHKEY configured."
    exit 1
fi

# Step 1: Stop all services
echo "Step 1: Stopping all services..."
docker-compose down
echo "✓ Services stopped"
echo ""

# Step 2: Remove old Tailscale state
echo "Step 2: Removing old Tailscale state volume..."
docker volume rm n8n-compose_tailscale_state 2>/dev/null || echo "Volume already removed or doesn't exist"
echo "✓ Tailscale state cleared"
echo ""

# Step 3: Start services
echo "Step 3: Starting all services..."
docker-compose up -d
echo "✓ Services started"
echo ""

# Step 4: Wait for Tailscale to connect
echo "Step 4: Waiting for Tailscale to connect..."
sleep 5

# Check connection status
MAX_RETRIES=30
RETRY_COUNT=0
while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
    if docker-compose exec -T tailscale tailscale status >/dev/null 2>&1; then
        echo "✓ Tailscale connected successfully"
        break
    fi
    echo "Waiting for Tailscale... ($((RETRY_COUNT+1))/$MAX_RETRIES)"
    sleep 2
    RETRY_COUNT=$((RETRY_COUNT+1))
done

if [ $RETRY_COUNT -eq $MAX_RETRIES ]; then
    echo "❌ Tailscale failed to connect after $MAX_RETRIES attempts"
    echo "Please check the logs: docker-compose logs tailscale"
    exit 1
fi
echo ""

# Step 5: Test certificate provisioning
echo "Step 5: Testing certificate provisioning..."
DOMAIN_NAME=$(grep "^DOMAIN_NAME=" .env | cut -d'=' -f2)

if [ -z "$DOMAIN_NAME" ]; then
    echo "Warning: Could not find DOMAIN_NAME in .env file"
    DOMAIN_NAME="n8n.tail60cd1d.ts.net"
    echo "Using default: $DOMAIN_NAME"
fi

# Wait a bit for Tailscale to fully initialize
sleep 3

# Test certificate fetch
if docker-compose exec -T tailscale tailscale cert "$DOMAIN_NAME" 2>&1 | grep -q "Wrote public cert"; then
    echo "✓ Certificates provisioned successfully"
else
    echo "⚠ Certificate provisioning may have failed"
    echo "If you see 'your Tailscale account does not support getting TLS certs', please:"
    echo "  1. Go to https://login.tailscale.com/admin/dns"
    echo "  2. Enable HTTPS certificates"
    echo "  3. Run this script again"
    echo ""
    echo "Note: You may need to disable and re-enable HTTPS certificates in Tailscale admin"
    echo "to refresh the certificate capability for this node."
fi
echo ""

# Step 6: Verify services
echo "Step 6: Verifying all services..."
docker-compose ps
echo ""

# Step 7: Show connection info
echo "========================================="
echo "Recovery Complete!"
echo "========================================="
echo ""
echo "Tailscale Status:"
docker-compose exec -T tailscale tailscale status | head -5
echo ""
echo "Access n8n at: https://$DOMAIN_NAME"
echo ""
echo "To view logs:"
echo "  docker-compose logs -f tailscale"
echo "  docker-compose logs -f traefik"
echo "  docker-compose logs -f n8n"
echo ""
