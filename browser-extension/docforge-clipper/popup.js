const apiInput = document.getElementById("apiBase");
const titleInput = document.getElementById("title");
const noteInput = document.getElementById("note");
const statusBox = document.getElementById("status");

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.style.color = isError ? "#922f24" : "#1f4d3b";
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

async function getPageCapture(activeTab, mode) {
  const injection = await chrome.scripting.executeScript({
    target: { tabId: activeTab.id },
    func: (captureMode) => {
      const selected = String(window.getSelection ? window.getSelection().toString() : "").trim();
      const pageText = (document.body?.innerText || "").replace(/\s+/g, " ").trim();
      const excerpt = pageText.slice(0, 1800);

      if (captureMode === "selection") {
        return {
          url: location.href,
          title: document.title || location.href,
          text: selected
        };
      }

      return {
        url: location.href,
        title: document.title || location.href,
        text: selected || excerpt
      };
    },
    args: [mode]
  });

  return injection[0].result;
}

async function postClip(payload) {
  const apiBase = String(apiInput.value || "http://localhost:48080").trim().replace(/\/$/, "");
  await chrome.storage.local.set({ docforgeApiBase: apiBase });

  const response = await fetch(`${apiBase}/clip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

async function capture(mode) {
  try {
    setStatus("Capturing from active tab...");
    const tab = await getActiveTab();

    if (!tab || !tab.id) {
      throw new Error("No active tab found");
    }

    const page = await getPageCapture(tab, mode);
    if (!page.text || !page.text.trim()) {
      throw new Error(mode === "selection" ? "No selected text found" : "No captureable page text found");
    }

    const note = String(noteInput.value || "").trim();
    const titleOverride = String(titleInput.value || "").trim();
    const payload = {
      url: page.url,
      title: titleOverride || page.title,
      author: "",
      html: page.text,
      highlights: [page.text],
      note
    };

    const result = await postClip(payload);
    setStatus(`Saved to DocForge\nDocument: ${result.ingestedDocument ? "yes" : "no"}\nHighlights: ${result.ingestedHighlights || 0}`);
  } catch (error) {
    setStatus(`Error: ${error.message}`, true);
  }
}

document.getElementById("captureSelection").addEventListener("click", () => capture("selection"));
document.getElementById("capturePage").addEventListener("click", () => capture("page"));

(async () => {
  const stored = await chrome.storage.local.get(["docforgeApiBase"]);
  apiInput.value = stored.docforgeApiBase || "http://localhost:48080";
})();
