# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a production-ready n8n deployment using Docker Compose with Traefik reverse proxy and Tailscale for automatic HTTPS certificates. The setup provides a secure, SSL-enabled n8n workflow automation instance accessible via Tailscale MagicDNS on your private tailnet.

## Prerequisites

Before starting:
1. **Generate a Tailscale auth key** at https://login.tailscale.com/admin/settings/keys
   - Uncheck "Ephemeral" for persistent containers
   - Consider making it "Reusable" if you'll recreate containers
2. **Add the auth key to `.env`**: Set `TS_AUTHKEY=tskey-auth-...`
3. **Enable MagicDNS** in your Tailscale admin console (DNS settings)
4. **Enable HTTPS certificates** in Tailscale admin console (DNS > HTTPS Certificates > Enable HTTPS)

## Common Commands

```bash
# Start all services (Tailscale + Traefik + n8n)
docker-compose up -d

# Stop the services
docker-compose down

# View logs
docker-compose logs -f n8n
docker-compose logs -f traefik
docker-compose logs -f tailscale

# Check if Tailscale container is connected
docker-compose exec tailscale tailscale status

# Restart a specific service
docker-compose restart n8n

# Rebuild and restart (if compose file changes)
docker-compose up -d --force-recreate

# Check service status
docker-compose ps
```

## Recovery Scripts

Two automated scripts are available for common recovery scenarios:

### 1. Full Tailscale Recovery (`./recover-tailscale.sh`)
Use when the Tailscale node has been disconnected from your tailnet (e.g., "404: node not found" errors).

**What it does:**
- Stops all services
- Clears old Tailscale state volume
- Restarts services with fresh authentication
- Waits for connection and tests certificate provisioning
- Shows status and connection info

**When to use:**
- Can't ping `n8n.tail60cd1d.ts.net`
- Tailscale logs show "node not found" errors
- Node was deleted from Tailscale admin console
- After auth key expiration

```bash
./recover-tailscale.sh
```

### 2. Certificate Refresh (`./refresh-certificates.sh`)
Use when HTTPS certificates are not working but Tailscale is connected.

**What it does:**
- Guides you through disabling/re-enabling HTTPS in Tailscale admin
- Restarts Tailscale and Traefik containers
- Tests certificate provisioning
- Shows service status

**When to use:**
- Getting certificate errors in Traefik logs
- HTTPS not working but node is connected
- After enabling HTTPS certificates for the first time
- Certificate issues after Tailscale account changes

```bash
./refresh-certificates.sh
```

**Note:** Some Tailscale account changes require disabling and re-enabling HTTPS certificates in the admin console to refresh the certificate capability for nodes.

## Architecture

### Three-Service Stack

**Tailscale (Sidecar Container)**
- Runs Tailscale daemon in a Docker container
- Connects this docker-compose stack to your tailnet
- Provides certificate provisioning for Traefik
- Socket shared via `tailscale_run` volume
- State persisted in `tailscale_state` volume
- Uses `TS_AUTHKEY` for authentication

**Traefik (Reverse Proxy)**
- Handles HTTP to HTTPS redirects (port 80 → 443)
- **Tailscale native certificate resolver** - automatically fetches and renews certificates from Tailscale sidecar
- Routes traffic to n8n based on host rules
- Mounts Tailscale socket from shared volume for certificate access
- No manual certificate management required

**n8n (Workflow Automation)**
- Official n8n Docker image
- Exposed locally on 127.0.0.1:5678
- Tailscale access via Traefik with automatic HTTPS
- Persistent data in `n8n_data` volume
- Local file sharing via `./local-files:/files` mount
- Runners enabled for workflow execution

### Traefik + Tailscale Integration

Traefik 3.0+ has native Tailscale support via the `tailscale` certificate resolver:
- **Certificate resolver**: `--certificatesresolvers.tailscale.tailscale=true`
- **Socket mount**: Traefik reads certificates directly from local Tailscale daemon
- **Automatic renewal**: Traefik tracks expiry and renews 14 days before expiration
- **Zero configuration**: No ACME challenges or external endpoints required

n8n routing configuration:
- Host-based routing: `n8n.tail60cd1d.ts.net`
- Automatic HTTPS with forced redirects
- Security headers: HSTS, XSS protection, content-type nosniff
- TLS certificate resolver: `tailscale`

### Network Architecture

**Sidecar with Shared Network Stack**:
- Traefik uses `network_mode: service:tailscale` to share Tailscale's network
- This allows Traefik to bind to the Tailscale network interface directly
- Ports 80 and 443 are exposed on the Tailscale container
- Traefik accesses the Tailscale socket via shared volume

### Environment Configuration

All configuration is in `.env`:
- `DOMAIN_NAME`: Tailscale hostname (e.g., `n8n.tail60cd1d.ts.net`)
- `SUBDOMAIN`: Must be empty for Tailscale (no subdomain support on machine names)
- `GENERIC_TIMEZONE`: Timezone for cron/scheduling nodes
- `TS_AUTHKEY`: Tailscale authentication key for the sidecar container

**Access URL**: `https://n8n.tail60cd1d.ts.net`

**Important Notes**:
- Access n8n from **other devices on your Tailscale network** (not from the host Mac)
- The Tailscale container uses hostname `n8n` to avoid conflicts with the host Mac's Tailscale
- Traefik uses `network_mode: service:tailscale` to share the Tailscale network stack
- This allows Traefik to serve HTTPS directly on the Tailscale network interface

### Volume Management

- `n8n_data`: Persistent workflow data and configurations
- `tailscale_state`: Tailscale daemon state (auth, config)
- `tailscale_run`: Shared socket directory for Traefik communication
- `./local-files`: Host directory mounted to `/files` in n8n for file operations

## Configuration Notes

- n8n runs in production mode (`NODE_ENV=production`)
- Webhook URL matches the Tailscale HTTPS endpoint
- File permissions enforcement enabled (`N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true`)
- Traefik API exposed insecurely on the internal network (dashboard access on port 8080)

## Tailscale Requirements

**Important**: This setup uses Tailscale in a Docker sidecar container:

1. **Enable MagicDNS**: Visit your [Tailscale admin console](https://login.tailscale.com/admin/dns) and enable MagicDNS
2. **Enable HTTPS Certificates**: In the DNS settings, navigate to HTTPS Certificates and click "Enable HTTPS"
3. **Generate Auth Key**: Create a non-ephemeral, optionally reusable auth key at https://login.tailscale.com/admin/settings/keys
4. **Privacy Note**: Enabling HTTPS will publish your machine names in Certificate Transparency logs (public ledger)

**Sidecar Architecture**:
- Tailscale runs as a separate container (not on host system)
- The container appears as a node on your tailnet: `n8n.tail60cd1d.ts.net`
- Custom hostname `n8n` is set via `TS_HOSTNAME` to avoid conflicts with host Mac
- Traefik shares Tailscale's network stack via `network_mode: service:tailscale`
- Traefik accesses certificates via shared volume (`tailscale_run`)
- State is persisted in `tailscale_state`, so the container maintains its identity across restarts

**Certificate Management**:
- Tailscale handles certificate provisioning automatically via Let's Encrypt
- Traefik fetches certificates from the Tailscale sidecar (no separate renewal needed)
- Certificates are valid for 90 days and automatically renewed by Tailscale
- Traefik monitors certificate expiry and refreshes 14 days before expiration
