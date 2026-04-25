# Library of Yore Sync — Chrome Extension

Automatically tracks the chapter you're reading on novel websites and syncs your progress back into **Library of Yore**.

---

## How It Works

```
[Novel website] ──content.js──▶ [background.js] ──HTTP──▶ [loy_server.py] ──MongoDB──▶ [Library of Yore]
```

1. `content.js` detects the chapter number and novel URL on the page.
2. It notifies the background service worker.
3. The background worker calls `http://localhost:7185/api/sync`.
4. `loy_server.py` finds the matching novel in MongoDB and updates `current_chapter`.
5. Next time you open Library of Yore, your progress is up to date.

---

## Setup (3 steps)

### Step 1 — Copy `loy_server.py` into Library of Yore

Copy `loy_server.py` (in this package) into the Library of Yore directory — the same folder as `main.py`.

```
Library-of-Yore/
├── main.py
├── loy_server.py   ← paste here
├── config.py
├── database/
└── ...
```

### Step 2 — Start the server

**Option A (recommended): Auto-start with the app**

Open `main.py` and add two lines at the top of `main()`:

```python
def main():
    from loy_server import run_server   # ← add this
    run_server(daemon=True)             # ← add this
    
    from PyQt6.QtWidgets import QApplication
    # ... rest of main() unchanged
```

**Option B: Run separately in a terminal**

```bash
cd path/to/Library-of-Yore
python loy_server.py
```

You'll see: `[LOY Server] Listening on http://localhost:7185`

### Step 3 — Install the Chrome Extension

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `loy-sync-extension/` folder

The 📖 icon appears in your toolbar.

---

## Supported Sites

| Site | URL Pattern Detected |
|---|---|
| Novelfire | `novelfire.net/book/…/chapter-N` |
| FreeWebNovel | `freewebnovel.com/…/chapter-N` |
| Wuxiaworld | `wuxiaworld.com/novel/…/…-chapter-N` |
| Webnovel | `webnovel.com/book/…` |
| Royal Road | `royalroad.com/fiction/…/chapter/…` |
| Scribble Hub | `scribblehub.com/read/…/chapter/N` |
| LightNovelWorld | `lightnovelworld.com/novel/…/chapter-N` |
| LightNovelPub | `lightnovelpub.com/novel/…/chapter-N` |
| NovelPub | `novelpub.com/novel/…/chapter-N` |
| MTLNovel | `mtlnovel.com/…-chapter-N` |

---

## Matching Novels

The extension matches the **page URL** against the **Source URL** stored in each novel's Library of Yore entry.

**For automatic matching to work:** when you add a novel in Library of Yore, set the **Source URL** to the novel's index/info page (e.g. `https://novelfire.net/book/solo-leveling`). The extension will then match any chapter URL that starts with that base.

If a novel isn't matched, the popup shows an orange **"Novel not in library"** warning. Add it to Library of Yore with the correct Source URL.

---

## API Reference (`loy_server.py`)

All endpoints are on `http://localhost:7185`.

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/status` | Health check |
| `GET` | `/api/novels` | List all novels |
| `GET` | `/api/novels/match?url=…` | Find novel by URL |
| `POST` | `/api/sync` | Update chapter progress |

**POST `/api/sync` body:**
```json
{
  "source_url": "https://novelfire.net/book/solo-leveling",
  "chapter": 20,
  "novel_title": "Solo Leveling"
}
```

**Response (updated):**
```json
{
  "ok": true,
  "updated": true,
  "title": "Solo Leveling",
  "old_chapter": 15,
  "new_chapter": 20
}
```

---

## Extension Popup

- **Green dot** — server online
- **Red dot** — server offline (run `python loy_server.py`)
- **Chapter detected** — what the extension found on the current page
- **Library progress** — what's stored in your library
- **Sync Now** — manually trigger a sync if auto-sync missed
- **Sync History** — last 30 syncs

---

## Badge Icons

| Badge | Meaning |
|---|---|
| ✓ green | Chapter synced successfully |
| – blue | Already at or past this chapter |
| ? orange | Novel not found in library |
| ! red | Server offline |

---

## Troubleshooting

**Badge shows `!` (red)**
→ The server isn't running. Start it with `python loy_server.py`.

**Badge shows `?` (orange)**  
→ The novel isn't in your library, or its Source URL doesn't match. Open Library of Yore, edit the novel, and set the Source URL to the novel's main page.

**Nothing happens on chapter pages**
→ Make sure the site is in the supported list. Check `chrome://extensions` → Library of Yore Sync → Errors.

**Progress goes backwards?**  
The server only updates if the new chapter is *higher* than the current one, so it won't overwrite newer progress.
