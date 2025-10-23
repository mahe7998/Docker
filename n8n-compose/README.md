# n8n-compose

Production-ready n8n workflow automation deployment with Docker Compose, Traefik reverse proxy, and Tailscale for automatic HTTPS certificates.

## Features

- **Secure Access**: HTTPS-enabled n8n accessible via Tailscale private network
- **Zero Configuration SSL**: Automatic certificate provisioning and renewal via Tailscale
- **Production Ready**: Traefik reverse proxy with security headers
- **Persistent Data**: Workflow data and configurations preserved across restarts
- **Local File Sharing**: Host directory mounted for file operations
- **Automated Recovery**: Scripts for common troubleshooting scenarios

## Quick Start

### Prerequisites

1. **Tailscale Account**: Sign up at https://tailscale.com
2. **Docker & Docker Compose**: Installed on your system

### Initial Setup

1. **Clone this repository**
   ```bash
   git clone <repository-url>
   cd n8n-compose
   ```

2. **Generate Tailscale auth key**
   - Visit https://login.tailscale.com/admin/settings/keys
   - Create a new auth key with:
     - ✅ **Reusable** (recommended)
     - ❌ **Ephemeral** (uncheck this)
   - Copy the generated key

3. **Configure environment**
   ```bash
   cp .env.example .env
   # Edit .env and set TS_AUTHKEY=tskey-auth-...
   ```

4. **Enable MagicDNS**
   - Go to https://login.tailscale.com/admin/dns
   - Enable MagicDNS

5. **Enable HTTPS Certificates**
   - In the same DNS settings page
   - Scroll to "HTTPS Certificates"
   - Click "Enable HTTPS"
   - ⚠️ This publishes machine names in Certificate Transparency logs

6. **Start the services**
   ```bash
   docker-compose up -d
   ```

7. **Access n8n**
   - From any device on your Tailscale network
   - Visit: `https://n8n.tail60cd1d.ts.net` (replace with your domain)
   - ⚠️ Cannot access from the host Mac (use other Tailscale devices)
   - For local testing: `http://localhost:5678`

## Architecture

### Services

```
┌─────────────────────────────────────────────────┐
│                  Tailscale                      │
│  - Runs in Docker sidecar container            │
│  - Provides VPN connectivity to tailnet        │
│  - Provisions HTTPS certificates               │
│  - Exposes ports 80 & 443                      │
└────────────┬────────────────────────────────────┘
             │ (shared network stack)
┌────────────┴────────────────────────────────────┐
│                  Traefik                        │
│  - Reverse proxy with automatic HTTPS          │
│  - Native Tailscale certificate resolver       │
│  - HTTP to HTTPS redirects                     │
│  - Security headers (HSTS, XSS protection)     │
└────────────┬────────────────────────────────────┘
             │ (proxies to)
┌────────────┴────────────────────────────────────┐
│                    n8n                          │
│  - Workflow automation platform                │
│  - Persistent data storage                     │
│  - Local file sharing enabled                  │
│  - Runners enabled for workflow execution      │
└─────────────────────────────────────────────────┘
```

### Network Architecture

- **Traefik** uses `network_mode: service:tailscale` to share Tailscale's network stack
- This allows Traefik to bind directly to the Tailscale network interface
- Ports 80 and 443 are exposed on the Tailscale container
- Traefik accesses certificates via shared volume mount (`tailscale_run`)

## Common Commands

```bash
# Start all services
docker-compose up -d

# Stop all services
docker-compose down

# View logs
docker-compose logs -f n8n
docker-compose logs -f traefik
docker-compose logs -f tailscale

# Check Tailscale connection status
docker-compose exec tailscale tailscale status

# Test certificate provisioning
docker-compose exec tailscale tailscale cert n8n.tail60cd1d.ts.net

# Restart a specific service
docker-compose restart n8n

# Check service status
docker-compose ps
```

## Recovery Scripts

Two automated scripts handle common recovery scenarios:

### Full Tailscale Recovery
```bash
./recover-tailscale.sh
```

**When to use:**
- Can't ping or access your n8n domain
- Tailscale logs show "404: node not found"
- Node was deleted from Tailscale admin console
- After auth key expiration

