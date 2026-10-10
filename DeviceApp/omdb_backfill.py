"""Explicit, resumable OMDb preparation for existing movie and series profiles."""
import copy
from pathlib import Path
import re
import threading
import time
import urllib.parse

from omdb_ratings import ERRORS, IMDB_ID, SCORE_FIELDS, OmdbError, _read, _write


def _imdb_id(item):
    value = item.get("imdbId")
    if isinstance(value, str) and IMDB_ID.fullmatch(value):
        return value
    url = item.get("imdbUrl")
    if not isinstance(url, str):
        return None
    try:
        parsed = urllib.parse.urlsplit(url.strip())
        if parsed.scheme not in ("https", "http") or parsed.hostname not in ("imdb.com", "www.imdb.com"):
            return None
        match = re.fullmatch(r"/title/(tt\d{7,12})(?:/.*)?", parsed.path)
        return match.group(1) if match else None
    except ValueError:
        return None


def library_targets(library):
    """Deduplicate both TMDB and IMDb aliases without visiting media files."""
    rows, parents, aliases, missing = [], [], {}, []

    def root(index):
        while parents[index] != index:
            parents[index] = parents[parents[index]]
            index = parents[index]
        return index

    for collection, kind in (("movies", "movie"), ("series", "tv")):
        profiles = library.get(collection, {})
        for path, profile in sorted(profiles.items()) if isinstance(profiles, dict) else []:
            item = profile if isinstance(profile, dict) else {}
            title = str(item.get("name") or item.get("title") or Path(str(path)).name)[:300]
            value = item.get("tmdbId")
            tmdb_id = int(value) if re.fullmatch(r"[1-9]\d{0,15}", str(value or "")) else None
            if tmdb_id and tmdb_id > 9007199254740991:
                tmdb_id = None
            imdb_id = _imdb_id(item)
            if not tmdb_id and not imdb_id:
                missing.append({"kind": kind, "title": title, "path": str(path)})
                continue
            index = len(rows)
            parents.append(index)
            rows.append({"kind": kind, "tmdbId": tmdb_id, "imdbId": imdb_id, "title": title})
            keys = ([f"{kind}/tmdb/{tmdb_id}"] if tmdb_id else []) + ([f"{kind}/imdb/{imdb_id}"] if imdb_id else [])
            for key in keys:
                if key in aliases:
                    parents[root(index)] = root(aliases[key])
                else:
                    aliases[key] = index
    grouped = {}
    for index, item in enumerate(rows):
        group = grouped.setdefault(root(index), dict(item))
        group["tmdbId"] = group["tmdbId"] or item["tmdbId"]
        group["imdbId"] = group["imdbId"] or item["imdbId"]
    return list(grouped.values()), missing


def _empty_job():
    return {"state": "idle", "total": 0, "processed": 0, "ready": 0, "unavailable": 0,
            "failed": 0, "currentTitle": "", "code": None, "startedAt": None, "finishedAt": None}


def _arguments(item):
    return {"kind": item["kind"], "tmdb_id": item["tmdbId"], "imdb_id": item["imdbId"]}


def _identity_key(item):
    return item["kind"], item["tmdbId"], item["imdbId"]


