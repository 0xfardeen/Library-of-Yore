/**
 * Library of Yore Sync — Content Script
 * ========================================
 * Runs on supported novel sites. Detects the current chapter number
 * and the novel's base URL, then notifies the background service worker.
 *
 * Each SITE_CONFIG entry describes how to handle one family of sites:
 *   isChapterPage(url)  → boolean: is this actually a chapter reader page?
 *   getChapter(url, doc) → number | null: what chapter number is this?
 *   getBaseUrl(url, doc) → string | null: what is the novel's index/info URL?
 *   getNovelTitle(doc)  → string | null: (optional) DOM-based title fallback
 */

// ── Site configuration table ──────────────────────────────────────────────────

const SITE_CONFIG = [

  // ── Novelfire ──────────────────────────────────────────────────────────────
  {
    name: "Novelfire",
    test: (host) => /novelfire\.(net|com)/.test(host),

    isChapterPage(url) {
      return /\/book\/[^/?#]+\/chapter-\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/\/chapter-(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url) {
      const m = url.match(/(https?:\/\/[^/]+\/book\/[^/?#]+)/i);
      return m ? m[1] : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".book-name, h1.title, .novel-title")?.textContent?.trim() || null;
    },
  },

  // ── FreeWebNovel ──────────────────────────────────────────────────────────
  {
    name: "FreeWebNovel",
    test: (host) => host.includes("freewebnovel.com"),

    isChapterPage(url) {
      // Chapter URLs: /novel-slug/chapter-20.html  OR  /novel-slug/chapter-20
      return /\/[^/?#]+\/chapter[-‑]\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/\/chapter[-‑](\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url) {
      // Novel base: https://freewebnovel.com/novel-slug.html
      const m = url.match(/(https?:\/\/[^/]+)\/([^/?#]+)\/chapter/i);
      if (m) return `${m[1]}/${m[2]}.html`;
      return null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".m-info h1.tit, h1.novel-title, .book-name")?.textContent?.trim() || null;
    },
  },

  // ── Wuxiaworld ───────────────────────────────────────────────────────────
  {
    name: "Wuxiaworld",
    test: (host) => host.includes("wuxiaworld.com"),

    isChapterPage(url) {
      // /novel/title/title-chapter-123
      return /\/novel\/[^/?#]+\/[^/?#]+-chapter-\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/chapter-(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url) {
      const m = url.match(/(https?:\/\/[^/]+\/novel\/[^/?#]+)/i);
      return m ? m[1] : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector("h1.novel-name, .novel-body h1")?.textContent?.trim() || null;
    },
  },

  // ── Webnovel ─────────────────────────────────────────────────────────────
  {
    name: "Webnovel",
    test: (host) => host.includes("webnovel.com"),

    isChapterPage(url) {
      return /\/book\/[^/?#]+\/[^/?#]+_\d+/i.test(url);
    },
    getChapter(url, doc) {
      // Try URL first: chapter title often has a number
      const urlM = url.match(/chapter[-‑](\d+)/i);
      if (urlM) return parseInt(urlM[1], 10);
      // DOM fallback
      const heading = doc.querySelector(".cha-tit h3, .chapter-title")?.textContent || "";
      const domM = heading.match(/chapter\s*(\d+)/i);
      return domM ? parseInt(domM[1], 10) : null;
    },
    getBaseUrl(url) {
      const m = url.match(/(https?:\/\/[^/]+\/book\/[^/?#]+)/i);
      return m ? m[1] : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".g_thumb img")?.alt || doc.querySelector("h1")?.textContent?.trim() || null;
    },
  },

  // ── Royal Road ───────────────────────────────────────────────────────────
  {
    name: "Royal Road",
    test: (host) => host.includes("royalroad.com"),

    isChapterPage(url) {
      return /\/fiction\/\d+\/[^/?#]+\/chapter\/\d+/i.test(url);
    },
    getChapter(url, doc) {
      // DOM: <h1> or <h2> containing "Chapter N"
      const heading = doc.querySelector(".chapter-title h1, .chapter-content h2, h1")?.textContent || "";
      const m = heading.match(/chapter\s*(\d+)/i);
      if (m) return parseInt(m[1], 10);
      // Fallback: check progress or chapter list number
      return null;
    },
    getBaseUrl(url) {
      const m = url.match(/(https?:\/\/[^/]+\/fiction\/\d+\/[^/?#]+)/i);
      return m ? m[1] : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".fic-title h1, h1.font-white")?.textContent?.trim() || null;
    },
  },

  // ── Scribble Hub ─────────────────────────────────────────────────────────
  {
    name: "Scribble Hub",
    test: (host) => host.includes("scribblehub.com"),

    isChapterPage(url) {
      return /\/read\/\d+[^/?#]*\/chapter\/\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/\/chapter\/(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url, doc) {
      // Breadcrumb link to novel page
      const bcLink = doc.querySelector(".wi_fic_title a, .chp_byauthor a");
      if (bcLink) return bcLink.href;
      // Reconstruct from URL: /read/12345-slug/... → /series/12345/slug/
      const m = url.match(/\/read\/(\d+)[-‑]([^/?#]+)\//i);
      if (m) {
        const origin = new URL(url).origin;
        return `${origin}/series/${m[1]}/${m[2]}/`;
      }
      return null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".wi_fic_title, .fic_title")?.textContent?.trim() || null;
    },
  },

  // ── LightNovelWorld / LightNovelPub / NovelPub ────────────────────────────
  {
    name: "LightNovelWorld",
    test: (host) => /light(novel(world|pub)|novelpub)|novelpub/.test(host),

    isChapterPage(url) {
      return /\/novel\/[^/?#]+\/chapter-\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/\/chapter-(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url) {
      const m = url.match(/(https?:\/\/[^/]+\/novel\/[^/?#]+)/i);
      return m ? m[1] : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector(".novel-title, h1.novel-name")?.textContent?.trim() || null;
    },
  },

  // ── MTLNovel ──────────────────────────────────────────────────────────────
  {
    name: "MTLNovel",
    test: (host) => host.includes("mtlnovel.com"),

    isChapterPage(url) {
      return /\/[^/?#]+-chapter-\d+/i.test(url);
    },
    getChapter(url) {
      const m = url.match(/chapter-(\d+)/i);
      return m ? parseInt(m[1], 10) : null;
    },
    getBaseUrl(url) {
      // https://www.mtlnovel.com/novel-name-chapter-20/ → /novel-name/
      const m = url.match(/(https?:\/\/[^/]+\/[^/?#]+?)-chapter-\d+/i);
      return m ? m[1] + "/" : null;
    },
    getNovelTitle(doc) {
      return doc.querySelector("h1.entry-title, .novel-title")?.textContent?.trim() || null;
    },
  },
];


// ── Generic chapter extractor (last resort) ───────────────────────────────────

function genericExtract(url, doc) {
  // Try chapter number from URL
  const urlM = url.match(/chapter[-_‑]?(\d+)/i);
  const chapter = urlM ? parseInt(urlM[1], 10) : null;

  // Try novel title from DOM
  const title = doc.querySelector("h1")?.textContent?.trim() || null;

  // We can't reliably determine the base URL generically
  return { chapter, title, baseUrl: null };
}


// ── Main detection logic ──────────────────────────────────────────────────────

function detectChapter() {
  const url = window.location.href;
  const host = window.location.hostname.toLowerCase();

  // Find matching site config
  const site = SITE_CONFIG.find((s) => s.test(host));

  if (site) {
    if (!site.isChapterPage(url)) return null; // Not a chapter reader page

    const chapter = site.getChapter(url, document);
    const baseUrl = site.getBaseUrl(url, document) || null;
    const title   = site.getNovelTitle ? site.getNovelTitle(document) : null;

    if (!chapter) return null;

    return {
      site: site.name,
      chapter,
      baseUrl,
      title,
      currentUrl: url,
    };
  }

  // Generic fallback
  const { chapter, title } = genericExtract(url, document);
  if (!chapter) return null;

  return {
    site: "Unknown",
    chapter,
    baseUrl: null,
    title,
    currentUrl: url,
  };
}


// ── Send detection result to background ──────────────────────────────────────

function sendToBackground(info) {
  chrome.runtime.sendMessage(
    { type: "CHAPTER_DETECTED", payload: info },
    (response) => {
      if (chrome.runtime.lastError) {
        // Extension reloaded or not available — silent fail
        return;
      }
      if (response?.syncResult) {
        injectToast(info, response.syncResult);
      }
    }
  );
}


// ── Subtle reading-progress toast ────────────────────────────────────────────

function injectToast(info, syncResult) {
  // Don't double-inject
  if (document.getElementById("loy-sync-toast")) return;

  const toast = document.createElement("div");
  toast.id = "loy-sync-toast";

  const isUpdated = syncResult?.updated === true;
  const isNotFound = syncResult?.error?.includes("not found") || syncResult?.found === false;

  const icon   = isUpdated ? "📖" : isNotFound ? "❓" : "✓";
  const color  = isUpdated ? "#4caf50" : isNotFound ? "#ff9800" : "#2196f3";
  let   text   = "";

  if (isUpdated) {
    text = `<b>Library of Yore</b><br>${syncResult.title}<br>Ch ${syncResult.old_chapter} → Ch ${syncResult.new_chapter}`;
  } else if (isNotFound) {
    text = `<b>Library of Yore</b><br>Novel not in library`;
  } else if (syncResult?.updated === false) {
    text = `<b>Library of Yore</b><br>Already at Ch ${syncResult.current_chapter}`;
  } else {
    text = `<b>Library of Yore</b><br>Ch ${info.chapter} detected`;
  }

  toast.innerHTML = `${icon} ${text}`;

  Object.assign(toast.style, {
    position:     "fixed",
    bottom:       "24px",
    right:        "24px",
    zIndex:       "2147483647",
    background:   "#1e1e1e",
    color:        "#e0e0e0",
    border:       `2px solid ${color}`,
    borderRadius: "10px",
    padding:      "10px 16px",
    fontSize:     "13px",
    lineHeight:   "1.5",
    boxShadow:    "0 4px 20px rgba(0,0,0,0.5)",
    cursor:       "pointer",
    maxWidth:     "260px",
    fontFamily:   "system-ui, sans-serif",
    transition:   "opacity 0.4s ease",
    opacity:      "0",
  });

  document.body.appendChild(toast);

  // Fade in
  requestAnimationFrame(() => { toast.style.opacity = "1"; });

  // Fade out after 5 s
  setTimeout(() => {
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 500);
  }, 5000);

  toast.addEventListener("click", () => toast.remove());
}


// ── Throttle: don't re-trigger on minor navigation events ────────────────────

let _lastSyncUrl = "";
let _lastSyncChapter = -1;

function maybeSync() {
  const info = detectChapter();
  if (!info) return;

  // Skip if same chapter on same URL
  if (info.currentUrl === _lastSyncUrl && info.chapter === _lastSyncChapter) return;

  _lastSyncUrl = info.currentUrl;
  _lastSyncChapter = info.chapter;

  sendToBackground(info);
}


// ── Run on initial load + SPA navigation ─────────────────────────────────────

// Initial page load (document_idle)
maybeSync();

// SPA: watch URL changes (pushState / replaceState / popstate)
let _prevHref = location.href;
const _observer = new MutationObserver(() => {
  if (location.href !== _prevHref) {
    _prevHref = location.href;
    // Small delay to let the new content render
    setTimeout(maybeSync, 1200);
  }
});
_observer.observe(document.body, { childList: true, subtree: true });
