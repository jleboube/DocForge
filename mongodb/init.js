db = db.getSiblingDB("docforge");

db.createCollection("sources");
db.createCollection("documents");
db.createCollection("document_contents");
db.createCollection("document_chunks");
db.createCollection("highlights");
db.createCollection("ingestion_jobs");
db.createCollection("source_sync_events");
