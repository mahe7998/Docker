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

## Whisper Transcription Service

The whisper-backend runs natively on the host Mac (not in Docker) for MLX Apple Silicon GPU acceleration. The frontend runs in Docker and proxies to the host.

**Backend Location**: `~/projects/python/mlx_whisper/` (separate git repository)

**NOTE**: The Docker-based whisper-backend (`whisper-project/whisper-backend/`) was removed as it's no longer used. All backend code is in the mlx_whisper project for Apple Silicon GPU acceleration.

### Features

**Recording & Transcription:**
- **Real-time streaming transcription** via WebSocket with sliding window approach
- **Start/Stop/Restart recording** - Multiple recordings in same session supported
- **Audio concatenation** - Resume and append to previous recordings
- **Model selection** - Choose from whisper-tiny, base, small, medium, large-v3, turbo models
- **Language selection** - Force a specific language or auto-detect (50+ languages)
- **Stereo channel selection** - Transcribe left, right, or both channels

**Audio Playback:**
- **Live audio visualization** - Waveform display during recording
- **Audio player** - Play back recorded audio with seek, pause, duration display
- **Previous transcription playback** - Load and play audio from saved transcriptions

**Transcription Management:**
- **Save/Load transcriptions** - PostgreSQL storage with full CRUD operations
- **Unsaved changes warning** - Confirmation dialog when switching with unsaved work
- **Transcription selector** - Dropdown to load previous transcriptions
- **AI review** - Grammar correction, rephrasing, text improvement via Ollama
- **Ollama model selection** - Choose from available models (thinking models auto-filtered)
- **Settings persistence** - Language and model preferences saved in localStorage

**Editor:**
- **TipTap rich text editor** - Markdown editing with live preview
- **Auto-scroll** - Editor follows new transcription text during recording

### Restarting Whisper Backend

**IMPORTANT**: The whisper backend requires the `WHISPER_DB_PASSWORD` environment variable to connect to the database. When restarting, ensure this variable is set:

```bash
# Kill existing process
pkill -f "uvicorn app.main:app.*8000"

# Restart with proper environment (from n8n-compose directory)
cd ~/projects/python/mlx_whisper && source venv/bin/activate && \
  WHISPER_DB_PASSWORD="$WHISPER_DB_PASSWORD" \
  DATABASE_URL="postgresql+asyncpg://whisper:${WHISPER_DB_PASSWORD}@localhost:5432/whisper" \
  nohup uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload > /tmp/whisper_backend.log 2>&1 &

# Also restart whisper-db if needed
docker-compose restart whisper-db
```

### Troubleshooting "Failed to load transcriptions"

If the web app shows "Failed to load transcriptions":
1. Check if backend is running: `curl http://localhost:8000/health`
2. If you see `[Errno 8] nodename nor servname provided` in logs, the `WHISPER_DB_PASSWORD` env var is missing
3. Restart the backend with the proper environment as shown above
4. May also need to restart `whisper-db`: `docker-compose restart whisper-db`

### Rebuilding Frontend After Code Changes

**IMPORTANT**: When making changes to the whisper-frontend React code, a simple `docker-compose restart` is NOT sufficient. The frontend is built during the Docker image build process, so you MUST rebuild with `--no-cache`:

```bash
# ALWAYS use --no-cache when updating frontend code
docker-compose build --no-cache whisper-frontend && docker-compose up -d whisper-frontend
```

After rebuilding, users should also clear their browser cache or do a hard refresh (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows/Linux) to load the new JavaScript bundle.

**Why --no-cache is required**: Docker may cache the `COPY . .` layer if file timestamps haven't changed significantly, resulting in stale code being served even after edits.

## Development Guidelines

### Error Handling Philosophy

**IMPORTANT**: When encountering errors or warnings, do NOT try to hide or suppress them unless you can confirm online that this is a known issue in a third-party library we do not control. Always investigate and fix the root cause:

1. **Investigate first** - Trace the error to understand what's actually happening
2. **Fix the root cause** - Don't suppress warnings or add workarounds that mask the real problem
3. **Only suppress if confirmed** - Only suppress warnings if you can verify online that it's a known library issue with no fix available
4. **Document suppressions** - If suppression is truly necessary, document why and link to the relevant issue

Hiding errors is a recipe for failures that are hard to debug later.
