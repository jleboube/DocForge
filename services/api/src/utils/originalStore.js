const fs = require("fs/promises");
const path = require("path");

const STORE_ROOT = process.env.DOCUMENT_STORE_ROOT || "/var/docforge/store";

function safeSegment(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "item";
}

function buildUserBase(userId) {
  return path.join(STORE_ROOT, safeSegment(userId));
}

function relativeToStore(absolutePath) {
  return path.relative(STORE_ROOT, absolutePath);
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function persistOriginalFromFile({ userId, sourceId, sourcePath, contentHash }) {
  const fileName = path.basename(sourcePath);
  const ext = path.extname(fileName);
  const safeName = `${safeSegment(path.basename(fileName, ext))}-${String(contentHash).slice(0, 12)}${ext}`;

  const userBase = buildUserBase(userId);
  const sourceDir = path.join(userBase, safeSegment(sourceId));
  await ensureDir(sourceDir);

  const destination = path.join(sourceDir, safeName);
  await fs.copyFile(sourcePath, destination);

  const stat = await fs.stat(destination);
  return {
    fileName,
    size: stat.size,
    storagePath: relativeToStore(destination),
    absolutePath: destination,
    mimeType: "application/octet-stream"
  };
}

async function persistOriginalFromText({ userId, sourceId, fileName, text, contentHash }) {
  const ext = path.extname(fileName) || ".txt";
  const safeName = `${safeSegment(path.basename(fileName, ext))}-${String(contentHash).slice(0, 12)}${ext}`;

  const userBase = buildUserBase(userId);
  const sourceDir = path.join(userBase, safeSegment(sourceId));
  await ensureDir(sourceDir);

  const destination = path.join(sourceDir, safeName);
  await fs.writeFile(destination, text, "utf8");

  const stat = await fs.stat(destination);
  return {
    fileName,
    size: stat.size,
    storagePath: relativeToStore(destination),
    absolutePath: destination,
    mimeType: "text/plain"
  };
}

function resolveStoredPath(relativePath) {
  const resolved = path.resolve(STORE_ROOT, relativePath);
  const rootResolved = path.resolve(STORE_ROOT);

  if (!resolved.startsWith(rootResolved)) {
    throw new Error("Invalid stored file path");
  }

  return resolved;
}

module.exports = {
  STORE_ROOT,
  persistOriginalFromFile,
  persistOriginalFromText,
  resolveStoredPath
};
