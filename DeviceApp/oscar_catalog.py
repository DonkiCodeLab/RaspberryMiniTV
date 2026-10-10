"""Permanent Best Picture collection, isolated from deletable library artwork."""
import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import threading

from tmdb_cache import LANGUAGES, TmdbCache, TmdbError, atomic_write

SEED_PATH = Path(__file__).parent / "data" / "oscar_best_picture.json"


class OscarCatalog(TmdbCache):
    def __init__(self, root, credentials, seed_path=SEED_PATH, cards_only=False):
        super().__init__(root, credentials, include_credits=not cards_only)
        self.catalog_lock = threading.RLock()
        self.cards_primed = False
        self.seed = json.loads(Path(seed_path).read_text())
        self.cards_only = cards_only
        # A newer release may add winners; an older release must never erase them.
        try:
            saved = json.loads((self.root / "catalog.json").read_text())
        except (OSError, ValueError):
            saved = {}
        winners = {item.get("key", item["edition"]): item for item in saved.get("winners", [])}
        winners.update({item.get("key", item["edition"]): item for item in self.seed["winners"]})
        self.winners = sorted(winners.values(), key=lambda item: item["edition"])

    def prepare(self):
        with self.catalog_lock:
            atomic_write(self.root / "catalog.json", json.dumps(
                {**self.seed, "winners": self.winners}, ensure_ascii=False).encode())
            with self.jobs_lock:
                if all(self.jobs.get(f"movie/{winner['tmdbId']}", {}).get("state") == "complete"
                       and self.jobs.get(f"movie/{winner['tmdbId']}", {}).get("thumbnailsReady") for winner in self.winners):
                    return self.status()
            credentials = self.credentials()
            if not (credentials.get("apiKey") or credentials.get("bearerToken")):
                raise TmdbError("Guarda las credenciales de TMDB en Ajustes para preparar la colección de premios.",
                                "TMDB_CREDENTIALS_MISSING")
            # Enqueue is idempotent and keeps completed downloads across restarts.
            for winner in reversed(self.winners):
                self.enqueue("movie", winner["tmdbId"])
            self.start()  # Restored pending jobs may all have deduplicated above.
        return self.status()

    def prime_cards(self):
        """Make the entire timeline usable before downloading the full galleries."""
        failures = []
        for count, winner in enumerate(reversed(self.winners), 1):
            self._check_worker()
            base = f"/movie/{winner['tmdbId']}"
            self._progress("collection", count - 1, len(self.winners), winner["title"])
            try:
                for language in LANGUAGES:
                    detail = self.json(base, {"language": language, "append_to_response": "external_ids"})
                    if detail.get("poster_path"):
                        self.display_image(detail["poster_path"], 500)
                    if detail.get("backdrop_path"):
                        self.display_image(detail["backdrop_path"], 1280)
            except Exception as exc:
                failures.append(f"{winner['title']}: {exc}")
                if isinstance(exc, TmdbError) and exc.code in ("TMDB_CREDENTIALS_MISSING", "TMDB_AUTH_ERROR", "TMDB_CONNECTION_ERROR"):
                    raise  # Avoid repeating a known credential/network failure 98 times.
            self._progress("collection", count, len(self.winners), winner["title"])
        return failures

    def warm(self, kind, tmdb_id, extra_images=(), refresh=False):
        if self.cards_only:
            # Award browsing needs permanent cards, not every image in each gallery.
            for index, language in enumerate(LANGUAGES):
                self._check_worker()
                detail = self.json(f"/movie/{tmdb_id}", {"language": language, "append_to_response": "external_ids"}, refresh=refresh)
                for field, width in (("poster_path", 500), ("backdrop_path", 1280)):
                    if detail.get(field):
                        self.display_image(detail[field], width)
                self._progress("cards", index + 1, len(LANGUAGES), language)
            return
        if not self.cards_primed:
            self.cards_primed = True
            self.prime_cards()
        # Includes original artwork, full image inventories, details in all three
        # languages and display thumbnails. Interrupted jobs resume from disk.
        super().warm(kind, tmdb_id, extra_images, refresh)

    def _warm_images(self, images, thumbnails):
        # A century of artwork is large. Keep just three transfers in flight;
        # generation checks and atomic writes still apply to every worker.
        context = getattr(self.worker_context, "job", None)
        errors = []
        def prepare(item):
            path, width = item
            self.worker_context.job = context
            try:
                self._check_worker()
                self.display_image(path, width) if width else self.image(path)
                return ""
            except Exception as exc:
                return f"{path} ({width or 'original'}): {exc}"
            finally:
                self.worker_context.job = None
        with ThreadPoolExecutor(max_workers=3, thread_name_prefix="oscars-artwork") as pool:
            for phase, items in (("images", [(path, None) for path in sorted(images)]),
                                 ("thumbnails", sorted(thumbnails))):
                for count, error in enumerate(pool.map(prepare, items), 1):
                    self._check_worker()
                    if error:
                        errors.append(error)
                    self._progress(phase, count, len(items), items[count - 1][0])
        return errors

    def snapshot(self, language):
        if language not in LANGUAGES:
            raise ValueError("Idioma no permitido")
        status = self.status()
        items = []
        for winner in self.winners:
            summary = self.library_summary("movie", winner["tmdbId"], language)
            # Local reads only, including the synopsis and backdrop used in the timeline.
            try:
                detail = self.json(f"/movie/{winner['tmdbId']}",
                                   {"language": language, "append_to_response": "external_ids"}, local_only=True)
            except TmdbError:
                detail = {}
            poster = summary.get("posterPath") or ""
            backdrop = detail.get("backdrop_path") or ""
            def ready(path, width):
                return bool(path and (self.root / "thumbnails" / str(width) / (path.lstrip("/") + ".webp")).is_file())
            items.append({**winner, **summary, "name": summary.get("name") or winner["title"],
                          "posterPath": poster if ready(poster, 500) else "",
                          "overview": detail.get("overview") or "",
                          "backdropPath": backdrop if ready(backdrop, 1280) else "",
                          "runtime": detail.get("runtime") or 0})
        return {"winners": items, "status": status, "updatedAt": self.seed["updatedAt"]}

    def remove_unused(self, removed, library):
        # Permanent collection: no catalog cleanup is allowed to remove its files.
        return {"metadata": 0, "images": 0}
