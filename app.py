"""Atomic Gumshoe - a retro-futuristic hover-car racer.

Flask serves the page and static files and keeps a small JSON leaderboard.
The game itself is vanilla JS + three.js (loaded from a CDN via an import map).
"""
import json
import os
import threading
import time

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
# Behind nginx at /gumshoe/ (X-Forwarded-Prefix -> SCRIPT_NAME); keeps request URLs and logs right.
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_prefix=1)

SCORES_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "scores.json")
_lock = threading.Lock()


def _load():
    try:
        with open(SCORES_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, list) else []
    except (OSError, ValueError):
        return []


def _save(scores):
    tmp = SCORES_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(scores, f, indent=2)
    os.replace(tmp, SCORES_PATH)


def _top(scores, n=10):
    return sorted(scores, key=lambda s: (s["position"], s["time"]))[:n]


@app.get("/")
def index():
    # plain static page (relative asset paths), so the same file also works on GitHub Pages
    return send_from_directory(app.root_path, "index.html")


@app.get("/api/scores")
def get_scores():
    with _lock:
        return jsonify(_top(_load()))


@app.post("/api/scores")
def post_score():
    body = request.get_json(silent=True) or {}
    name = str(body.get("name", "")).strip()[:16] or "Anonymous"
    try:
        race_time = float(body.get("time"))
        position = int(body.get("position"))
        best_lap = float(body.get("bestLap", 0))
    except (TypeError, ValueError):
        return jsonify(error="invalid score"), 400
    if not (10 <= race_time <= 3600) or not (1 <= position <= 4):
        return jsonify(error="score out of range"), 400

    entry = {
        "name": name,
        "time": round(race_time, 2),
        "position": position,
        "bestLap": round(best_lap, 2),
        "date": time.strftime("%Y-%m-%d"),
    }
    with _lock:
        scores = _load()
        scores.append(entry)
        scores = _top(scores, 100)
        _save(scores)
        top = _top(scores)
    rank = next((i + 1 for i, s in enumerate(top) if s is entry or s == entry), None)
    return jsonify(rank=rank, scores=top)


if __name__ == "__main__":
    # The Werkzeug debugger allows code execution, so it is opt-in and never on
    # when listening on a public interface.
    host = os.environ.get("HOST", "127.0.0.1")
    debug = os.environ.get("FLASK_DEBUG") == "1" and host in ("127.0.0.1", "localhost")
    app.run(host=host, port=int(os.environ.get("PORT", 5000)), debug=debug)
