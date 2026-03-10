const fs = require("fs/promises");
const path = require("path");

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".markdown", ".csv", ".json", ".yaml", ".yml", ".xml", ".html", ".htm",
  ".js", ".ts", ".tsx", ".jsx", ".py", ".java", ".go", ".rb", ".rs", ".c", ".cpp", ".h", ".hpp",
  ".css", ".scss", ".sql", ".toml", ".ini", ".log"
]);

async function readFileAsText(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (!TEXT_EXTENSIONS.has(ext)) {
    if (ext === ".pdf") {
      return {
        text: "",
        metadata: { parser: "pdf-placeholder", warning: "PDF parsing placeholder in MVP" }
      };
    }

    if (ext === ".docx") {
      return {
        text: "",
        metadata: { parser: "docx-placeholder", warning: "DOCX parsing placeholder in MVP" }
      };
    }

    return { text: "", metadata: { parser: "unsupported" } };
  }

  const buffer = await fs.readFile(filePath);
  return {
    text: buffer.toString("utf8"),
    metadata: { parser: "text" }
  };
}

module.exports = { readFileAsText };
