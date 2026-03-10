const crypto = require("crypto");
const { chunkText } = require("../utils/chunker");
const { buildEmbedding } = require("../utils/embedding");
const { parseKindleClippings } = require("../ingestion/kindle");
const { ingestFolderSource } = require("../ingestion/folder");
const { persistOriginalFromFile, persistOriginalFromText } = require("../utils/originalStore");

function now() {
  return new Date();
}

function normalizeTags(input) {
  if (!Array.isArray(input)) {
    return [];
  }

  const unique = new Set();
  for (const tag of input) {
    const normalized = String(tag || "").trim().toLowerCase();
    if (normalized) {
      unique.add(normalized);
    }
  }
  return Array.from(unique);
}

async function storeDocumentWithChunks(db, source, docInput, options = {}) {
  const timestamp = now();
  const sourceId = String(source._id);
  const userId = String(source.userId);

  const existing = await db.collection("documents").findOne({
    userId,
    sourceId,
    sourcePath: docInput.sourcePath
  });

  if (existing && existing.contentHash === docInput.contentHash && !options.force) {
    const [contentCount, chunkCount] = await Promise.all([
      db.collection("document_contents").countDocuments({ documentId: String(existing._id) }, { limit: 1 }),
      db.collection("document_chunks").countDocuments({ documentId: String(existing._id) }, { limit: 1 })
    ]);

    if (contentCount > 0 && chunkCount > 0) {
      return { updated: false, documentId: existing._id };
    }
  }

  const document = {
    userId,
    sourceId,
    sourceType: source.type,
    sourcePath: docInput.sourcePath,
    revisionId: docInput.contentHash,
    title: docInput.title,
    mimeType: docInput.mimeType,
    contentHash: docInput.contentHash,
    tags: normalizeTags(docInput.tags),
    updatedAt: timestamp,
    metadata: {
      ...(docInput.extractedMetadata || {}),
      sourceName: source.name
    }
  };

  if (docInput.originalFile) {
    document.originalFile = docInput.originalFile;
  }

  const docRes = await db.collection("documents").findOneAndUpdate(
    { userId, sourceId, sourcePath: docInput.sourcePath },
    { $set: document, $setOnInsert: { createdAt: timestamp } },
    { upsert: true, returnDocument: "after" }
  );

  let persistedDoc = docRes && docRes.value ? docRes.value : docRes;
  if (!persistedDoc) {
    persistedDoc = await db.collection("documents").findOne({ userId, sourceId, sourcePath: docInput.sourcePath });
  }
  const documentId = persistedDoc._id;

  await db.collection("document_contents").updateOne(
    { userId, documentId: String(documentId) },
    {
      $set: {
        userId,
        documentId: String(documentId),
        text: docInput.text,
        updatedAt: timestamp
      },
      $setOnInsert: { createdAt: timestamp }
    },
    { upsert: true }
  );

  const chunkSize = Number(process.env.CHUNK_SIZE || 500);
  const chunkOverlap = Number(process.env.CHUNK_OVERLAP || 100);
  const chunks = chunkText(docInput.text, chunkSize, chunkOverlap);

  await db.collection("document_chunks").deleteMany({ userId, documentId: String(documentId) });

  if (chunks.length) {
    const chunkDocs = chunks.map((chunk) => ({
      userId,
      documentId: String(documentId),
      sourceId,
      text: chunk.text,
      chunkIndex: chunk.index,
      embedding: buildEmbedding(chunk.text),
      metadata: {
        userId,
        sourceId,
        sourcePath: docInput.sourcePath,
        sourceType: source.type,
        tags: normalizeTags(docInput.tags),
        startWord: chunk.startWord,
        endWord: chunk.endWord,
        title: docInput.title
      },
      embeddingMeta: {
        model: process.env.EMBEDDING_MODEL || "docforge-hash-v1",
        dimension: 64,
        version: "1",
        createdAt: timestamp
      },
      createdAt: timestamp,
      updatedAt: timestamp
    }));

    await db.collection("document_chunks").insertMany(chunkDocs);
  }

  await db.collection("source_sync_events").insertOne({
    userId,
    sourceId,
    sourceType: source.type,
    eventType: existing ? "updated" : "created",
    sourcePath: docInput.sourcePath,
    timestamp
  });

  return { updated: true, documentId };
}

