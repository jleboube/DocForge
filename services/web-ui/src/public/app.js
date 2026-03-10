const state = {
  sources: [],
  documents: [],
  highlights: [],
  stats: {}
};

const tabMeta = {
  dashboard: ["Dashboard", "Operations overview across ingestion, highlights, and retrieval."],
  sources: ["Sources", "Register and manage ingestion origins."],
  documents: ["Documents", "Recently ingested source documents."],
  highlights: ["Highlights", "Readwise-like personal highlight library."],
  search: ["Search", "Hybrid semantic and keyword retrieval."],
  ingest: ["Web Capture", "Ingest pasted content or import directly from URL."],
  admin: ["Admin", "Run reconciliation, processing, and recovery actions."]
};

function el(id) {
  return document.getElementById(id);
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message, isError = false) {
  const toast = el("toast");
  toast.textContent = message;
  toast.style.background = isError ? "#6a1f18" : "#163629";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    headers: { "Content-Type": "application/json" },
    ...options
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function renderList(target, rows, toHtml, emptyMessage) {
  target.innerHTML = rows.length ? rows.map((row) => `<li>${toHtml(row)}</li>`).join("") : `<li>${emptyMessage}</li>`;
}

function renderKpis() {
  const metrics = [
    ["Sources", state.stats.sources || 0],
    ["Documents", state.stats.documents || 0],
    ["Chunks", state.stats.chunks || 0],
    ["Highlights", state.stats.highlights || 0],
    ["Pending Jobs", state.stats.pendingJobs || 0],
    ["Failed Jobs", state.stats.failedJobs || 0]
  ];

  el("kpi-grid").innerHTML = metrics.map(([label, value]) => `
    <div class="kpi">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>
  `).join("");
}

function renderSources() {
  renderList(el("sources-list"), state.sources, (s) => `
    <strong>${escapeHtml(s.name)}</strong>
    <div class="meta">${escapeHtml(s.type)} · ${escapeHtml(s.path || "-")}</div>
  `, "No sources registered");
}

function renderDocuments() {
  renderList(el("documents-list"), state.documents, (d) => `
    <strong>${escapeHtml(d.title || d.sourcePath)}</strong>
    <div class="meta">${escapeHtml(d.sourceType)} · ${escapeHtml(d.sourcePath || "-")}</div>
  `, "No documents ingested");

  renderList(el("dashboard-docs"), state.documents.slice(0, 6), (d) => `
    <strong>${escapeHtml(d.title || d.sourcePath)}</strong>
    <div class="meta">${escapeHtml(d.sourceType)}</div>
  `, "No documents yet");
}

function renderHighlights() {
  renderList(el("highlights-list"), state.highlights, (h) => `
    <strong>${escapeHtml(h.sourceBook || h.sourceType || "Highlight")}</strong>
    <div>${escapeHtml((h.highlightText || "").slice(0, 240))}</div>
  `, "No highlights stored");

  renderList(el("dashboard-highlights"), state.highlights.slice(0, 6), (h) => `
    <strong>${escapeHtml(h.sourceBook || "Highlight")}</strong>
    <div class="meta">${escapeHtml((h.highlightText || "").slice(0, 120))}</div>
  `, "No highlights yet");
}

async function refreshStats() {
  state.stats = await api("/admin/stats");
  el("admin-stats").textContent = JSON.stringify(state.stats, null, 2);
  renderKpis();
}

async function refreshSources() {
  state.sources = await api("/sources");
  renderSources();
}

async function refreshDocuments() {
  state.documents = await api("/documents?limit=120");
  renderDocuments();
}

async function refreshHighlights() {
  state.highlights = await api("/highlights?limit=120");
  renderHighlights();
}

async function refreshAll() {
  await Promise.all([refreshStats(), refreshSources(), refreshDocuments(), refreshHighlights()]);
}

function setTab(tab) {
  for (const panel of document.querySelectorAll(".panel")) {
    panel.classList.toggle("active", panel.id === tab);
  }

  for (const button of document.querySelectorAll("#nav-tabs button")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }

  const [title, subtitle] = tabMeta[tab] || ["DocForge", ""];
  el("page-title").textContent = title;
  el("page-subtitle").textContent = subtitle;
}

document.querySelectorAll("#nav-tabs button").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

el("global-refresh").addEventListener("click", async () => {
  try {
    await refreshAll();
    showToast("Data refreshed");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("source-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    await api("/sources", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        type: form.get("type"),
        path: form.get("path")
      })
    });
    event.target.reset();
    await refreshAll();
    showToast("Source added and queued");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("highlight-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.target);

  try {
    await api("/highlights", {
      method: "POST",
      body: JSON.stringify({
        sourceBook: form.get("sourceBook"),
        highlightText: form.get("highlightText")
      })
    });
    event.target.reset();
    await refreshHighlights();
    await refreshStats();
    showToast("Highlight saved");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = String(new FormData(event.target).get("query") || "").trim();
  if (!query) {
    return;
  }

  try {
    const result = await api("/search", {
      method: "POST",
      body: JSON.stringify({ query, limit: 8 })
    });

    const blocks = [];
    for (const chunk of result.chunks || []) {
      blocks.push(`
        <div class="result">
          <div class="score">score ${(chunk.score || 0).toFixed(3)} · ${escapeHtml(chunk.metadata?.title || "chunk")}</div>
          <div>${escapeHtml((chunk.text || "").slice(0, 320))}</div>
        </div>
      `);
    }

    for (const h of result.highlights || []) {
      blocks.push(`
        <div class="result">
          <div class="score">highlight · ${escapeHtml(h.sourceBook || "")}</div>
          <div>${escapeHtml((h.highlightText || "").slice(0, 240))}</div>
        </div>
      `);
    }

    el("search-results").innerHTML = blocks.join("") || "No matches";
  } catch (error) {
    showToast(error.message, true);
  }
});

el("clip-submit").addEventListener("click", async () => {
  const form = new FormData(el("clip-form"));
  const highlights = String(form.get("highlights") || "").split("|").map((x) => x.trim()).filter(Boolean);

  try {
    const result = await api("/clip", {
      method: "POST",
      body: JSON.stringify({
        url: form.get("url"),
        title: form.get("title"),
        author: form.get("author"),
        html: form.get("html"),
        highlights
      })
    });
    el("clip-result").textContent = JSON.stringify(result, null, 2);
    await refreshAll();
    showToast("Clip ingested");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("import-url").addEventListener("click", async () => {
  const form = new FormData(el("clip-form"));
  const url = String(form.get("url") || "").trim();
  if (!url) {
    showToast("URL is required", true);
    return;
  }

  try {
    const result = await api("/import-url", {
      method: "POST",
      body: JSON.stringify({ url })
    });
    el("clip-result").textContent = JSON.stringify(result, null, 2);
    await refreshAll();
    showToast("URL imported");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("refresh-sources").addEventListener("click", () => refreshSources().then(() => showToast("Sources refreshed")).catch((e) => showToast(e.message, true)));
el("refresh-docs").addEventListener("click", () => refreshDocuments().then(() => showToast("Documents refreshed")).catch((e) => showToast(e.message, true)));
el("refresh-highlights").addEventListener("click", () => refreshHighlights().then(() => showToast("Highlights refreshed")).catch((e) => showToast(e.message, true)));
el("refresh-stats").addEventListener("click", () => refreshStats().then(() => showToast("Stats refreshed")).catch((e) => showToast(e.message, true)));

async function runAdmin(path, successMessage) {
  try {
    await api(path, { method: "POST", body: JSON.stringify({}) });
    await refreshAll();
    showToast(successMessage);
  } catch (error) {
    showToast(error.message, true);
  }
}

el("reindex-all").addEventListener("click", () => runAdmin("/reindex", "Reindex queued"));
el("scan-sources").addEventListener("click", () => runAdmin("/admin/scan-sources", "Sources scan queued"));
el("process-jobs").addEventListener("click", () => runAdmin("/admin/process-jobs", "Jobs processed"));
el("retry-failed").addEventListener("click", () => runAdmin("/admin/retry-failed", "Failed jobs requeued"));
el("reembed").addEventListener("click", () => runAdmin("/admin/reembed-missing", "Missing embeddings repaired"));

(async () => {
  try {
    await refreshAll();
    setTab("dashboard");
  } catch (error) {
    showToast(error.message, true);
  }
})();
