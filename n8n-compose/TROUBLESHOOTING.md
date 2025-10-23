# Troubleshooting Guide for n8n-compose

## Common Issues and Solutions

### Issue 1: Can't ping or access n8n.tail60cd1d.ts.net

**Symptoms:**
- Ping fails or times out
- Tailscale logs show "404: node not found"
- Error: `PollNetMap: initial fetch failed 404: node not found`

**Cause:**
The Tailscale node was removed from your tailnet (manually deleted or auth key expired).

**Solution:**
Run the full recovery script:
```bash
./recover-tailscale.sh
```

This will:
1. Stop all services
2. Clear the old Tailscale state
3. Re-authenticate with your tailnet
4. Verify connectivity and certificates

---

### Issue 2: HTTPS certificates not working

**Symptoms:**
- Tailscale is connected (ping works)
- Can't access via HTTPS
- Traefik logs show certificate errors like:
  - `Unable to fetch certificate for domain "n8n.tail60cd1d.ts.net"`
  - `unexpected output: no delimiter`
- Tailscale logs show:
  - `your Tailscale account does not support getting TLS certs`

**Cause:**
HTTPS certificates are not enabled in your Tailscale account, or need to be refreshed.

**Solution:**

**First time setup:**
1. Go to https://login.tailscale.com/admin/dns
2. Scroll to "HTTPS Certificates" section
3. Click "Enable HTTPS"
4. Run the certificate refresh script:
```bash
./refresh-certificates.sh
```

**If certificates were already enabled but stopped working:**
1. Run the certificate refresh script (it will guide you):
```bash
./refresh-certificates.sh
```
2. Follow the prompts to disable and re-enable HTTPS certificates
3. The script will restart services and verify certificates

**Note:** Some Tailscale account changes require toggling HTTPS certificates to refresh the capability.

---

### Issue 3: Services won't restart properly

**Symptoms:**
- `docker-compose restart` fails
- Error: `cannot join network of a non running container`

**Cause:**
Network state issues when restarting containers that share network stack.

**Solution:**
Do a full restart instead of a service restart:
```bash
docker-compose down
docker-compose up -d
```

Or use the recovery script:
```bash
./recover-tailscale.sh
```

---

### Issue 4: Verifying everything is working

**Quick checks:**

1. **Service status:**
```bash
docker-compose ps
```
All services should show "Up" status.

2. **Tailscale connection:**
```bash
docker-compose exec tailscale tailscale status
```
Should show the `n8n` node with an IP address.

3. **Certificate test:**
```bash
docker-compose exec tailscale tailscale cert n8n.tail60cd1d.ts.net
```
Should output:
```
Wrote public cert to n8n.tail60cd1d.ts.net.crt
Wrote private key to n8n.tail60cd1d.ts.net.key
```

4. **Check logs for errors:**
```bash
docker-compose logs tailscale | grep -i error
docker-compose logs traefik | grep -i error
```

5. **Test access:**
From another device on your Tailscale network:
```
https://n8n.tail60cd1d.ts.net
```

---

## Understanding the Setup

### Why can't I access from the host Mac?

The Tailscale container runs with hostname `n8n` to avoid conflicts with the host Mac's Tailscale daemon. Access n8n from **other devices** on your Tailscale network, not from the host Mac itself.

**Workaround for local access:**
Use the local port: `http://localhost:5678`

### Why do I need to toggle HTTPS certificates?

When nodes are added, removed, or re-authenticated in Tailscale, sometimes the certificate provisioning capability needs to be refreshed at the account level. Disabling and re-enabling HTTPS certificates in the Tailscale admin console triggers this refresh.

### What if I deleted the node from Tailscale admin?

Run the full recovery script: `./recover-tailscale.sh`

This clears the old state and re-authenticates the node with your tailnet.

---

## Quick Reference

| Problem | Script to Run |
|---------|---------------|
| Can't ping domain | `./recover-tailscale.sh` |
| Node not found error | `./recover-tailscale.sh` |
| Certificate errors | `./refresh-certificates.sh` |
| HTTPS not working | `./refresh-certificates.sh` |
| General issues | `./recover-tailscale.sh` |

---

## Manual Recovery Steps

If the scripts don't work, here are the manual steps:

### Full Manual Recovery:
```bash
# 1. Stop everything
docker-compose down

# 2. Remove old Tailscale state
docker volume rm n8n-compose_tailscale_state

# 3. Verify HTTPS certificates enabled in Tailscale admin
# Go to: https://login.tailscale.com/admin/dns
# Enable HTTPS certificates if needed

# 4. Start everything
docker-compose up -d

# 5. Wait for initialization
sleep 10

# 6. Verify connection
docker-compose exec tailscale tailscale status

# 7. Test certificates
docker-compose exec tailscale tailscale cert n8n.tail60cd1d.ts.net
```

---

## Getting Help

If issues persist:

1. **Check logs:**
```bash
docker-compose logs tailscale
docker-compose logs traefik
docker-compose logs n8n
```

2. **Verify prerequisites:**
   - MagicDNS enabled in Tailscale
   - HTTPS certificates enabled in Tailscale
   - Valid `TS_AUTHKEY` in `.env` file
   - Auth key is non-ephemeral and reusable

3. **Check Tailscale admin console:**
   - https://login.tailscale.com/admin/machines
   - Verify the `n8n` node appears and is connected
