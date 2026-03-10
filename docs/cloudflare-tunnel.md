# Cloudflare Tunnel Domain Setup

This project supports domain-based operation behind Cloudflare Tunnel without code changes.

## App Environment
Set in `.env`:

```bash
PUBLIC_WEB_URL=https://docforge.yourdomain.com
PUBLIC_API_URL=https://docforge.yourdomain.com/api
ALLOWED_ORIGINS=https://docforge.yourdomain.com
TRUST_PROXY=true
```

Then restart:

```bash
docker compose up --build -d
```

## Tunnel Routing Pattern
If you route one hostname to the web UI container and let it proxy `/api` to the API service:

- `https://docforge.yourdomain.com` -> `http://<docker-host-ip>:49261`

No second public API hostname is required.

## Optional Split Hostnames
If you expose API separately:

- `https://docforge.yourdomain.com` -> `http://<docker-host-ip>:49261`
- `https://api-docforge.yourdomain.com` -> `http://<docker-host-ip>:48080`

Then set:

```bash
PUBLIC_API_URL=https://api-docforge.yourdomain.com
ALLOWED_ORIGINS=https://docforge.yourdomain.com,https://api-docforge.yourdomain.com
```

## OAuth Note
Google OAuth JavaScript origins must include your tunnel domain, e.g.:
- `https://docforge.yourdomain.com`
Google OAuth redirect URI should be:
- `https://docforge.yourdomain.com/api/auth/google/callback`

Apple OAuth (when enabled) will require this domain to be registered as well.
