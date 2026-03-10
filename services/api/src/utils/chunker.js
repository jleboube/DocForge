function chunkText(text, maxWords = 500, overlapWords = 100) {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const chunks = [];
  const safeMax = Math.max(50, maxWords);
  const safeOverlap = Math.max(0, Math.min(overlapWords, safeMax - 1));
  const step = Math.max(1, safeMax - safeOverlap);

  for (let i = 0; i < words.length; i += step) {
    const slice = words.slice(i, i + safeMax);
    if (!slice.length) {
      continue;
    }

    chunks.push({
      index: chunks.length,
      text: slice.join(" "),
      startWord: i,
      endWord: i + slice.length
    });

    if (i + safeMax >= words.length) {
      break;
    }
  }

  return chunks;
}

module.exports = { chunkText };
