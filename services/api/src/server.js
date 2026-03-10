const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const { getDb, toObjectId } = require("./db");
const { ingestSource, ingestWebClip } = require("./services/ingestionService");
const { buildEmbedding, cosineSimilarity } = require("./utils/embedding");

const app = express();
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "3mb" }));

function safeLimit(value, fallback = 10, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

async function ensureWebClipSource(db) {
  const existing = await db.collection("sources").findOne({ type: "webclip", name: "Web Clippings" });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const result = await db.collection("sources").insertOne({
    name: "Web Clippings",
    type: "webclip",
    path: "",
    enabled: true,
    createdAt: now,
    updatedAt: now
  });

  return db.collection("sources").findOne({ _id: result.insertedId });
}

app.get("/health", async (_req, res) => {
  const db = await getDb();
  const counts = {
    sources: await db.collection("sources").countDocuments(),
    documents: await db.collection("documents").countDocuments(),
    highlights: await db.collection("highlights").countDocuments(),
    jobs: await db.collection("ingestion_jobs").countDocuments({ status: "pending" })
  };

  res.json({ status: "ok", counts });
});

app.get("/sources", async (_req, res) => {
  const db = await getDb();
  const sources = await db.collection("sources").find({}).sort({ createdAt: -1 }).toArray();
  res.json(sources);
});

app.post("/sources", async (req, res) => {
  const db = await getDb();
  const { name, type, path } = req.body || {};

  if (!name || !type) {
    return res.status(400).json({ error: "name and type are required" });
  }

  const supported = new Set(["folder", "git", "kindle", "webclip", "onenote"]);
  if (!supported.has(type)) {
    return res.status(400).json({ error: "unsupported source type" });
  }

  const now = new Date();
  const doc = {
    name,
    type,
    path: path || "",
    enabled: true,
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection("sources").insertOne(doc);

  await db.collection("ingestion_jobs").insertOne({
    sourceId: String(result.insertedId),
    status: "pending",
    reason: "source_created",
    createdAt: now,
    updatedAt: now,
    attempts: 0
  });

  const created = await db.collection("sources").findOne({ _id: result.insertedId });
  return res.status(201).json(created);
});

app.get("/documents", async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 50, 200);
  const documents = await db.collection("documents").find({}).sort({ updatedAt: -1 }).limit(limit).toArray();
  res.json(documents);
});

app.get("/documents/:id", async (req, res) => {
  const db = await getDb();
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "invalid document id" });
  }

  const document = await db.collection("documents").findOne({ _id: id });
  if (!document) {
    return res.status(404).json({ error: "document not found" });
  }

  const content = await db.collection("document_contents").findOne({ documentId: String(id) });
  const chunks = await db.collection("document_chunks").find({ documentId: String(id) }).sort({ chunkIndex: 1 }).toArray();

  res.json({ document, content, chunks });
});

app.get("/highlights", async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 100, 500);
  const highlights = await db.collection("highlights").find({}).sort({ createdAt: -1 }).limit(limit).toArray();
  res.json(highlights);
});

