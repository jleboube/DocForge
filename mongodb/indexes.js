db = db.getSiblingDB("docforge");

db.users.createIndex({ provider: 1, providerUserId: 1 }, { unique: true });
db.users.createIndex({ email: 1 });

db.sources.createIndex({ userId: 1, type: 1 });
db.documents.createIndex({ userId: 1, sourceId: 1 });
db.documents.createIndex({ userId: 1, tags: 1 });
db.documents.createIndex({ contentHash: 1 });
db.documents.createIndex({ sourcePath: 1, sourceId: 1 }, { unique: false });
db.document_contents.createIndex({ userId: 1, documentId: 1 });
db.document_chunks.createIndex({ userId: 1, documentId: 1 });
db.document_chunks.createIndex({ userId: 1, "metadata.sourceId": 1 });
db.document_chunks.createIndex({ userId: 1, "metadata.tags": 1 });
db.document_chunks.createIndex({ text: "text" });
db.highlights.createIndex({ userId: 1, sourceBook: 1 });
db.highlights.createIndex({ userId: 1, sourceId: 1 });
db.highlights.createIndex({ userId: 1, tags: 1 });
db.ingestion_jobs.createIndex({ userId: 1, status: 1, createdAt: 1 });
