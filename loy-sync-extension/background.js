/**
 * Library of Yore Sync — Background Service Worker
 * ==================================================
 * Receives chapter detection messages from content.js,
 * communicates with the local LOY server, and manages
 * extension badge + sync history.
 */

const API_BASE = "http://localhost:7185";
const MAX_HISTORY = 30;

// ── Badge helpers ─────────────────────────────────────────────────────────────

function setBadge(text, color) {
  chrome.action.setBadgeText({ text: String(text) });
  chrome.action.setBadgeBackgroundColor({ color: color || "#4caf50" });
}

function clearBadge() {
  chrome.action.setBadgeText({ text: "" });
}

// ── Server communication ──────────────────────────────────────────────────────

async function checkServerStatus() {
  try {
    const res = await fetch(`${API_BASE}/api/status`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function syncChapter(info) {
  /**
   * info: { site, chapter, baseUrl, title, currentUrl }
   * Returns the server response JSON, or an error object.
   */
  const payload = {
    source_url:  info.baseUrl || info.currentUrl,
    chapter:     info.chapter,
    novel_title: info.title || "",
  };

  try {
    const res = await fetch(`${API_BASE}/api/sync`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(payload),
      signal:  AbortSignal.timeout(4000),
    });
    return await res.json();
  } catch (err) {
    return { error: err.message || "Network error" };
  }
}

async function matchNovel(baseUrl) {
  try {
    const res = await fetch(
      `${API_BASE}/api/novels/match?url=${encodeURIComponent(baseUrl)}`,
      { signal: AbortSignal.timeout(3000) }
    );
    return await res.json();
  } catch (err) {
    return { found: false, error: err.message };
  }
}

// ── Sync history (stored in chrome.storage.local) ────────────────────────────

async function getHistory() {
  const { syncHistory = [] } = await chrome.storage.local.get("syncHistory");
  return syncHistory;
}

async function pushHistory(entry) {
  const history = await getHistory();
  history.unshift(entry); // newest first
  if (history.length > MAX_HISTORY) history.length = MAX_HISTORY;
  await chrome.storage.local.set({ syncHistory: history });
}

// ── Last detection state (for popup) ─────────────────────────────────────────

async function saveLastDetection(info, syncResult) {
  await chrome.storage.local.set({
    lastDetection: {
      ...info,
      syncResult,
      timestamp: Date.now(),
    },
  });
}

// ── Main message handler ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "CHAPTER_DETECTED") {
    handleChapterDetected(message.payload, sender, sendResponse);
    return true; // Keep channel open for async response
  }

  if (message.type === "GET_STATUS") {
    handleGetStatus(sendResponse);
    return true;
  }

  if (message.type === "MANUAL_SYNC") {
    handleManualSync(message.payload, sendResponse);
    return true;
  }
});

async function handleChapterDetected(info, sender, sendResponse) {
  // 1. Check server is up
  const serverUp = await checkServerStatus();
  if (!serverUp) {
    setBadge("!", "#f44336");
    await saveLastDetection(info, { error: "Server offline" });
    sendResponse({ syncResult: { error: "Server offline" } });
    return;
  }

  // 2. Attempt sync
  const syncResult = await syncChapter(info);

  // 3. Update badge
  if (syncResult?.error) {
    // Novel not in library (404) — show orange warning
    setBadge("?", "#ff9800");
  } else if (syncResult?.updated) {
    setBadge("✓", "#4caf50");
  } else {
    // Already up to date
    setBadge("–", "#2196f3");
  }

  // Clear badge after 8 seconds
  setTimeout(clearBadge, 8000);

  // 4. Save to history if novel was found
  if (syncResult?.title) {
    await pushHistory({
      timestamp:   Date.now(),
      title:       syncResult.title,
      chapter:     info.chapter,
      updated:     syncResult.updated,
      old_chapter: syncResult.old_chapter,
      site:        info.site,
    });
  }

  // 5. Persist last detection for popup
  await saveLastDetection(info, syncResult);

  // 6. Reply to content.js so it can show a toast
  sendResponse({ syncResult });
}

async function handleGetStatus(sendResponse) {
  const serverUp = await checkServerStatus();
  const { lastDetection, syncHistory = [] } = await chrome.storage.local.get([
    "lastDetection",
    "syncHistory",
  ]);
  sendResponse({ serverUp, lastDetection, syncHistory });
}

async function handleManualSync(info, sendResponse) {
  const serverUp = await checkServerStatus();
  if (!serverUp) {
    sendResponse({ error: "Library of Yore server is offline. Run: python loy_server.py" });
    return;
  }
  const syncResult = await syncChapter(info);
  if (syncResult?.title) {
    await pushHistory({
      timestamp:   Date.now(),
      title:       syncResult.title,
      chapter:     info.chapter,
      updated:     syncResult.updated,
      old_chapter: syncResult.old_chapter,
      site:        info.site,
      manual:      true,
    });
  }
  await saveLastDetection(info, syncResult);
  sendResponse({ syncResult });
}

// ── Startup: check server + set initial badge ─────────────────────────────────

chrome.runtime.onStartup.addListener(async () => {
  const up = await checkServerStatus();
  if (!up) setBadge("!", "#f44336");
});

chrome.runtime.onInstalled.addListener(async () => {
  const up = await checkServerStatus();
  if (!up) setBadge("!", "#f44336");
});