class OmdbBackfill:
    def __init__(self, path, ratings, library, *, interval=0.5):
        self.path = Path(path)
        self.ratings = ratings
        self.library = library
        self.interval = interval
        self.lock = threading.RLock()
        self.stop = threading.Event()
        self.worker = None
        self.data = {"version": 1, "items": [], "outcomes": [], "job": _empty_job()}
        saved = _read(self.path, 16 * 1024 * 1024)
        if saved:
            try:
                items, outcomes, job = saved["items"], saved["outcomes"], saved["job"]
                if (saved.get("version") != 1 or not isinstance(items, list) or not isinstance(outcomes, list)
                        or not isinstance(job, dict) or len(outcomes) > len(items)):
                    raise ValueError()
                for item in items:
                    self.ratings._identity(**_arguments(item))
                    if not isinstance(item["title"], str):
                        raise ValueError()
                if any(not isinstance(item, dict) or item.get("state") not in ("ready", "unavailable", "failed") for item in outcomes):
                    raise ValueError()
                state = job.get("state")
                if state not in ("idle", "running", "pausing", "paused", "completed"):
                    raise ValueError()
                if (not isinstance(job.get("currentTitle", ""), str)
                        or any(job.get(field) is not None and (type(job[field]) not in (int, float) or not 0 < job[field] < float("inf"))
                               for field in ("startedAt", "finishedAt"))):
                    raise ValueError()
                self.data = {"version": 1, "items": items, "outcomes": outcomes,
                             "job": {**_empty_job(), **{key: job[key] for key in _empty_job() if key in job}}}
                if state in ("running", "pausing"):
                    self.data["job"].update(state="paused", currentTitle="", code=None)
                if self.data["job"]["code"] not in ERRORS:
                    self.data["job"]["code"] = None
                self._counts()
            except (ValueError, TypeError, KeyError, OmdbError):
                self.data = {"version": 1, "items": [], "outcomes": [], "job": _empty_job()}
                self.data["job"].update(state="paused", code="OMDB_STORAGE_ERROR")
        elif self.path.exists():
            self.data["job"].update(state="paused", code="OMDB_STORAGE_ERROR")

    def _counts(self):
        job = self.data["job"]
        job["total"] = len(self.data["items"])
        job["processed"] = len(self.data["outcomes"])
        for state in ("ready", "unavailable", "failed"):
            job[state] = sum(item["state"] == state for item in self.data["outcomes"])

    def _save(self):
        _write(self.path, self.data)

    def _reconcile(self, items):
        """Keep valid outcomes; additions, corrected IDs and expired caches retry."""
        previous = {_identity_key(item): outcome for item, outcome in
                    zip(self.data["items"], self.data["outcomes"])}
        completed, outcomes, pending = [], [], []
        for item in items:
            outcome = previous.get(_identity_key(item))
            cached = self.ratings.peek(**_arguments(item)) if outcome else None
            if outcome and (outcome["state"] == "failed" or cached is not None):
                completed.append(item)
                outcomes.append({"state": "ready" if any(cached.get(field) is not None for field in SCORE_FIELDS) else "unavailable"}
                                if cached is not None else outcome)
            else:
                pending.append(item)
        # Outcomes correspond to the leading items, keeping the persisted cursor
        # unambiguous even when deleted/changed profiles alter the library order.
        self.data["items"] = completed + pending
        self.data["outcomes"] = outcomes

    def status(self):
        items, missing = library_targets(self.library())
        prepared = sum(self.ratings.peek(**_arguments(item)) is not None for item in items)
        with self.lock:
            job = copy.deepcopy(self.data["job"])
        return {"ok": True, "configured": bool(self.ratings.credentials()), "total": len(items),
                "ready": prepared, "missingIds": missing, "job": job}

    def start(self):
        if not self.ratings.credentials():
            raise OmdbError("OMDB_NOT_CONFIGURED")
        items, _ = library_targets(self.library())
        with self.lock:
            if self.worker is not None and self.worker.is_alive():
                return
            if self.data["job"]["state"] != "paused" or not self.data["items"]:
                self.data = {"version": 1, "items": items, "outcomes": [], "job": _empty_job()}
                self.data["job"]["startedAt"] = time.time()
            else:
                self._reconcile(items)
            self.stop.clear()
            self.data["job"].update(state="running", code=None, currentTitle="", finishedAt=None)
            self._counts()
            self._save()
            self.worker = threading.Thread(target=self._run, name="omdb-library", daemon=True)
            self.worker.start()

    def pause(self):
        with self.lock:
            if self.worker is not None and self.worker.is_alive():
                self.stop.set()
                self.data["job"]["state"] = "pausing"
                self._save()

    def _paused(self, code=None):
        self.data["job"].update(state="paused", currentTitle="", code=code, finishedAt=None)
        self._save()

    def _run(self):
        try:
            while True:
                with self.lock:
                    index = len(self.data["outcomes"])
                    if index == len(self.data["items"]):
                        self.data["job"].update(state="completed", currentTitle="", code=None, finishedAt=time.time())
                        self._save()
                        return
                    if self.stop.is_set():
                        self._paused()
                        return
                    item = self.data["items"][index]
                    self.data["job"]["currentTitle"] = item["title"]
                    self._save()
                try:
                    result = self.ratings.get(**_arguments(item))
                    if result.get("stale"):
                        raise OmdbError(result.get("code") if result.get("code") in ERRORS else "OMDB_CONNECTION_ERROR")
                    outcome = {"state": "ready" if any(result.get(field) is not None for field in SCORE_FIELDS) else "unavailable"}
                except OmdbError as exc:
                    if exc.code in ("OMDB_ID_MISSING", "OMDB_INVALID_ID"):
                        outcome = {"state": "failed", "code": exc.code}
                    else:
                        with self.lock:
                            self._paused(exc.code)
                        return
                with self.lock:
                    self.data["outcomes"].append(outcome)
                    self.data["job"]["currentTitle"] = ""
                    self._counts()
                    self._save()
                self.stop.wait(self.interval)
        except Exception:
            # A disk or unexpected local failure must never leave a dead worker
            # advertised as running, nor leak provider/configuration text.
            with self.lock:
                self.data["job"].update(state="paused", code="OMDB_STORAGE_ERROR", currentTitle="", finishedAt=None)
                try:
                    self._save()
                except OmdbError:
                    pass