app.post("/highlights", async (req, res) => {
  const db = await getDb();
  const { sourceType = "manual", sourceBook = "Manual", author = "", highlightText, location = "", highlightDate = "", tags = [], userNotes = "" } = req.body || {};

  if (!highlightText || !highlightText.trim()) {
    return res.status(400).json({ error: "highlightText is required" });
  }

  const doc = {
    sourceType,
    sourceBook,
    author,
    highlightText: highlightText.trim(),
    location,
    highlightDate,
    tags: Array.isArray(tags) ? tags : [],
    userNotes,
    createdAt: new Date()
  };

  const result = await db.collection("highlights").insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

app.post("/reindex", async (req, res) => {
  const db = await getDb();
  const sourceId = req.body?.sourceId;
  const now = new Date();

  if (sourceId) {
    await db.collection("ingestion_jobs").insertOne({
      sourceId,
      status: "pending",
      reason: "manual_reindex",
      createdAt: now,
      updatedAt: now,
      attempts: 0
    });
    return res.json({ queued: 1 });
  }

  const sources = await db.collection("sources").find({ enabled: true, type: { $in: ["folder", "kindle", "git", "onenote"] } }).toArray();
  if (!sources.length) {
    return res.json({ queued: 0 });
  }

  const jobs = sources.map((source) => ({
    sourceId: String(source._id),
    status: "pending",
    reason: "manual_reindex_all",
    createdAt: now,
    updatedAt: now,
    attempts: 0
  }));

  await db.collection("ingestion_jobs").insertMany(jobs);
  res.json({ queued: jobs.length });
});

app.post("/clip", async (req, res) => {
  const db = await getDb();
  const source = await ensureWebClipSource(db);

  try {
    const result = await ingestWebClip(db, source, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/import-url", async (req, res) => {
  const db = await getDb();
  const url = req.body?.url;
  if (!url) {
    return res.status(400).json({ error: "url is required" });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return res.status(400).json({ error: `failed to fetch url: ${response.status}` });
    }

    const html = await response.text();
    const plain = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const titleMatch = html.match(/<title>(.*?)<\/title>/i);
    const payload = {
      url,
      title: titleMatch ? titleMatch[1].trim() : url,
      html,
      text: plain,
      highlights: []
    };

    const source = await ensureWebClipSource(db);
    const result = await ingestWebClip(db, source, payload);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/search", async (req, res) => {
  const db = await getDb();
  const query = (req.body?.query || "").trim();
  const limit = safeLimit(req.body?.limit, 10, 50);

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  const queryEmbedding = buildEmbedding(query);
  const queryTerms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  const chunks = await db.collection("document_chunks").find({}).limit(1500).toArray();
  const scoredChunks = chunks.map((chunk) => {
    const semanticScore = cosineSimilarity(queryEmbedding, chunk.embedding || []);
    const text = (chunk.text || "").toLowerCase();
    let keywordHits = 0;
    for (const term of queryTerms) {
      if (text.includes(term)) {
        keywordHits += 1;
      }
    }

    const keywordScore = queryTerms.length ? keywordHits / queryTerms.length : 0;
    const score = semanticScore * 0.7 + keywordScore * 0.3;

    return {
      ...chunk,
      score,
      semanticScore,
      keywordScore
    };
  });

  scoredChunks.sort((a, b) => b.score - a.score);

  const highlightCursor = db.collection("highlights").find({
    highlightText: { $regex: query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
  }).limit(limit);
  const highlights = await highlightCursor.toArray();

  res.json({
    query,
    chunks: scoredChunks.slice(0, limit),
    highlights
  });
});

app.post("/admin/process-jobs", async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 3, 20);

  const jobs = await db.collection("ingestion_jobs")
    .find({ status: "pending" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const source = await db.collection("sources").findOne({ _id: toObjectId(job.sourceId) });
    const startedAt = new Date();

    if (!source) {
      await db.collection("ingestion_jobs").updateOne({ _id: job._id }, {
        $set: {
          status: "failed",
          error: "source_not_found",
          updatedAt: new Date(),
          startedAt,
          finishedAt: new Date()
        },
        $inc: { attempts: 1 }
      });
      failed += 1;
      continue;
    }

    await db.collection("ingestion_jobs").updateOne({ _id: job._id }, {
      $set: { status: "running", updatedAt: startedAt, startedAt }
    });

    try {
      const result = await ingestSource(db, source);
      await db.collection("ingestion_jobs").updateOne({ _id: job._id }, {
        $set: {
          status: "completed",
          result,
          updatedAt: new Date(),
          finishedAt: new Date()
        },
        $inc: { attempts: 1 }
      });
      processed += 1;
    } catch (error) {
      await db.collection("ingestion_jobs").updateOne({ _id: job._id }, {
        $set: {
          status: "failed",
          error: error.message,
          updatedAt: new Date(),
          finishedAt: new Date()
        },
        $inc: { attempts: 1 }
      });
      failed += 1;
    }
  }

  res.json({ picked: jobs.length, processed, failed });
});

app.post("/admin/scan-sources", async (_req, res) => {
  const db = await getDb();
  const sources = await db.collection("sources").find({ enabled: true, type: { $in: ["folder", "kindle", "git", "onenote"] } }).toArray();

  if (!sources.length) {
    return res.json({ queued: 0 });
  }

  const now = new Date();
  const jobs = sources.map((source) => ({
    sourceId: String(source._id),
    status: "pending",
    reason: "periodic_scan",
    createdAt: now,
    updatedAt: now,
    attempts: 0
  }));

  await db.collection("ingestion_jobs").insertMany(jobs);
  res.json({ queued: jobs.length });
});

app.post("/admin/retry-failed", async (_req, res) => {
  const db = await getDb();
  const now = new Date();
  const result = await db.collection("ingestion_jobs").updateMany(
    { status: "failed", attempts: { $lt: 5 } },
    {
      $set: {
        status: "pending",
        updatedAt: now,
        reason: "retry_failed"
      }
    }
  );

  res.json({ requeued: result.modifiedCount });
});

app.post("/admin/reembed-missing", async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 200, 2000);

  const chunks = await db.collection("document_chunks")
    .find({
      $or: [
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } }
      ]
    })
    .limit(limit)
    .toArray();

  for (const chunk of chunks) {
    await db.collection("document_chunks").updateOne(
      { _id: chunk._id },
      {
        $set: {
          embedding: buildEmbedding(chunk.text || ""),
          embeddingMeta: {
            model: process.env.EMBEDDING_MODEL || "docforge-hash-v1",
            dimension: 64,
            version: "1",
            updatedAt: new Date()
          },
          updatedAt: new Date()
        }
      }
    );
  }

  res.json({ updated: chunks.length });
});

app.get("/admin/stats", async (_req, res) => {
  const db = await getDb();
  const [sources, documents, chunks, highlights, pendingJobs, failedJobs] = await Promise.all([
    db.collection("sources").countDocuments(),
    db.collection("documents").countDocuments(),
    db.collection("document_chunks").countDocuments(),
    db.collection("highlights").countDocuments(),
    db.collection("ingestion_jobs").countDocuments({ status: "pending" }),
    db.collection("ingestion_jobs").countDocuments({ status: "failed" })
  ]);

  res.json({ sources, documents, chunks, highlights, pendingJobs, failedJobs });
});

app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message || "internal server error" });
});

async function start() {
  await getDb();
  const port = Number(process.env.API_PORT || 8080);
  app.listen(port, () => {
    process.stdout.write(`docforge-api listening on ${port}\n`);
  });
}

start().catch((error) => {
  process.stderr.write(`failed to start api: ${error.message}\n`);
  process.exit(1);
});
