"""
Library of Yore — Local API Server
====================================
Drop this file into the Library of Yore directory (next to main.py).

USAGE (two options):

  Option A — Run standalone in a separate terminal:
      python loy_server.py

  Option B — Auto-start with the app (edit main.py):
      Add at the top of main():
          from loy_server import run_server
          run_server(daemon=True)

The Chrome extension talks to http://localhost:7185/api/*
"""

import sys
import os
import json
import threading
import datetime
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

# ── Add Library of Yore root to path so we can import config + database ──────
LOY_DIR = os.path.dirname(os.path.abspath(__file__))
if LOY_DIR not in sys.path:
    sys.path.insert(0, LOY_DIR)

PORT = 7185


# ── Request handler ────────────────────────────────────────────────────────────

class LOYHandler(BaseHTTPRequestHandler):

    def log_message(self, fmt, *args):
        # Only log errors, not every request
        if args and str(args[1]) >= "400":
            ts = datetime.datetime.now().strftime("%H:%M:%S")
            print(f"[LOY Server {ts}] {fmt % args}")

    # ── CORS helpers ──────────────────────────────────────────────────────────

    def _send_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def _json(self, code: int, data: dict):
        body = json.dumps(data, default=str).encode("utf-8")
        self.send_response(code)
        self._send_cors_headers()
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ── Preflight ─────────────────────────────────────────────────────────────

    def do_OPTIONS(self):
        self.send_response(200)
        self._send_cors_headers()
        self.end_headers()

    # ── GET routes ────────────────────────────────────────────────────────────

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path

        if path == "/api/status":
            self._json(200, {
                "ok": True,
                "app": "Library of Yore",
                "version": "1.0",
                "port": PORT,
            })

        elif path == "/api/novels":
            self._handle_get_novels()

        elif path == "/api/novels/match":
            params = parse_qs(parsed.query)
            url = params.get("url", [""])[0]
            self._handle_match(url)

        else:
            self._json(404, {"error": "Not found", "path": path})

    def _handle_get_novels(self):
        try:
            from database.models import NovelRepository
            repo = NovelRepository()
            novels = repo.get_all()
            result = []
            for n in novels:
                result.append({
                    "id": n._id,
                    "title": n.title,
                    "author": n.author,
                    "source_url": n.source_url,
                    "source_name": n.source_name,
                    "current_chapter": n.current_chapter,
                    "total_chapters": n.total_chapters,
                    "status": n.status,
                    "percent_complete": n.percent_complete,
                    "last_read": n.last_read.isoformat() if n.last_read else None,
                })
            self._json(200, result)
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    def _handle_match(self, url: str):
        if not url:
            self._json(400, {"error": "url query param is required"})
            return
        try:
            from database.models import NovelRepository
            repo = NovelRepository()
            novel = _find_novel_by_url(repo, url)
            if novel:
                self._json(200, {
                    "found": True,
                    "id": novel._id,
                    "title": novel.title,
                    "author": novel.author,
                    "source_url": novel.source_url,
                    "current_chapter": novel.current_chapter,
                    "total_chapters": novel.total_chapters,
                    "status": novel.status,
                    "percent_complete": novel.percent_complete,
                })
            else:
                self._json(200, {"found": False})
        except Exception as exc:
            self._json(500, {"error": str(exc)})

    # ── POST routes ───────────────────────────────────────────────────────────

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path

        length = int(self.headers.get("Content-Length", 0))
        try:
            body = json.loads(self.rfile.read(length)) if length else {}
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON body"})
            return

        if path == "/api/sync":
            self._handle_sync(body)
        else:
            self._json(404, {"error": "Not found", "path": path})

    def _handle_sync(self, body: dict):
        source_url = body.get("source_url", "").strip()
        chapter_raw = body.get("chapter")
        novel_title = body.get("novel_title", "")  # optional hint

        if not source_url:
            self._json(400, {"error": "'source_url' is required"})
            return
        if chapter_raw is None:
            self._json(400, {"error": "'chapter' is required"})
            return

        try:
            chapter = int(chapter_raw)
        except (ValueError, TypeError):
            self._json(400, {"error": "'chapter' must be an integer"})
            return

        if chapter < 1:
            self._json(400, {"error": "'chapter' must be >= 1"})
            return

        try:
            from database.models import NovelRepository
            repo = NovelRepository()

            # Try URL match first, fall back to title hint
            novel = _find_novel_by_url(repo, source_url)
            if not novel and novel_title:
                novel = _find_novel_by_title(repo, novel_title)

            if not novel:
                self._json(404, {
                    "error": "Novel not found in Library of Yore",
                    "hint": "Add the novel to your library first and make sure the Source URL is set.",
                })
                return

            old_chapter = novel.current_chapter

            if chapter > old_chapter:
                repo.update_chapter_progress(novel._id, chapter, increment_read=True)
                ts = datetime.datetime.now().strftime("%H:%M:%S")
                print(
                    f"[LOY Server {ts}] ✓ Synced '{novel.title}': "
                    f"Ch {old_chapter} → Ch {chapter}"
                )
                self._json(200, {
                    "ok": True,
                    "updated": True,
                    "title": novel.title,
                    "old_chapter": old_chapter,
                    "new_chapter": chapter,
                })
            else:
                self._json(200, {
                    "ok": True,
                    "updated": False,
                    "title": novel.title,
                    "current_chapter": old_chapter,
                    "message": (
                        f"Library already tracks Ch {old_chapter}; "
                        f"Ch {chapter} is not newer."
                    ),
                })

        except Exception as exc:
            self._json(500, {"error": str(exc)})