**What it does:**
- Stops all services
- Clears old Tailscale state
- Re-authenticates with your tailnet
- Tests connectivity and certificates
- Shows detailed status

### Certificate Refresh
```bash
./refresh-certificates.sh
```

**When to use:**
- Tailscale is connected but HTTPS doesn't work
- Certificate errors in Traefik logs
- After enabling HTTPS certificates for the first time
- After Tailscale account changes

**What it does:**
- Guides you through disable/enable HTTPS in Tailscale admin
- Restarts necessary services
- Tests certificate provisioning
- Verifies HTTPS is working

## Troubleshooting

For detailed troubleshooting, see [TROUBLESHOOTING.md](TROUBLESHOOTING.md).

### Quick Diagnostics

1. **Check all services are running:**
   ```bash
   docker-compose ps
   ```
   All should show "Up" status.

2. **Verify Tailscale connection:**
   ```bash
   docker-compose exec tailscale tailscale status
   ```
   Should show the `n8n` node with an IP address.

3. **Test certificates:**
   ```bash
   docker-compose exec tailscale tailscale cert n8n.tail60cd1d.ts.net
   ```
   Should output certificate and key file paths.

4. **Check for errors:**
   ```bash
   docker-compose logs tailscale | grep -i error
   docker-compose logs traefik | grep -i error
   ```

### Common Issues

| Issue | Solution |
|-------|----------|
| Can't ping domain | Run `./recover-tailscale.sh` |
| "Node not found" error | Run `./recover-tailscale.sh` |
| Certificate errors | Run `./refresh-certificates.sh` |
| HTTPS not working | Run `./refresh-certificates.sh` |
| Can't access from host Mac | This is expected - use other Tailscale devices or `http://localhost:5678` |

## Configuration

### Environment Variables (.env)

```bash
# Tailscale domain name (machine.tailnet.ts.net format)
DOMAIN_NAME=n8n.tail60cd1d.ts.net

# No subdomain for Tailscale machine names
SUBDOMAIN=

# Timezone for cron and scheduling nodes
GENERIC_TIMEZONE=America/New York

# Tailscale authentication key (reusable, non-ephemeral)
TS_AUTHKEY=tskey-auth-...
```

### Volumes

- `n8n_data`: Persistent workflow data and configurations
- `tailscale_state`: Tailscale daemon state (authentication, config)
- `tailscale_run`: Shared socket directory for Traefik communication
- `./local-files`: Host directory mounted to `/files` in n8n

### Ports

- **80**: HTTP (auto-redirects to HTTPS)
- **443**: HTTPS
- **5678**: n8n (localhost only)
- **8080**: Traefik dashboard (internal network only)

## Security Considerations

- n8n is **only accessible via your private Tailscale network**
- HTTPS enforced with automatic certificate management
- Security headers enabled (HSTS, XSS protection, etc.)
- Traefik dashboard exposed only on internal network
- Machine names published in Certificate Transparency logs (Tailscale requirement)

## Data Persistence

All important data is persisted in Docker volumes:
- **n8n workflows**: Stored in `n8n_data` volume
- **Tailscale state**: Stored in `tailscale_state` volume
- **Local files**: Available in `./local-files` directory

To backup your workflows:
```bash
docker-compose exec n8n n8n export:workflow --all --output=/files/backup.json
```

## Updating

```bash
# Pull latest images
docker-compose pull

# Restart with new images
docker-compose up -d

# Clean up old images
docker image prune
```

## Limitations

- **Host Mac Access**: Cannot access n8n from the host Mac running the containers (Tailscale network conflict). Use other devices on your Tailscale network, or access via `http://localhost:5678`.
- **Certificate Refresh**: Some Tailscale account changes require manually toggling HTTPS certificates (use `./refresh-certificates.sh`).
- **Single Node**: This setup runs a single n8n instance (no clustering/HA).

## Links

- [n8n Documentation](https://docs.n8n.io/)
- [Tailscale Documentation](https://tailscale.com/kb/)
- [Traefik Documentation](https://doc.traefik.io/traefik/)
- [Troubleshooting Guide](TROUBLESHOOTING.md)
- [Project Configuration](CLAUDE.md)

## License

[Your License Here]

## Contributing

[Your Contributing Guidelines Here]