async function ingestFolder(db, source, options = {}) {
  const result = await ingestFolderSource(source);

  let updates = 0;
  const unchanged = [];

  for (const doc of result.documents || []) {
    try {
      const originalFile = await persistOriginalFromFile({
        userId: String(source.userId),
        sourceId: String(source._id),
        sourcePath: doc.sourcePath,
        contentHash: doc.contentHash
      });
      doc.originalFile = originalFile;
    } catch (error) {
      result.errors.push(`Failed to store original file ${doc.sourcePath}: ${error.message}`);
    }

    const storeResult = await storeDocumentWithChunks(db, source, doc, options);
    if (storeResult.updated) {
      updates += 1;
    } else {
      unchanged.push(String(storeResult.documentId));
    }
  }

  return {
    type: "folder",
    scanned: (result.documents || []).length,
    ingested: updates,
    skipped: result.skipped,
    unchanged,
    errors: result.errors
  };
}

async function ingestKindle(db, source) {
  const fs = require("fs/promises");

  if (!source.path) {
    return { type: "kindle", ingested: 0, errors: ["Kindle source missing path"] };
  }

  let raw;
  try {
    raw = await fs.readFile(source.path, "utf8");
  } catch (error) {
    return { type: "kindle", ingested: 0, errors: [`Unable to read kindle source: ${error.message}`] };
  }

  const parsed = parseKindleClippings(raw);
  let inserted = 0;

  for (const item of parsed) {
    const dedupe = crypto.createHash("sha256")
      .update(`${String(source._id)}::${item.highlightText}::${item.location || ""}`)
      .digest("hex");

    const existing = await db.collection("highlights").findOne({ userId: String(source.userId), dedupeKey: dedupe });
    if (existing) {
      continue;
    }

    await db.collection("highlights").insertOne({
      userId: String(source.userId),
      sourceId: String(source._id),
      dedupeKey: dedupe,
      ...item,
      createdAt: now()
    });

    inserted += 1;
  }

  await db.collection("source_sync_events").insertOne({
    userId: String(source.userId),
    sourceId: String(source._id),
    sourceType: source.type,
    eventType: "kindle_sync",
    importedHighlights: inserted,
    timestamp: now()
  });

  return { type: "kindle", discovered: parsed.length, ingested: inserted, errors: [] };
}

async function ingestWebClip(db, source, clipPayload) {
  const sourceId = String(source._id);
  const userId = String(source.userId);
  const text = (clipPayload.text || clipPayload.html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  if (!text) {
    throw new Error("Clip payload has no extractable text");
  }

  const hash = crypto.createHash("sha256").update(text).digest("hex");
  const docInput = {
    sourcePath: clipPayload.url || `clip://${hash}`,
    title: clipPayload.title || "Web Clip",
    mimeType: "text/html",
    contentHash: hash,
    tags: normalizeTags(clipPayload.tags),
    text,
    extractedMetadata: {
      author: clipPayload.author || "",
      publication: clipPayload.publication || "",
      publishDate: clipPayload.publishDate || ""
    }
  };

  docInput.originalFile = await persistOriginalFromText({
    userId,
    sourceId,
    fileName: `${(clipPayload.title || "web-clip").replace(/[^a-zA-Z0-9._-]+/g, "-")}.html`,
    text: clipPayload.html || clipPayload.text || text,
    contentHash: hash
  });

  await storeDocumentWithChunks(db, source, docInput, { force: true });

  const highlights = Array.isArray(clipPayload.highlights) ? clipPayload.highlights : [];
  let inserted = 0;

  for (const highlightText of highlights) {
    if (!highlightText || !highlightText.trim()) {
      continue;
    }

    await db.collection("highlights").insertOne({
      userId,
      sourceId,
      sourceType: "webclip",
      sourceBook: clipPayload.title || clipPayload.url || "Web Clip",
      author: clipPayload.author || "",
      highlightText: highlightText.trim(),
      location: clipPayload.url || "",
      highlightDate: clipPayload.publishDate || "",
      tags: normalizeTags(clipPayload.tags),
      userNotes: clipPayload.note || "",
      createdAt: now()
    });

    inserted += 1;
  }

  return { ingestedDocument: true, ingestedHighlights: inserted };
}

async function ingestSource(db, source, options = {}) {
  if (!source) {
    throw new Error("Source not found");
  }

  if (source.type === "folder") {
    return ingestFolder(db, source, options);
  }

  if (source.type === "kindle") {
    return ingestKindle(db, source);
  }

  if (source.type === "onenote") {
    return { type: "onenote", ingested: 0, errors: ["OneNote parser is scaffolded for future extension"] };
  }

  if (source.type === "git") {
    return { type: "git", ingested: 0, errors: ["Git source sync scaffolded, not implemented in MVP"] };
  }

  return { type: source.type, ingested: 0, errors: [`Unsupported source type: ${source.type}`] };
}

module.exports = { ingestSource, ingestWebClip, storeDocumentWithChunks };
