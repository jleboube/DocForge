const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const { readFileAsText } = require("../utils/fileParser");

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function walkFiles(rootDir) {
  const results = [];

  async function walk(current) {
    const entries = await fs.readdir(current, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
        continue;
      }

      if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  }

  await walk(rootDir);
  return results;
}

async function ingestFolderSource(source) {
  const sourcePath = source.path;
  if (!sourcePath) {
    return { ingested: 0, skipped: 0, errors: ["Folder source missing path"] };
  }

  let filePaths;
  try {
    filePaths = await walkFiles(sourcePath);
  } catch (error) {
    return { ingested: 0, skipped: 0, errors: [`Unable to read folder ${sourcePath}: ${error.message}`] };
  }

  const documents = [];
  const errors = [];
  let skipped = 0;

  for (const filePath of filePaths) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > MAX_FILE_BYTES) {
        skipped += 1;
        continue;
      }

      const { text, metadata } = await readFileAsText(filePath);
      if (!text || !text.trim()) {
        skipped += 1;
        continue;
      }

      const contentHash = crypto.createHash("sha256").update(text).digest("hex");
      documents.push({
        sourcePath: filePath,
        title: path.basename(filePath),
        mimeType: "text/plain",
        contentHash,
        text,
        extractedMetadata: {
          ...metadata,
          size: stat.size,
          modifiedAt: stat.mtime.toISOString()
        }
      });
    } catch (error) {
      errors.push(`Failed to ingest ${filePath}: ${error.message}`);
    }
  }

  return { ingested: documents.length, skipped, errors, documents };
}

module.exports = { ingestFolderSource };
