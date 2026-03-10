function parseKindleClippings(raw) {
  const entries = raw.split("==========").map((part) => part.trim()).filter(Boolean);
  const highlights = [];

  for (const entry of entries) {
    const lines = entry.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) {
      continue;
    }

    const titleLine = lines[0];
    const metaLine = lines[1] || "";
    const text = lines.slice(2).join("\n").trim();

    if (!text) {
      continue;
    }

    const titleAuthorMatch = titleLine.match(/^(.*?)(?:\s*\((.*?)\))?$/);
    const locationMatch = metaLine.match(/Location\s+([^|]+)/i);
    const dateMatch = metaLine.match(/Added on\s+(.*)$/i);

    highlights.push({
      sourceType: "kindle",
      sourceBook: titleAuthorMatch ? titleAuthorMatch[1].trim() : titleLine,
      author: titleAuthorMatch && titleAuthorMatch[2] ? titleAuthorMatch[2].trim() : "",
      highlightText: text,
      location: locationMatch ? locationMatch[1].trim() : "",
      highlightDate: dateMatch ? dateMatch[1].trim() : "",
      tags: [],
      userNotes: ""
    });
  }

  return highlights;
}

module.exports = { parseKindleClippings };
