const express = require("express");
const cors = require("cors");
const fs = require("fs/promises");
const { ObjectId } = require("mongodb");
const { getDb, toObjectId } = require("./db");
const { ingestSource, ingestWebClip } = require("./services/ingestionService");
const { buildEmbedding, cosineSimilarity } = require("./utils/embedding");
const { resolveStoredPath } = require("./utils/originalStore");
const {
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
  signAppToken,
  signOAuthState,
  verifyOAuthState,
  exchangeGoogleCodeForToken,
  verifyGoogleIdToken,
  authRequired,
  internalOrAuth
} = require("./auth");

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (process.env.TRUST_PROXY === "true") {
  app.set("trust proxy", true);
}

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (!allowedOrigins.length || allowedOrigins.includes("*") || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error("Origin not allowed by CORS"));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "x-internal-token"]
}));
app.use(express.json({ limit: "3mb" }));

function safeLimit(value, fallback = 10, max = 100) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function escapeRegex(input) {
  return String(input).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeTags(input) {
  const values = Array.isArray(input) ? input : String(input || "").split(",");
  const unique = new Set();

  for (const value of values) {
    const tag = String(value || "").trim().toLowerCase();
    if (tag) {
      unique.add(tag);
    }
  }

  return Array.from(unique);
}

function userScope(req) {
  return req.internal ? {} : { userId: req.auth.userId };
}

function getPublicWebUrl(req) {
  return process.env.PUBLIC_WEB_URL || `${req.protocol}://${req.get("host")}`;
}

function isAllowedReturnTo(urlValue) {
  if (!urlValue) {
    return false;
  }

  try {
    const parsed = new URL(urlValue);
    const origin = parsed.origin;
    if (!allowedOrigins.length || allowedOrigins.includes("*")) {
      return true;
    }
    return allowedOrigins.includes(origin);
  } catch (_error) {
    return false;
  }
}

async function ensureWebClipSource(db, userId) {
  const existing = await db.collection("sources").findOne({ userId, type: "webclip", name: "Web Clippings" });
  if (existing) {
    return existing;
  }

  const now = new Date();
  const result = await db.collection("sources").insertOne({
    userId,
    name: "Web Clippings",
    type: "webclip",
    path: "",
    enabled: true,
    createdAt: now,
    updatedAt: now
  });

  return db.collection("sources").findOne({ _id: result.insertedId });
}

async function upsertUserFromGoogle(db, payload) {
  const now = new Date();
  const filter = {
    provider: "google",
    providerUserId: payload.sub
  };

  const update = {
    $set: {
      provider: "google",
      providerUserId: payload.sub,
      email: payload.email || "",
      emailVerified: Boolean(payload.email_verified),
      name: payload.name || payload.email || "DocForge User",
      picture: payload.picture || "",
      updatedAt: now,
      lastLoginAt: now
    },
    $setOnInsert: {
      createdAt: now
    }
  };

  const result = await db.collection("users").findOneAndUpdate(filter, update, { upsert: true, returnDocument: "after" });
  if (result && result.value) {
    return result.value;
  }

  return db.collection("users").findOne(filter);
}

app.get("/health", async (_req, res) => {
  await getDb();
  res.json({ status: "ok" });
});

app.get("/auth/config", (_req, res) => {
  const oauthCodeEnabled = Boolean(googleClientId && googleClientSecret && googleRedirectUri);
  res.json({
    googleClientId: googleClientId || "",
    googleAuthMode: oauthCodeEnabled ? "authorization_code" : "id_token_fallback",
    googleRedirectUri: googleRedirectUri || "",
    publicWebUrl: process.env.PUBLIC_WEB_URL || "",
    publicApiUrl: process.env.PUBLIC_API_URL || "",
    apple: {
      enabled: false,
      message: "Apple OAuth requires Services ID + Sign in with Apple web config. Endpoint scaffolded."
    }
  });
});

app.post("/auth/google", async (req, res) => {
  const idToken = req.body?.idToken;
  if (!idToken) {
    return res.status(400).json({ error: "idToken is required" });
  }

  try {
    const db = await getDb();
    const payload = await verifyGoogleIdToken(idToken);
    const user = await upsertUserFromGoogle(db, payload);
    const token = signAppToken(user);

    return res.json({
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        picture: user.picture,
        provider: user.provider
      }
    });
  } catch (error) {
    return res.status(401).json({ error: `google authentication failed: ${error.message}` });
  }
});

