# DocForge Local
[![Node.js](https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-7-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Google OAuth](https://img.shields.io/badge/Auth-Google%20OAuth-4285F4?logo=google&logoColor=white)](https://developers.google.com/identity/protocols/oauth2)
[![Cloudflare Tunnel](https://img.shields.io/badge/Cloudflare-Tunnel-F38020?logo=cloudflare&logoColor=white)](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

Self-hosted document ingestion and retrieval platform designed for RAG workflows.

## Features
- Google OAuth authentication
- Strict per-user data isolation (sources, docs, chunks, highlights, jobs)
- User-defined artifact tagging (documents + highlights)
- True document store: original ingested files persisted per-user on server storage
- Smart ingestion
- Folder and Git-oriented source registration (Git sync scaffolded)
- Kindle highlights ingestion (`My Clippings.txt`)
- Web article clipping and URL import
- OneNote source type scaffold
- Highlight aggregation (Readwise-like)
- MongoDB document storage
- RAG-optimized chunking
- Deterministic embedding pipeline (local)
- Hybrid semantic + keyword search

## Services
- `mongodb`: data store
- `api`: source/document/highlight/search APIs and ingestion engine
- `source-manager`: periodic source scan trigger
- `ingestion-worker`: periodic ingestion job processor
- `embedding-worker`: retries missing embeddings
- `scheduler`: retries failed jobs and reconciles sources
- `web-ui`: browser UI (Sources, Documents, Highlights, Search, Admin)
  - Includes in-app Help section for OneNote/Kindle/Web import and extension setup

## Browser Extension
- Location: `browser-extension/docforge-clipper`
- Type: Manifest V3 extension for Chromium-compatible browsers
- Purpose: capture selected text (or page excerpt) and send directly to `POST /clip`
- Auth note: `/clip` is authenticated; provide a DocForge app token in extension settings.
- Extension files are also served from the web app at `/extension/*`.

### Install Extension (Chromium)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `browser-extension/docforge-clipper`
5. Set API URL in extension popup to `http://localhost:48080`
6. Paste a valid DocForge app token in extension popup
7. Select text on any page and click `Capture Selection`

## OAuth Setup
Google OAuth is enabled for sign-in and user-level data segregation.

1. Create OAuth client in Google Cloud Console:
- Type: `Web application`
- Authorized JavaScript origins:
  - `https://docs.my-ai.tech` (or your public domain)
  - `http://localhost:49261`
- Authorized redirect URIs:
  - `https://docs.my-ai.tech/api/auth/google/callback` (or your public domain callback)
  - `http://localhost:48080/auth/google/callback` (optional local testing)
2. Put OAuth values in `.env`:
```bash
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=https://docs.my-ai.tech/api/auth/google/callback
```
3. Bootstrap generated platform secrets and deploy:
```bash
./scripts/deploy.sh
```

### Apple OAuth status
- Endpoint scaffold exists: `POST /auth/apple`
- Current response is `501` until Apple web credentials are configured.
- Required setup: Apple Services ID, key ID, team ID, private key, domain/return URL registration for Sign in with Apple web flow.

## Cloudflare Tunnel Domain Support
The app now supports domain-based access behind Cloudflare Tunnel.

Set these in `.env`:
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

If your tunnel routes API on a separate domain, include both origins:
```bash
ALLOWED_ORIGINS=https://docforge.yourdomain.com,https://api-docforge.yourdomain.com
```

## Quick Start
1. Copy env values if needed:
```bash
cp .env.example .env
```
2. Set required Google OAuth values in `.env`:
```bash
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://your-domain/api/auth/google/callback
```
3. Build/start with generated internal secrets:
```bash
./scripts/deploy.sh
```
4. Open the app on host port `49261`:
- http://localhost:49261

Optional API access:
- http://localhost:48080/health

## Core API Endpoints
- `GET /auth/config`
- `POST /auth/google`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/me`
- `POST /auth/apple` (scaffolded)
- `GET /sources`
- `POST /sources`
- `GET /documents`
- `GET /documents/:id`
- `GET /documents/:id/original`
- `GET /highlights`
- `POST /highlights`
- `POST /search`
- `GET /artifacts/by-tag`
- `POST /documents/:id/tags`
- `POST /highlights/:id/tags`
- `POST /reindex`
- `POST /clip`
- `POST /import-url`

## Notes
- All user data reads/writes are scoped by authenticated `userId`.
- Authenticated user A cannot enumerate or infer user B data through API responses.
- Original ingested artifact files are stored at `DOCUMENT_STORE_ROOT` in user-scoped directories.
- `source.type = folder` ingests files from a local path mounted into the API container.
- `source.type = kindle` ingests highlights from `My Clippings.txt` style files.
- `source.type = onenote` is scaffolded and tracked but parser implementation is intentionally minimal for MVP.
- The API enables CORS so extension/browser-origin clip payloads can call `/clip`.
