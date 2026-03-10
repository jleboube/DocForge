const state = {
  sources: [],
  documents: [],
  highlights: [],
  stats: {},
  auth: {
    token: localStorage.getItem("docforge_token") || "",
    user: (() => {
      try {
        const raw = localStorage.getItem("docforge_user");
        return raw ? JSON.parse(raw) : null;
      } catch (_error) {
        return null;
      }
    })(),
    config: null
  }
};

const tabMeta = {
  dashboard: ["Dashboard", "Operations overview across ingestion, highlights, and retrieval."],
  sources: ["Sources", "Register and manage ingestion origins."],
  documents: ["Documents", "Recently ingested source documents."],
  highlights: ["Highlights", "Readwise-like personal highlight library."],
  search: ["Search", "Hybrid semantic and keyword retrieval."],
  ingest: ["Web Capture", "Ingest pasted content or import directly from URL."],
  admin: ["Admin", "Run reconciliation, processing, and recovery actions."],
  help: ["Help", "Import guides, extension setup, and artifact tagging instructions."]
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

function parseTagsCsv(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function showToast(message, isError = false) {
  const toast = el("toast");
  toast.textContent = message;
  toast.style.background = isError ? "#6a1f18" : "#163629";
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 1800);
}

function setAuthStatus(text, isError = false) {
  const box = el("auth-status");
  box.textContent = text;
  box.style.color = isError ? "#8e2c20" : "#1d4e3a";
}

function setAuth(token, user) {
  state.auth.token = token || "";
  state.auth.user = user || null;

  if (state.auth.token) {
    localStorage.setItem("docforge_token", state.auth.token);
  } else {
    localStorage.removeItem("docforge_token");
  }

  if (state.auth.user) {
    localStorage.setItem("docforge_user", JSON.stringify(state.auth.user));
  } else {
    localStorage.removeItem("docforge_user");
  }

  const isAuthed = Boolean(state.auth.token && state.auth.user);
  const appShell = document.querySelector(".app-shell");
  if (appShell) {
    appShell.classList.toggle("hidden", !isAuthed);
  }
  el("marketing").classList.toggle("hidden", isAuthed);
  el("auth-panel").classList.toggle("hidden", isAuthed);
  el("google-login-btn").classList.toggle("hidden", isAuthed);
  el("apple-login").classList.toggle("hidden", isAuthed);
  el("logout").classList.toggle("hidden", !isAuthed);
  el("user-chip").classList.toggle("hidden", !isAuthed);
  el("user-chip").textContent = isAuthed ? `${state.auth.user.name || state.auth.user.email}` : "";
}

function requireAuth() {
  if (!state.auth.token) {
    setAuthStatus("Please sign in with Google first.", true);
    throw new Error("authentication required");
  }
}

async function api(path, options = {}, requiresAuth = true) {
  if (requiresAuth) {
    requireAuth();
  }

  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.auth.token) {
    headers.Authorization = `Bearer ${state.auth.token}`;
  }

  const response = await fetch(`/api${path}`, {
    ...options,
    headers
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && requiresAuth) {
      setAuth("", null);
      setAuthStatus("Session expired. Sign in again.", true);
    }
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
    <div class="meta">tags: ${escapeHtml((d.tags || []).join(", ") || "-")}</div>
    ${d.originalFile && d.originalFile.storagePath ? `<a href="/api/documents/${escapeHtml(d._id)}/original" target="_blank" rel="noopener noreferrer">Download Original</a>` : ""}
    <button class="ghost set-doc-tags" data-id="${escapeHtml(d._id)}" type="button">Set Tags</button>
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
    <div class="meta">tags: ${escapeHtml((h.tags || []).join(", ") || "-")}</div>
    <button class="ghost set-highlight-tags" data-id="${escapeHtml(h._id)}" type="button">Set Tags</button>
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

function updateHostPills() {
  el("web-host-pill").textContent = window.location.host;
  const configuredApiUrl = state.auth.config?.publicApiUrl || `${window.location.origin}/api`;

  try {
    const apiHost = new URL(configuredApiUrl).host;
    el("api-host-pill").textContent = apiHost;
  } catch (_error) {
    el("api-host-pill").textContent = configuredApiUrl;
  }
}

async function initializeGoogleAuth() {
  state.auth.config = await api("/auth/config", {}, false);
  updateHostPills();

  const mode = state.auth.config.googleAuthMode;
  if (mode !== "authorization_code") {
    setAuthStatus("Google OAuth authorization code flow is not fully configured on API.", true);
    return;
  }
}

function beginGoogleOAuth() {
  if (!state.auth.config || state.auth.config.googleAuthMode !== "authorization_code") {
    setAuthStatus("Google OAuth is not ready. Configure client ID, secret, and redirect URI.", true);
    return;
  }

  setAuthStatus("Redirecting to Google...");
  const returnTo = window.location.origin;
  window.location.href = `/api/auth/google/start?returnTo=${encodeURIComponent(returnTo)}`;
}

document.querySelectorAll("#nav-tabs button").forEach((button) => {
  button.addEventListener("click", () => setTab(button.dataset.tab));
});

el("logout").addEventListener("click", () => {
  setAuth("", null);
  showToast("Signed out");
});

el("google-login-btn").addEventListener("click", beginGoogleOAuth);
el("marketing-google-login").addEventListener("click", beginGoogleOAuth);

el("apple-login").addEventListener("click", async () => {
  try {
    const result = await api("/auth/apple", { method: "POST" }, false);
    setAuthStatus(result.setup || "Apple OAuth not yet enabled.", true);
  } catch (error) {
    setAuthStatus(error.message, true);
  }
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
        highlightText: form.get("highlightText"),
        tags: parseTagsCsv(form.get("tags"))
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

el("tag-search-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const tag = String(new FormData(event.target).get("tag") || "").trim();
  if (!tag) {
    return;
  }

  try {
    const result = await api(`/artifacts/by-tag?tag=${encodeURIComponent(tag)}&limit=30`);
    const blocks = [];

    for (const doc of result.documents || []) {
      blocks.push(`
        <div class="result">
          <div class="score">document · ${(doc.tags || []).join(", ") || "-"}</div>
          <div>${escapeHtml(doc.title || doc.sourcePath || "Document")}</div>
        </div>
      `);
    }

    for (const h of result.highlights || []) {
      blocks.push(`
        <div class="result">
          <div class="score">highlight · ${(h.tags || []).join(", ") || "-"}</div>
          <div>${escapeHtml((h.highlightText || "").slice(0, 240))}</div>
        </div>
      `);
    }

    el("search-results").innerHTML = blocks.join("") || "No tag matches";
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
        highlights,
        tags: parseTagsCsv(form.get("tags"))
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
      body: JSON.stringify({
        url,
        tags: parseTagsCsv(form.get("tags"))
      })
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

el("documents-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".set-doc-tags");
  if (!button) {
    return;
  }

  const id = button.getAttribute("data-id");
  const value = window.prompt("Enter tags (comma-separated):", "");
  if (value === null) {
    return;
  }

  try {
    await api(`/documents/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: parseTagsCsv(value) })
    });
    await refreshDocuments();
    showToast("Document tags updated");
  } catch (error) {
    showToast(error.message, true);
  }
});

el("highlights-list").addEventListener("click", async (event) => {
  const button = event.target.closest(".set-highlight-tags");
  if (!button) {
    return;
  }

  const id = button.getAttribute("data-id");
  const value = window.prompt("Enter tags (comma-separated):", "");
  if (value === null) {
    return;
  }

  try {
    await api(`/highlights/${id}/tags`, {
      method: "POST",
      body: JSON.stringify({ tags: parseTagsCsv(value) })
    });
    await refreshHighlights();
    showToast("Highlight tags updated");
  } catch (error) {
    showToast(error.message, true);
  }
});

(async () => {
  try {
    if (window.location.hash && window.location.hash.startsWith("#authToken=")) {
      const rawToken = decodeURIComponent(window.location.hash.slice("#authToken=".length));
      if (rawToken) {
        setAuth(rawToken, state.auth.user);
        history.replaceState({}, document.title, window.location.pathname + window.location.search);
      }
    }

    setTab("dashboard");
    setAuth(state.auth.token, state.auth.user);
    updateHostPills();
    await initializeGoogleAuth();

    if (state.auth.token) {
      const me = await api("/auth/me");
      setAuth(state.auth.token, me);
      await refreshAll();
    }
  } catch (error) {
    setAuth("", null);
    setAuthStatus(error.message, true);
  }
})();