app.get("/auth/google/start", async (req, res) => {
  if (!googleClientId || !googleClientSecret || !googleRedirectUri) {
    return res.status(400).json({ error: "Google OAuth code flow is not fully configured" });
  }

  const requestedReturnTo = (req.query.returnTo || "").toString();
  const fallbackReturnTo = getPublicWebUrl(req);
  const returnTo = isAllowedReturnTo(requestedReturnTo) ? requestedReturnTo : fallbackReturnTo;
  const state = signOAuthState({ returnTo });

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "offline",
    prompt: "select_account",
    state
  });

  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

app.get("/auth/google/callback", async (req, res) => {
  const code = (req.query.code || "").toString();
  const stateToken = (req.query.state || "").toString();
  if (!code || !stateToken) {
    return res.status(400).json({ error: "missing oauth code or state" });
  }

  try {
    const state = verifyOAuthState(stateToken);
    const returnTo = isAllowedReturnTo(state.returnTo) ? state.returnTo : getPublicWebUrl(req);
    const db = await getDb();
    const tokenResponse = await exchangeGoogleCodeForToken(code);
    const payload = await verifyGoogleIdToken(tokenResponse.id_token);
    const user = await upsertUserFromGoogle(db, payload);
    const appToken = signAppToken(user);
    const redirectUrl = `${returnTo.replace(/\/$/, "")}/#authToken=${encodeURIComponent(appToken)}`;
    return res.redirect(redirectUrl);
  } catch (error) {
    return res.status(401).json({ error: `google oauth callback failed: ${error.message}` });
  }
});

app.post("/auth/apple", (_req, res) => {
  return res.status(501).json({
    error: "apple_oauth_not_enabled",
    setup: "Configure Apple Services ID, key ID, team ID, private key, and callback domain first."
  });
});

app.get("/auth/me", authRequired, async (req, res) => {
  const db = await getDb();
  const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.userId) });
  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }

  return res.json({
    id: String(user._id),
    email: user.email,
    name: user.name,
    picture: user.picture,
    provider: user.provider
  });
});

app.get("/sources", authRequired, async (req, res) => {
  const db = await getDb();
  const sources = await db.collection("sources")
    .find({ userId: req.auth.userId })
    .sort({ createdAt: -1 })
    .toArray();
  res.json(sources);
});

app.post("/sources", authRequired, async (req, res) => {
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
    userId: req.auth.userId,
    name,
    type,
    path: path || "",
    enabled: true,
    createdAt: now,
    updatedAt: now
  };

  const result = await db.collection("sources").insertOne(doc);

  await db.collection("ingestion_jobs").insertOne({
    userId: req.auth.userId,
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

app.get("/documents", authRequired, async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 50, 200);
  const documents = await db.collection("documents")
    .find({ userId: req.auth.userId })
    .sort({ updatedAt: -1 })
    .limit(limit)
    .toArray();
  res.json(documents);
});

app.get("/documents/:id", authRequired, async (req, res) => {
  const db = await getDb();
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "invalid document id" });
  }

  const filter = { _id: id, userId: req.auth.userId };
  const document = await db.collection("documents").findOne(filter);
  if (!document) {
    return res.status(404).json({ error: "document not found" });
  }

  const content = await db.collection("document_contents").findOne({ documentId: String(id), userId: req.auth.userId });
  const chunks = await db.collection("document_chunks")
    .find({ documentId: String(id), userId: req.auth.userId })
    .sort({ chunkIndex: 1 })
    .toArray();

  res.json({ document, content, chunks });
});

