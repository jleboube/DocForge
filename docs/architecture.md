# Architecture

- MongoDB: canonical data store
- API: source registration, ingestion logic, search, admin operations
- Source Manager: periodic source scan trigger
- Ingestion Worker: ingestion job processor
- Embedding Worker: embedding repair/recompute for chunks
- Scheduler: retries failed jobs and scan reconciliation
- Web UI: operational dashboard and query interface
- Browser Extension: one-click webpage selection capture to API `/clip`

Background workers coordinate by calling API admin endpoints so business logic remains centralized.
