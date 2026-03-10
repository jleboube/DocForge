function hashWord(word) {
  let hash = 2166136261;
  for (let i = 0; i < word.length; i += 1) {
    hash ^= word.charCodeAt(i);
    hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return hash >>> 0;
}

function buildEmbedding(text, dimensions = 64) {
  const vec = new Array(dimensions).fill(0);
  const words = (text || "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);

  if (!words.length) {
    return vec;
  }

  for (const word of words) {
    const hashed = hashWord(word);
    const idx = hashed % dimensions;
    vec[idx] += 1;
  }

  const mag = Math.sqrt(vec.reduce((sum, value) => sum + value * value, 0));
  if (mag === 0) {
    return vec;
  }

  return vec.map((value) => value / mag);
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  if (magA === 0 || magB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

module.exports = { buildEmbedding, cosineSimilarity };