# ── URL matching helpers ───────────────────────────────────────────────────────

def _normalise(url: str) -> str:
    return url.lower().rstrip("/").replace("https://", "").replace("http://", "")


def _find_novel_by_url(repo, chapter_url: str):
    """
    Match a chapter page URL to a novel in the library.

    Strategy (in order):
      1. Exact match on source_url
      2. chapter_url starts with source_url (chapter is under the novel's path)
      3. source_url starts with chapter_url (edge case: stored URL is deeper)
    """
    novels = repo.get_all()
    norm_chapter = _normalise(chapter_url)

    # Pass 1 — exact
    for n in novels:
        if n.source_url and _normalise(n.source_url) == norm_chapter:
            return n

    # Pass 2 — chapter URL starts with novel URL (most common)
    best, best_len = None, 0
    for n in novels:
        if n.source_url:
            norm_novel = _normalise(n.source_url)
            if norm_chapter.startswith(norm_novel) and len(norm_novel) > best_len:
                best, best_len = n, len(norm_novel)
    if best:
        return best

    return None


def _find_novel_by_title(repo, title: str):
    """Fuzzy-ish title match as a fallback."""
    novels = repo.get_all()
    title_lower = title.lower()
    for n in novels:
        if n.title.lower() == title_lower:
            return n
    # Partial match
    for n in novels:
        if title_lower in n.title.lower() or n.title.lower() in title_lower:
            return n
    return None


# ── Server lifecycle ───────────────────────────────────────────────────────────

def run_server(port: int = PORT, daemon: bool = True) -> HTTPServer:
    """
    Start the LOY sync server.

    Args:
        port:   Port to listen on (default 7185).
        daemon: If True, run in a background daemon thread and return immediately.
                If False, block until Ctrl-C (use when running standalone).
    Returns:
        The HTTPServer instance.
    """
    server = HTTPServer(("localhost", port), LOYHandler)
    print(f"[LOY Server] Listening on http://localhost:{port}  (Ctrl-C to stop)")

    if daemon:
        t = threading.Thread(target=server.serve_forever, daemon=True)
        t.start()
    else:
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\n[LOY Server] Shutting down.")
            server.shutdown()

    return server


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    run_server(daemon=False)
