db = db.getSiblingDB("docforge");

db.documents.createIndex({ sourceId: 1 });
db.documents.createIndex({ contentHash: 1 });
db.documents.createIndex({ sourcePath: 1, sourceId: 1 }, { unique: false });
db.document_chunks.createIndex({ documentId: 1 });
db.document_chunks.createIndex({ "metadata.sourceId": 1 });
db.document_chunks.createIndex({ text: "text" });
db.highlights.createIndex({ sourceBook: 1 });
db.highlights.createIndex({ sourceId: 1 });
db.ingestion_jobs.createIndex({ status: 1, createdAt: 1 });
db.sources.createIndex({ type: 1 });
