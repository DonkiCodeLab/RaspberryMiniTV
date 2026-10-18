"""Bounded, persistent Transmission traffic history, independent of the browser."""
import logging
import math
from pathlib import Path
import sqlite3
import threading
import time

RANGES = {
    "3h": (3 * 3600, 60),
    "24h": (24 * 3600, 600),
    "7d": (7 * 86400, 3600),
    "30d": (30 * 86400, 6 * 3600),
    "365d": (365 * 86400, 86400),
}
RETENTION = RANGES["365d"][0]
MAX_SAMPLE_GAP = 90


class TorrentTraffic:
    def __init__(self, path, rpc):
        self.path = Path(path)
        self.rpc = rpc
        self.lock = threading.RLock()
        self.worker = None
        self.previous = None
        self.error = False
        self.initialized = False

    def _connect(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.path, timeout=5)
        if not self.initialized:
            db.execute("""CREATE TABLE IF NOT EXISTS samples (
                timestamp REAL PRIMARY KEY, since REAL NOT NULL,
                downloaded REAL NOT NULL, uploaded REAL NOT NULL,
                down_rate REAL NOT NULL, up_rate REAL NOT NULL)""")
            db.commit()
            self.initialized = True
        return db

    def start(self):
        with self.lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self._run, name="torrent-traffic", daemon=True)
            self.worker.start()

    def _run(self):
        while True:
            try:
                self.sample()
            except Exception:
                # Telemetry failure must never stop downloads or invent zero traffic.
                with self.lock:
                    self.error = True
                    self.previous = None
                logging.getLogger(__name__).warning("No se pudo registrar el tráfico torrent", exc_info=True)
            time.sleep(30)

    def sample(self, now=None):
        stats = self.rpc.call("session-stats")
        now = time.time() if now is None else now
        counters = stats["cumulative-stats"]
        values = [counters["downloadedBytes"], counters["uploadedBytes"], stats["downloadSpeed"], stats["uploadSpeed"]]
        if any(type(value) not in (int, float) or not math.isfinite(value) or value < 0 for value in values):
            raise ValueError("Invalid traffic counters")
        down, up, down_rate, up_rate = values
        session = counters["sessionCount"]
        with self.lock:
            since, downloaded, uploaded = now, 0, 0
            if self.previous:
                before, old_down, old_up, old_session = self.previous
                # Do not spread missing observations or daemon resets over the chart.
                if 0 < now - before <= MAX_SAMPLE_GAP and session == old_session and down >= old_down and up >= old_up:
                    since, downloaded, uploaded = before, down - old_down, up - old_up
            db = self._connect()
            try:
                with db:
                    db.execute("INSERT OR REPLACE INTO samples VALUES (?, ?, ?, ?, ?, ?)",
                               (now, since, downloaded, uploaded, down_rate, up_rate))
                    db.execute("DELETE FROM samples WHERE timestamp < ?", (now - RETENTION - MAX_SAMPLE_GAP,))
            finally:
                db.close()
            self.previous = (now, down, up, session)
            self.error = False

    def snapshot(self, period="3h", now=None):
        if period not in RANGES:
            raise ValueError("Elige 3h, 24h, 7d, 30d o 365d.")
        now = time.time() if now is None else now
        duration, width = RANGES[period]
        start = now - duration
        first = math.floor(start / width) * width
        points = []
        with self.lock:
            db = self._connect()
            try:
                # Aggregate in SQLite so a year's samples never need to be loaded
                # into Python memory. Include intervals crossing each bucket edge.
                for timestamp in range(int(first), int(now) + 1, width):
                    bucket_start, bucket_end = max(timestamp, start), min(timestamp + width, now)
                    down, up, seconds = db.execute("""
                        SELECT COALESCE(SUM(downloaded * seconds / duration), 0),
                               COALESCE(SUM(uploaded * seconds / duration), 0),
                               COALESCE(SUM(seconds), 0)
                        FROM (
                            SELECT downloaded, uploaded, timestamp - since AS duration,
                                   MIN(timestamp, :end) - MAX(since, :start) AS seconds
                            FROM samples
                            WHERE timestamp > :start AND timestamp <= :scan_end
                              AND since < :end AND timestamp > since
                        )
                    """, {"start": bucket_start, "end": bucket_end,
                          "scan_end": min(bucket_end + MAX_SAMPLE_GAP, now)}).fetchone()
                    points.append({"timestamp": timestamp, "downloadedBytes": down,
                                   "uploadedBytes": up, "observedSeconds": seconds,
                                   "downloadRate": down / seconds if seconds else None,
                                   "uploadRate": up / seconds if seconds else None})
                last = db.execute("SELECT timestamp, down_rate, up_rate FROM samples ORDER BY timestamp DESC LIMIT 1").fetchone()
            finally:
                db.close()
            unavailable = self.error
        current = {"timestamp": last[0], "downloadRate": last[1], "uploadRate": last[2]} if last else None
        return {"period": period, "start": start, "end": now, "bucketSeconds": width, "points": points,
                "current": current, "stale": unavailable or not last or not 0 <= now - last[0] <= MAX_SAMPLE_GAP,
                "totals": {"downloadedBytes": round(sum(p["downloadedBytes"] for p in points)),
                           "uploadedBytes": round(sum(p["uploadedBytes"] for p in points)),
                           "observedSeconds": sum(p["observedSeconds"] for p in points)}}
