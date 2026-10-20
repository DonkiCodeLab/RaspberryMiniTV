"""Shared, deliberately slow TMDB work across library and award caches."""
from contextlib import contextmanager
import threading
import time


class PacedResource:
    """One operation at a time; interactive work goes before queued background work."""

    def __init__(self, pause):
        self.pause = pause
        self.condition = threading.Condition()
        self.active = False
        self.interactive_waiters = 0
        self.ready_at = 0

    @contextmanager
    def acquire(self, *, background, check_cancelled):
        with self.condition:
            if not background:
                self.interactive_waiters += 1
            try:
                while True:
                    check_cancelled()
                    remaining = self.ready_at - time.monotonic()
                    if not self.active and remaining <= 0 and (not background or not self.interactive_waiters):
                        self.active = True
                        break
                    self.condition.wait(min(0.1, remaining) if remaining > 0 else 0.1)
            finally:
                if not background:
                    self.interactive_waiters -= 1
                self.condition.notify_all()
        try:
            yield
        finally:
            with self.condition:
                self.active = False
                self.ready_at = time.monotonic() + self.pause
                self.condition.notify_all()


# Shared by every cache in this API process, including all award collections.
# Text queries never queue behind an original image or thumbnail conversion.
IMAGE_DOWNLOADS = PacedResource(pause=0.25)
METADATA_DOWNLOADS = PacedResource(pause=0.5)
THUMBNAILS = PacedResource(pause=0.2)
DOWNLOAD_BYTES_PER_SECOND = 256 * 1024
DOWNLOAD_CHUNK_BYTES = 32 * 1024
