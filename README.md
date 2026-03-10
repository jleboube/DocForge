# DocForge Local

Self-hosted document ingestion and retrieval platform designed for RAG workflows.

## Features
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

## Browser Extension
- Location: `browser-extension/docforge-clipper`
- Type: Manifest V3 extension for Chromium-compatible browsers
- Purpose: capture selected text (or page excerpt) and send directly to `POST /clip`

### Install Extension (Chromium)
1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select `browser-extension/docforge-clipper`
5. Set API URL in extension popup to `http://localhost:48080`
6. Select text on any page and click `Capture Selection`

## Quick Start
1. Copy env values if needed:
```bash
cp .env.example .env
```
2. Build and start:
```bash
docker compose up --build -d
```
3. Open the app on host port `49261`:
- http://localhost:49261

Optional API access:
- http://localhost:48080/health

## Core API Endpoints
- `GET /sources`
- `POST /sources`
- `GET /documents`
- `GET /documents/:id`
- `GET /highlights`
- `POST /highlights`
- `POST /search`
- `POST /reindex`
- `POST /clip`
- `POST /import-url`

## Notes
- `source.type = folder` ingests files from a local path mounted into the API container.
- `source.type = kindle` ingests highlights from `My Clippings.txt` style files.
- `source.type = onenote` is scaffolded and tracked but parser implementation is intentionally minimal for MVP.
- The API enables CORS so extension/browser-origin clip payloads can call `/clip`.