app.get("/documents/:id/original", authRequired, async (req, res) => {
  const db = await getDb();
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "invalid document id" });
  }

  const document = await db.collection("documents").findOne({ _id: id, userId: req.auth.userId });
  if (!document) {
    return res.status(404).json({ error: "document not found" });
  }

  const original = document.originalFile;
  if (!original || !original.storagePath) {
    return res.status(404).json({ error: "original file not available" });
  }

  try {
    const absolutePath = resolveStoredPath(original.storagePath);
    await fs.access(absolutePath);
    return res.download(absolutePath, original.fileName || "document");
  } catch (_error) {
    return res.status(404).json({ error: "stored file not found" });
  }
});

app.get("/highlights", authRequired, async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 100, 500);
  const highlights = await db.collection("highlights")
    .find({ userId: req.auth.userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  res.json(highlights);
});

app.post("/highlights", authRequired, async (req, res) => {
  const db = await getDb();
  const { sourceType = "manual", sourceBook = "Manual", author = "", highlightText, location = "", highlightDate = "", tags = [], userNotes = "" } = req.body || {};

  if (!highlightText || !highlightText.trim()) {
    return res.status(400).json({ error: "highlightText is required" });
  }

  const doc = {
    userId: req.auth.userId,
    sourceType,
    sourceBook,
    author,
    highlightText: highlightText.trim(),
    location,
    highlightDate,
    tags: normalizeTags(tags),
    userNotes,
    createdAt: new Date()
  };

  const result = await db.collection("highlights").insertOne(doc);
  res.status(201).json({ ...doc, _id: result.insertedId });
});

app.post("/documents/:id/tags", authRequired, async (req, res) => {
  const db = await getDb();
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "invalid document id" });
  }

  const tags = normalizeTags(req.body?.tags || []);
  const result = await db.collection("documents").findOneAndUpdate(
    { _id: id, userId: req.auth.userId },
    { $set: { tags, updatedAt: new Date() } },
    { returnDocument: "after" }
  );

  const updated = result?.value || result;
  if (!updated) {
    return res.status(404).json({ error: "document not found" });
  }

  await db.collection("document_chunks").updateMany(
    { userId: req.auth.userId, documentId: String(id) },
    { $set: { "metadata.tags": tags, updatedAt: new Date() } }
  );

  return res.json(updated);
});

app.post("/highlights/:id/tags", authRequired, async (req, res) => {
  const db = await getDb();
  const id = toObjectId(req.params.id);
  if (!id) {
    return res.status(400).json({ error: "invalid highlight id" });
  }

  const tags = normalizeTags(req.body?.tags || []);
  const result = await db.collection("highlights").findOneAndUpdate(
    { _id: id, userId: req.auth.userId },
    { $set: { tags } },
    { returnDocument: "after" }
  );

  const updated = result?.value || result;
  if (!updated) {
    return res.status(404).json({ error: "highlight not found" });
  }
  return res.json(updated);
});

