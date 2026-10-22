"""Poll one local calculation without holding an HTTP request open."""
import logging
import threading


class BackgroundStatus:
    def __init__(self, error_message):
        self.error_message = error_message
        self.lock = threading.Lock()
        self.worker = None
        self.result = None
        self.calculating = False

    def read(self, calculate, *, refresh=False):
        with self.lock:
            if not self.calculating and (refresh or self.result is None):
                self.calculating = True
                self.worker = threading.Thread(target=self._calculate, args=(calculate,),
                                               name="tmdb-status", daemon=True)
                self.worker.start()
            if self.calculating:
                return {"calculating": True}
            return {**self.result, "calculating": False}

    def _calculate(self, calculate):
        try:
            result = calculate()
        except Exception:
            logging.getLogger(__name__).exception(self.error_message)
            result = {"error": self.error_message, "code": "TMDB_STATUS_ERROR"}
        with self.lock:
            self.result = result
            self.calculating = False
