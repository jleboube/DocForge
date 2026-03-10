# Ingestion Pipeline

1. Source scan
2. File discovery
3. Hash computation
4. Duplicate detection
5. Parser selection
6. Text extraction
7. Canonicalization
8. Chunking
9. Embedding generation
10. Index storage

## Implemented Notes
- Folder sources scan recursively.
- Kindle sources parse `My Clippings.txt` records.
- URL import fetches HTML and extracts readable text.
- Each successful ingest updates documents + chunks and logs sync events.