app.post("/reindex", authRequired, async (req, res) => {
  const db = await getDb();
  const sourceId = req.body?.sourceId;
  const now = new Date();

  if (sourceId) {
    const source = await db.collection("sources").findOne({ _id: toObjectId(sourceId), userId: req.auth.userId });
    if (!source) {
      return res.status(404).json({ error: "source not found" });
    }

    await db.collection("ingestion_jobs").insertOne({
      userId: req.auth.userId,
      sourceId,
      status: "pending",
      reason: "manual_reindex",
      createdAt: now,
      updatedAt: now,
      attempts: 0
    });
    return res.json({ queued: 1 });
  }

  const sources = await db.collection("sources").find({ userId: req.auth.userId, enabled: true, type: { $in: ["folder", "kindle", "git", "onenote"] } }).toArray();
  if (!sources.length) {
    return res.json({ queued: 0 });
  }

  const jobs = sources.map((source) => ({
    userId: req.auth.userId,
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

app.post("/clip", authRequired, async (req, res) => {
  const db = await getDb();

  try {
    const source = await ensureWebClipSource(db, req.auth.userId);
    const result = await ingestWebClip(db, source, req.body || {});
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post("/import-url", authRequired, async (req, res) => {
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
      highlights: [],
      tags: normalizeTags(req.body?.tags || [])
    };

    const source = await ensureWebClipSource(db, req.auth.userId);
    const result = await ingestWebClip(db, source, payload);
    return res.status(201).json(result);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
});

app.post("/search", authRequired, async (req, res) => {
  const db = await getDb();
  const query = (req.body?.query || "").trim();
  const tagFilter = normalizeTags(req.body?.tags || req.body?.tag || []);
  const limit = safeLimit(req.body?.limit, 10, 50);

  if (!query) {
    return res.status(400).json({ error: "query is required" });
  }

  const queryEmbedding = buildEmbedding(query);
  const queryTerms = query.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  const chunkQuery = { userId: req.auth.userId };
  if (tagFilter.length) {
    chunkQuery["metadata.tags"] = { $in: tagFilter };
  }

  const chunks = await db.collection("document_chunks")
    .find(chunkQuery)
    .limit(1500)
    .toArray();

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

  const highlights = await db.collection("highlights")
    .find({
      userId: req.auth.userId,
      ...(tagFilter.length ? { tags: { $in: tagFilter } } : {}),
      highlightText: { $regex: escapeRegex(query), $options: "i" }
    })
    .limit(limit)
    .toArray();

  res.json({
    query,
    tags: tagFilter,
    chunks: scoredChunks.slice(0, limit),
    highlights
  });
});

app.get("/artifacts/by-tag", authRequired, async (req, res) => {
  const db = await getDb();
  const tag = normalizeTags(req.query.tag || req.query.tags || []);
  if (!tag.length) {
    return res.status(400).json({ error: "tag is required" });
  }

  const limit = safeLimit(req.query.limit, 25, 200);
  const query = { userId: req.auth.userId, tags: { $in: tag } };

  const [documents, highlights] = await Promise.all([
    db.collection("documents").find(query).sort({ updatedAt: -1 }).limit(limit).toArray(),
    db.collection("highlights").find(query).sort({ createdAt: -1 }).limit(limit).toArray()
  ]);

  return res.json({ tags: tag, documents, highlights });
});

app.post("/admin/process-jobs", internalOrAuth, async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 3, 20);
  const scope = userScope(req);

  const jobs = await db.collection("ingestion_jobs")
    .find({ ...scope, status: "pending" })
    .sort({ createdAt: 1 })
    .limit(limit)
    .toArray();

  let processed = 0;
  let failed = 0;

  for (const job of jobs) {
    const sourceFilter = { _id: toObjectId(job.sourceId) };
    if (!req.internal) {
      sourceFilter.userId = req.auth.userId;
    }

    const source = await db.collection("sources").findOne(sourceFilter);
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

app.post("/admin/scan-sources", internalOrAuth, async (req, res) => {
  const db = await getDb();
  const scope = userScope(req);

  const sources = await db.collection("sources")
    .find({ ...scope, enabled: true, type: { $in: ["folder", "kindle", "git", "onenote"] } })
    .toArray();

  if (!sources.length) {
    return res.json({ queued: 0 });
  }

  const now = new Date();
  const jobs = sources.map((source) => ({
    userId: source.userId,
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

app.post("/admin/retry-failed", internalOrAuth, async (req, res) => {
  const db = await getDb();
  const now = new Date();

  const result = await db.collection("ingestion_jobs").updateMany(
    { ...userScope(req), status: "failed", attempts: { $lt: 5 } },
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

app.post("/admin/reembed-missing", internalOrAuth, async (req, res) => {
  const db = await getDb();
  const limit = safeLimit(req.query.limit, 200, 2000);
  const scope = userScope(req);

  const chunks = await db.collection("document_chunks")
    .find({
      ...scope,
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

app.get("/admin/stats", internalOrAuth, async (req, res) => {
  const db = await getDb();
  const scope = userScope(req);

  const [sources, documents, chunks, highlights, pendingJobs, failedJobs] = await Promise.all([
    db.collection("sources").countDocuments(scope),
    db.collection("documents").countDocuments(scope),
    db.collection("document_chunks").countDocuments(scope),
    db.collection("highlights").countDocuments(scope),
    db.collection("ingestion_jobs").countDocuments({ ...scope, status: "pending" }),
    db.collection("ingestion_jobs").countDocuments({ ...scope, status: "failed" })
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
