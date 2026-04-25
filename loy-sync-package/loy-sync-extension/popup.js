/**
 * Library of Yore Sync — Popup Script
 */

// ── DOM refs ──────────────────────────────────────────────────────────────────
const serverDot      = document.getElementById("server-dot");
const offlineBanner  = document.getElementById("offline-banner");
const noDetection    = document.getElementById("no-detection");
const detectionInfo  = document.getElementById("detection-info");
const detSite        = document.getElementById("det-site");
const detTitle       = document.getElementById("det-title");
const detChapter     = document.getElementById("det-chapter");
const libraryRow     = document.getElementById("library-row");
const libChapter     = document.getElementById("lib-chapter");
const syncResultEl   = document.getElementById("sync-result");
const syncBtn        = document.getElementById("sync-btn");
const historyList    = document.getElementById("history-list");
const noHistory      = document.getElementById("no-history");
const clearHistoryBtn= document.getElementById("clear-history-btn");

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts) {
  const diff = Date.now() - ts;
  const s = Math.floor(diff / 1000);
  if (s < 60)  return "just now";
  const m = Math.floor(s / 60);
  if (m < 60)  return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24)  return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function showSyncResult(result) {
  if (!result) { syncResultEl.classList.add("hidden"); return; }

  syncResultEl.classList.remove("hidden", "success", "info", "warn", "error");

  if (result.error) {
    if (result.error.includes("not found") || result.error.toLowerCase().includes("not found")) {
      syncResultEl.textContent = "Novel not in library — add it with the source URL set.";
      syncResultEl.classList.add("warn");
    } else {
      syncResultEl.textContent = "⚠ " + result.error;
      syncResultEl.classList.add("error");
    }
    return;
  }

  if (result.updated) {
    syncResultEl.textContent = `✓ Synced: Ch ${result.old_chapter} → Ch ${result.new_chapter}`;
    syncResultEl.classList.add("success");
  } else if (result.updated === false) {
    syncResultEl.textContent = `Already tracked at Ch ${result.current_chapter}.`;
    syncResultEl.classList.add("info");
  }
}

// ── Render history ────────────────────────────────────────────────────────────

function renderHistory(history) {
  historyList.innerHTML = "";

  if (!history || history.length === 0) {
    historyList.appendChild(noHistory);
    noHistory.classList.remove("hidden");
    return;
  }

  history.forEach((entry) => {
    const item = document.createElement("div");
    item.className = "history-item";

    const icon = entry.updated ? "📖" : "–";
    const meta = entry.updated
      ? `Ch ${entry.old_chapter} → Ch ${entry.chapter}`
      : `Already at Ch ${entry.chapter}`;

    item.innerHTML = `
      <span class="history-icon">${icon}</span>
      <div class="history-body">
        <div class="history-title">${escHtml(entry.title || "Unknown")}</div>
        <div class="history-meta">${escHtml(entry.site || "")} · ${escHtml(meta)}</div>
      </div>
      <div class="history-time">${relativeTime(entry.timestamp)}</div>
    `;
    historyList.appendChild(item);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Render detection ──────────────────────────────────────────────────────────

function renderDetection(lastDetection) {
  if (!lastDetection || !lastDetection.chapter) {
    noDetection.classList.remove("hidden");
    detectionInfo.classList.add("hidden");
    syncBtn.classList.add("hidden");
    return;
  }

  noDetection.classList.add("hidden");
  detectionInfo.classList.remove("hidden");

  detSite.textContent    = lastDetection.site || "?";
  detTitle.textContent   = lastDetection.title || lastDetection.baseUrl || lastDetection.currentUrl || "Unknown";
  detChapter.textContent = `Ch ${lastDetection.chapter}`;

  const sr = lastDetection.syncResult;
  showSyncResult(sr);

  // Show library progress if available
  if (sr && !sr.error) {
    libraryRow.style.display = "flex";
    if (sr.updated) {
      libChapter.textContent = `Ch ${sr.new_chapter}`;
    } else if (sr.current_chapter !== undefined) {
      libChapter.textContent = `Ch ${sr.current_chapter}`;
    } else {
      libraryRow.style.display = "none";
    }
  } else {
    libraryRow.style.display = "none";
  }

  // Show manual sync button if not yet synced or server was offline
  const canManualSync = sr?.error || sr?.updated === false;
  if (canManualSync) {
    syncBtn.classList.remove("hidden");
    syncBtn.disabled = false;
    syncBtn.textContent = "Sync Now";
  } else {
    syncBtn.classList.add("hidden");
  }
}

// ── Manual sync ───────────────────────────────────────────────────────────────

syncBtn.addEventListener("click", async () => {
  const { lastDetection } = await chrome.storage.local.get("lastDetection");
  if (!lastDetection) return;

  syncBtn.disabled = true;
  syncBtn.textContent = "Syncing…";

  chrome.runtime.sendMessage(
    { type: "MANUAL_SYNC", payload: lastDetection },
    async (response) => {
      const sr = response?.syncResult;
      showSyncResult(sr);

      // Refresh history
      const { syncHistory = [] } = await chrome.storage.local.get("syncHistory");
      renderHistory(syncHistory);

      if (sr?.updated) {
        syncBtn.classList.add("hidden");
        if (libraryRow) {
          libraryRow.style.display = "flex";
          libChapter.textContent = `Ch ${sr.new_chapter}`;
        }
      } else {
        syncBtn.disabled = false;
        syncBtn.textContent = "Sync Now";
      }
    }
  );
});

// ── Clear history ─────────────────────────────────────────────────────────────

clearHistoryBtn.addEventListener("click", async () => {
  await chrome.storage.local.set({ syncHistory: [] });
  renderHistory([]);
});

// ── Init ──────────────────────────────────────────────────────────────────────

async function init() {
  // Ask background for current status
  chrome.runtime.sendMessage({ type: "GET_STATUS" }, (response) => {
    if (chrome.runtime.lastError || !response) {
      serverDot.classList.add("offline");
      offlineBanner.classList.remove("hidden");
      return;
    }

    const { serverUp, lastDetection, syncHistory } = response;

    // Server dot
    serverDot.classList.remove("hidden");
    serverDot.classList.toggle("online",  serverUp);
    serverDot.classList.toggle("offline", !serverUp);
    serverDot.title = serverUp ? "Server online" : "Server offline";
    if (!serverUp) offlineBanner.classList.remove("hidden");

    // Detection panel
    renderDetection(lastDetection);

    // History
    renderHistory(syncHistory);
  });
}

init();
