"""Serve the last measured disk statistics while one worker refreshes them."""
import json
import logging
from pathlib import Path
import threading
import time

from tmdb_cache import atomic_write


class BackgroundStats:
    def __init__(self, path, calculate, ttl=60):
        self.path = Path(path)
        self.calculate = calculate
        self.ttl = ttl
        self.lock = threading.Lock()
        self.refreshing = False
        self.checked_at = float('-inf')
        try:
            self.snapshot = json.loads(self.path.read_text())
        except (OSError, ValueError):
            self.snapshot = None

    def read(self):
        with self.lock:
            if not self.refreshing and time.monotonic() - self.checked_at >= self.ttl:
                self.refreshing = True
                threading.Thread(target=self._refresh, name='library-statistics', daemon=True).start()
            return self.snapshot

    def _refresh(self):
        try:
            result = self.calculate()
            atomic_write(self.path, json.dumps(result).encode())
            with self.lock:
                self.snapshot = result
        except Exception:
            logging.getLogger(__name__).exception('No se pudieron actualizar las estadísticas locales')
        finally:
            with self.lock:
                self.checked_at = time.monotonic()
                self.refreshing = False
