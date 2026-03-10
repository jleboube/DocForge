# DocForge Build Plan

## Phase 1 (Completed)
- [x] Review PRD and handoff requirements and map MVP scope
- [x] Scaffold repository structure from handoff document
- [x] Implement MongoDB init and index scripts
- [x] Implement API service with required endpoints and Mongo integration
- [x] Implement ingestion pipeline (folder files, kindle clippings, URL/html clip ingestion)
- [x] Implement chunking + embedding + hybrid search behavior
- [x] Implement source-manager, ingestion-worker, embedding-worker, and scheduler services
- [x] Implement web UI with Sources, Documents, Highlights, Search, and Admin sections
- [x] Configure Dockerfiles and docker-compose for build/deploy
- [x] Select and configure an obscure unused five-digit host port for web access
- [x] Verify compose build/start and endpoint behavior
- [x] Document setup and usage in README and docs

## Phase 2 (Completed)
- [x] Redesign web UI/UX with stronger layout, navigation, and visual system
- [x] Improve interaction states (loading, error, status feedback)
- [x] Add API CORS support for browser extension ingestion
- [x] Build browser extension (Manifest V3) to capture selected webpage text
- [x] Add extension config for DocForge API URL and send to `/clip`
- [x] Document extension install and usage flow
- [x] Verify end-to-end clip ingestion from extension payload format

## Phase 3 (Completed)
- [x] Add Google OAuth login in web app
- [x] Add API auth endpoints and token verification
- [x] Enforce per-user data isolation across all CRUD/search/ingestion flows
- [x] Scope ingestion jobs and source sync by user
- [x] Add internal worker auth token for non-user background operations
- [x] Add Apple OAuth scaffolding and setup notes
- [x] Update docs and env templates for OAuth setup
- [x] Verify multi-user isolation behavior and regressions

## Phase 4 (Completed)
- [x] Add domain-aware runtime configuration for tunnel deployments
- [x] Add configurable CORS allowlist for custom domains
- [x] Remove hardcoded local host/port UI assumptions
- [x] Document Cloudflare Tunnel routing patterns and env setup
- [x] Verify API/web-ui rebuild with domain support settings

## Phase 5 (Completed)
- [x] Switch Google auth to authorization code flow using client ID + client secret
- [x] Add `/auth/google/start` and `/auth/google/callback`
- [x] Update web UI login action to redirect-based OAuth flow
- [x] Add deploy bootstrap scripts to auto-generate internal secrets
- [x] Keep user-provided external OAuth credentials explicit in env/docs

## Phase 6 (Completed)
- [x] Add optional tags to document and highlight artifacts
- [x] Add tag update endpoints for existing artifacts
- [x] Add tag-aware search and dedicated tag query endpoint
- [x] Wire UI inputs for tags and tag-only search
- [x] Add Mongo indexes for tag filtering

## Phase 7 (Completed)
- [x] Add in-app Help section with source import instructions
- [x] Document OneNote, Kindle, webpage, and folder workflows in UI
- [x] Include Chrome extension installation guidance in Help
- [x] Serve extension files directly from the web app

## Phase 8 (Completed)
- [x] Add true document-store behavior to persist original ingested artifacts
- [x] Store originals in user-scoped server folders under persistent docker volume
- [x] Expose secure endpoint for downloading original files
- [x] Add animated marketing landing page for unauthenticated users
- [x] Keep palette non-purple and include Google-only free-tier messaging

## Review
- Originals are now persisted to `DOCUMENT_STORE_ROOT` (`/var/docforge/store`) via `docforge_store` volume.
- Added `GET /documents/:id/original` with auth and tenant checks.
- Added animated landing page plus Help tab and extension links served by web-ui.
