"""Persistent TMDB metadata/artwork and a single resumable download worker."""
import hashlib
import io
from contextlib import nullcontext
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

IMAGE_RE = re.compile(r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg)")
DETAIL_RE = re.compile(r"/(?:movie/\d+(?:/images|/credits)?|tv/\d+(?:/images|/aggregate_credits|/season/\d+(?:/images|/episode/\d+(?:/images)?)?)?)")
LANGUAGES = ("es-ES", "ca-ES", "en-US")
CREDITS_VERSION = 2


class TmdbError(RuntimeError):
    def __init__(self, message, code):
        super().__init__(message)
        self.code = code


def atomic_write(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".download-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


class TmdbCache:
    def __init__(self, root, credentials, *, include_credits=True):
        self.root = Path(root)
        self.credentials = credentials
        self.include_credits = include_credits
        self.credits_snapshots = {}
        self.io_locks = [threading.RLock() for _ in range(64)]
        self.link_locks = [threading.RLock() for _ in range(64)]
        self.thumbnail_slots = threading.BoundedSemaphore(2)
        self.network_slots = threading.BoundedSemaphore(3)
        self.jobs_lock = threading.RLock()
        self.storage_lock = threading.Lock()
        self.storage_snapshot = None
        self.storage_checked_at = 0
        self.storage_refresh_lock = threading.Lock()
        self.storage_refreshing = False
        self.state_lock = threading.RLock()
        self.generations = {}
        self.worker_context = threading.local()
        try:
            self.index = json.loads((self.root / "index.json").read_text())
        except (OSError, ValueError):
            self.index = {}
        self.worker = None
        try:
            self.jobs = json.loads((self.root / "jobs.json").read_text())
        except (OSError, ValueError):
            self.jobs = {}
        for job in self.jobs.values():
            if job["state"] == "running":
                job["state"] = "pending"
                job["refresh"] = False

    def _download(self, url, headers, limit):
        with self.network_slots:
            return self._download_with_retries(url, headers, limit)

    def _download_with_retries(self, url, headers, limit):
        # Fixed upstreams; do not follow redirects to arbitrary hosts.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                return None
        opener = urllib.request.build_opener(NoRedirect)
        for attempt in range(3):
            self._check_worker()
            try:
                with opener.open(urllib.request.Request(url, headers=headers), timeout=30) as response:
                    data = response.read(limit + 1)
                    if not data or len(data) > limit:
                        raise ValueError("Respuesta TMDB vacía o demasiado grande")
                    return data, response.headers.get_content_type()
            except urllib.error.HTTPError as exc:
                if attempt == 2 or exc.code not in (429, 500, 502, 503, 504):
                    raise TmdbError(
                        "TMDB rechazó las credenciales. Revisa la API key o el token en Ajustes."
                        if exc.code in (401, 403) else f"TMDB respondió con HTTP {exc.code}.",
                        "TMDB_AUTH_ERROR" if exc.code in (401, 403) else "TMDB_HTTP_ERROR",
                    ) from None
                delay = exc.headers.get("Retry-After", "")
                time.sleep(min(30, int(delay)) if delay.isdigit() else 2 ** attempt)
            except (OSError, TimeoutError):
                if attempt == 2:
                    raise TmdbError("La Raspberry no puede conectar con TMDB. Revisa su conexión a Internet, DNS y certificados.", "TMDB_CONNECTION_ERROR") from None
                time.sleep(2 ** attempt)

    def library_summary(self, kind, tmdb_id, language):
        """Read only local metadata and return the fields needed by library cards."""
        credits_ready = self.credits_ready(kind, tmdb_id)
        params = {"language": language}
        if kind == "movie":
            params["append_to_response"] = "external_ids"
        path = f"/{kind}/{int(tmdb_id)}"
        key = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
        try:
            data = json.loads((self.root / "metadata" / (key + ".json")).read_text())
        except (OSError, ValueError):
            return {"id": int(tmdb_id), "creditsReady": credits_ready}
        summary = {"id": int(tmdb_id), "name": data.get("title") or data.get("name") or "",
                "posterPath": data.get("poster_path") or "", "voteAverage": data.get("vote_average") or 0,
                "releaseDate": data.get("release_date") or "", "firstAirDate": data.get("first_air_date") or "",
                "genres": [genre.get("name", "") for genre in data.get("genres", [])],
                "creditsReady": credits_ready}
        if kind == "tv":
            summary.update(self._series_totals(tmdb_id, language, data))
        return summary

    def _series_totals(self, tmdb_id, language, data):
        # Match the series page: regular seasons only, excluding specials.
        seasons = [season for season in data.get("seasons", []) if (season.get("season_number") or 0) > 0]
        episode_count = (sum(season.get("episode_count") or 0 for season in seasons)
                         if "seasons" in data else data.get("number_of_episodes"))
        known_runtimes = []
        for season in seasons:
            try:
                cached = self.json(f"/tv/{int(tmdb_id)}/season/{season['season_number']}",
                                   {"language": language}, local_only=True)
            except TmdbError:
                continue
            episodes = {episode.get("episode_number"): episode for episode in cached.get("episodes", [])
                        if (episode.get("episode_number") or 0) > 0}
            for episode in list(episodes.values())[:season.get("episode_count") or 0]:
                runtime = episode.get("runtime")
                if isinstance(runtime, (int, float)) and runtime > 0:
                    known_runtimes.append(runtime)

        missing = max(0, (episode_count or 0) - len(known_runtimes))
        typical = [runtime for runtime in data.get("episode_run_time", [])
                   if isinstance(runtime, (int, float)) and runtime > 0]
        fallback = typical or known_runtimes
        last_runtime = (data.get("last_episode_to_air") or {}).get("runtime")
        if not fallback and isinstance(last_runtime, (int, float)) and last_runtime > 0:
            fallback = [last_runtime]
        total = None
        if episode_count and (not missing or fallback):
            total = round(sum(known_runtimes) + (missing * sum(fallback) / len(fallback) if missing else 0))
        return {
            "seasonCount": len(seasons) if "seasons" in data else data.get("number_of_seasons"),
            "totalEpisodeCount": episode_count,
            "totalRuntimeMinutes": total,
            "runtimeIsEstimated": total is not None and missing > 0,
        }

    def json(self, path, params=None, refresh=False, local_only=False):
        if not DETAIL_RE.fullmatch(path) and path not in ("/search/movie", "/search/tv"):
            raise ValueError("Ruta TMDB no permitida")
        params = {k: str(v) for k, v in (params or {}).items()
                  if k in {"language", "query", "page", "include_adult", "append_to_response", "include_image_language"} and v is not None}
        is_credits = path.endswith(("/credits", "/aggregate_credits"))
        if path.endswith("/images") or is_credits:
            # Image inventories and original person names/roles are language independent.
            params = {}
        cache_key = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
        target = self.root / "metadata" / (cache_key + ".json")
        if local_only:
            try:
                data = json.loads(target.read_text())
                if is_credits:
                    self._validate_credits(path, data)
                return self._with_movie_links(path, data)
            except (OSError, ValueError):
                if is_credits:
                    try:
                        return self._appended_credits(path)
                    except (OSError, ValueError):
                        pass
                # Episode details already exist inside locally saved season metadata.
                episode = re.fullmatch(r"(.*/season/\d+)/episode/(\d+)", path)
                if episode:
                    season = self.json(episode[1], params, local_only=True)
                    for item in season.get("episodes", []):
                        if item.get("episode_number") == int(episode[2]):
                            return item
                raise TmdbError("Contenido aún no preparado en local. Reintenta cuando termine la preparación de TMDB.", "TMDB_LOCAL_MISSING")
        owner = "/".join(path.strip("/").split("/")[:2]) if DETAIL_RE.fullmatch(path) else None
        with self.state_lock:
            generation = self.generations.get(owner, 0)
            self._check_worker()
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            try:
                if not refresh:
                    data = json.loads(target.read_text())
                    if is_credits:
                        self._validate_credits(path, data)
                    with self.state_lock:
                        self._check_worker()
                        if generation != self.generations.get(owner, 0):
                            raise RuntimeError("Descarga cancelada por borrado del catálogo")
                        self._index_metadata(target.name, owner, data)
                    return self._with_movie_links(path, data)
            except (OSError, ValueError):
                pass
            if is_credits and not refresh:
                try:
                    data = self._appended_credits(path)
                except (OSError, ValueError):
                    pass
                else:
                    # Older devices can import credits appended to the base
                    # detail. Promote them without fetching the same data again.
                    with self.state_lock:
                        self._check_worker()
                        if generation != self.generations.get(owner, 0):
                            raise RuntimeError("Descarga cancelada por borrado del catálogo")
                        self._index_metadata(target.name, owner, data)
                        atomic_write(target, json.dumps(data, ensure_ascii=False).encode())
                    return data
            credentials = self.credentials()
            headers = {"Accept": "application/json"}
            if credentials.get("bearerToken"):
                headers["Authorization"] = "Bearer " + credentials["bearerToken"]
            elif credentials.get("apiKey"):
                params["api_key"] = credentials["apiKey"]
            else:
                raise TmdbError("Faltan las credenciales de TMDB en la Raspberry. Guárdalas en Raspberry → Ajustes → TMDB.", "TMDB_CREDENTIALS_MISSING")
            url = "https://api.themoviedb.org/3" + path + "?" + urllib.parse.urlencode(params)
            raw, _ = self._download(url, headers, 16 * 1024 * 1024)
            data = json.loads(raw)
            if not isinstance(data, dict) or data.get("success") is False:
                raise RuntimeError("Respuesta TMDB inválida")
            if is_credits:
                self._validate_credits(path, data)
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get(owner, 0):
                    raise RuntimeError("Descarga cancelada por borrado del catálogo")
                self._index_metadata(target.name, owner, data)
                atomic_write(target, raw)
            return self._with_movie_links(path, data)

    @staticmethod
    def _credits_path(kind, tmdb_id):
        if kind not in ("movie", "tv") or not str(tmdb_id).isdigit() or int(tmdb_id) <= 0:
            raise ValueError("Película o serie TMDB no válida")
        return f"/{kind}/{int(tmdb_id)}/" + ("credits" if kind == "movie" else "aggregate_credits")

    @staticmethod
    def _validate_credits(path, data):
        """Reject partial/error payloads before they can become an offline cache hit."""
        if (not isinstance(data, dict) or data.get("success") is False
                or data.get("id") != int(path.split("/")[2])):
            raise ValueError("Créditos TMDB inválidos: identificador incorrecto")
        aggregate = path.endswith("/aggregate_credits")
        for section, role, roles in (("cast", "character", "roles"), ("crew", "job", "jobs")):
            people = data.get(section)
            if not isinstance(people, list):
                raise ValueError("Créditos TMDB inválidos: faltan reparto o equipo")
            for person in people:
                if (not isinstance(person, dict) or type(person.get("id")) is not int
                        or person["id"] <= 0 or not isinstance(person.get("name"), str)
                        or not person["name"].strip()):
                    raise ValueError("Créditos TMDB inválidos: persona sin identificador o nombre")
                entries = person.get(roles) if aggregate else [person]
                if not isinstance(entries, list) or any(
                        not isinstance(entry, dict) or not isinstance(entry.get(role), str) for entry in entries):
                    raise ValueError("Créditos TMDB inválidos: faltan personajes o funciones")

    def _appended_credits_target(self, path):
        base, section = path.rsplit("/", 1)
        query = urllib.parse.urlencode({"append_to_response": section})
        filename = hashlib.sha256((base + "?" + query).encode()).hexdigest() + ".json"
        return self.root / "metadata" / filename

    def _appended_credits(self, path):
        """Read credits imported by older devices through the allowed detail route."""
        parent = json.loads(self._appended_credits_target(path).read_text())
        tmdb_id = int(path.split("/")[2])
        if (not isinstance(parent, dict) or parent.get("success") is False
                or parent.get("id") != tmdb_id):
            raise ValueError("Créditos TMDB inválidos: ficha incorrecta")
        nested = parent.get(path.rsplit("/", 1)[1])
        if not isinstance(nested, dict) or ("id" in nested and nested["id"] != tmdb_id):
            raise ValueError("Créditos TMDB inválidos: contenido anidado incorrecto")
        data = {**nested, "id": tmdb_id}
        self._validate_credits(path, data)
        return data

    def credits_ready(self, kind, tmdb_id, *, include_portraits=False):
        """Check local validated credits without network requests or cache writes."""
        try:
            path = self._credits_path(kind, tmdb_id)
            filename = hashlib.sha256((path + "?").encode()).hexdigest() + ".json"
            target = self.root / "metadata" / filename
        except ValueError:
            return False
        signatures = []
        for source in (target, self._appended_credits_target(path)):
            try:
                info = source.stat()
                signatures.append((info.st_ino, info.st_mtime_ns, info.st_size))
            except OSError:
                signatures.append(None)
        if not any(signatures):
            return False
        signature = tuple(signatures)
        saved = self.credits_snapshots.get(filename)
        if not saved or saved[0] != signature:
            try:
                data = self.json(path, local_only=True)
                portraits = self._credit_portrait_paths(kind, tmdb_id, data, include_creators=False)
                ready = True
            except (TmdbError, ValueError):
                ready, portraits = False, set()
            # Keep only validated portrait paths in memory, not entire credits.
            saved = (signature, ready, portraits)
            self.credits_snapshots[filename] = saved
        if not saved[1]:
            return False
        if include_portraits:
            for portrait in saved[2] | self._credit_portrait_paths(kind, tmdb_id, {}):
                try:
                    self.display_image(portrait, 185, local_only=True)
                except (TmdbError, ValueError):
                    return False
        return True

    def warm_credits(self, kind, tmdb_id, refresh=False):
        """Persist full cast/crew JSON; person portraits are never downloaded here."""
        path = self._credits_path(kind, tmdb_id)
        self._check_worker()
        self._progress("credits", 0, 1, path)
        data = self.json(path, refresh=refresh)
        self._validate_credits(path, data)
        self._progress("credits", 1, 1, path)
        return data

    def _credit_portrait_paths(self, kind, tmdb_id, data, *, include_creators=True):
        """Portraits for the people shown in the credits panel, including creators."""
        writing_jobs = {"writer", "screenplay", "story", "teleplay", "characters", "novel", "author",
                        "adaptation", "original story", "original film writer", "original series creator"}
        people = list(data.get("cast", []))
        for person in data.get("crew", []):
            jobs = {str(person.get("job", "")).lower()}
            jobs.update(str(job.get("job", "")).lower() for job in person.get("jobs", []))
            if ("director" in jobs or jobs & writing_jobs
                    or str(person.get("department", "")).lower() == "writing"):
                people.append(person)
        if kind == "tv" and include_creators:
            for params in ({}, *({"language": language} for language in LANGUAGES),
                           {"append_to_response": "aggregate_credits"}):
                try:
                    detail = self.json(f"/tv/{int(tmdb_id)}", params, local_only=True)
                    people.extend(detail.get("created_by") or [])
                except TmdbError:
                    pass
        return {person["profile_path"] for person in people if isinstance(person, dict)
                and isinstance(person.get("profile_path"), str)
                and re.fullmatch(r"/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp)", person["profile_path"])}

    def warm_credit_portraits(self, kind, tmdb_id, data):
        portraits = self._credit_portrait_paths(kind, tmdb_id, data)
        errors = []
        for count, portrait in enumerate(sorted(portraits), 1):
            self._check_worker()
            try:
                self.display_image(portrait, 185)
            except Exception as exc:
                errors.append(f"{portrait}: {exc}")
            self._progress("thumbnails", count, len(portraits), portrait)
        if errors:
            raise RuntimeError("; ".join(errors)[:4000])

    def _with_movie_links(self, path, data, refresh=False, lookup=False, lookup_results=None):
        """Persist movie links once, shared by languages, browsers and restarts."""
        if not re.fullmatch(r"/movie/\d+", path) or "external_ids" not in data:
            return data
        owner = path.lstrip("/")
        target = self.root / "links" / (owner.replace("/", "-") + ".json")
        with self.state_lock:
            generation = self.generations.get(owner, 0)
        with self.link_locks[hash(owner) % len(self.link_locks)] if lookup else nullcontext():
            if not refresh:
                try:
                    saved = json.loads(target.read_text())
                    if isinstance(saved.get("rottenTomatoesUrl"), str):
                        return {**data, "rottenTomatoesUrl": saved["rottenTomatoesUrl"]}
                except (OSError, ValueError, AttributeError):
                    pass
            title = str(data.get("original_title") or data.get("title") or "").strip()
            year = re.match(r"\d{4}", str(data.get("release_date") or ""))
            query = " ".join(filter(None, [title, year.group() if year else ""]))
            fallback = "https://www.rottentomatoes.com/search/?" + urllib.parse.urlencode({"search": query}) if query else ""
            if not lookup:
                return {**data, "rottenTomatoesUrl": fallback}
            url = fallback
            wikidata_id = str((data.get("external_ids") or {}).get("wikidata_id") or "")
            if re.fullmatch(r"Q\d+", wikidata_id):
                try:
                    url = (lookup_results[wikidata_id] if lookup_results is not None
                           else self._rotten_tomatoes_lookup(wikidata_id)) or fallback
                except (OSError, ValueError, KeyError, TypeError):
                    # Persist the useful search link too; a failure must not cause
                    # another Internet request on every library visit.
                    pass
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get(owner, 0):
                    raise RuntimeError("Enlace cancelado por borrado del catálogo")
                atomic_write(target, json.dumps({"rottenTomatoesUrl": url}).encode())
            return {**data, "rottenTomatoesUrl": url}

    def _rotten_tomatoes_lookup(self, wikidata_id):
        return self._rotten_tomatoes_lookup_many([wikidata_id]).get(wikidata_id, "")

    def _rotten_tomatoes_lookup_many(self, wikidata_ids):
        query = urllib.parse.urlencode({"action": "wbgetentities", "ids": "|".join(wikidata_ids),
                                       "props": "claims", "format": "json"})
        request = urllib.request.Request("https://www.wikidata.org/w/api.php?" + query,
                                         headers={"User-Agent": "DonkiCodeMiniTV/1.0", "Accept": "application/json"})
        with self.network_slots, urllib.request.urlopen(request, timeout=4 if len(wikidata_ids) == 1 else 15) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
            if len(raw) > 4 * 1024 * 1024:
                raise ValueError("Respuesta Wikidata demasiado grande")
            payload = json.loads(raw)
            if "error" in payload:
                raise ValueError("No se pudo consultar Wikidata")
            entities = payload.get("entities", {})
        results = {}
        for wikidata_id in wikidata_ids:
            results[wikidata_id] = ""
            for claim in entities.get(wikidata_id, {}).get("claims", {}).get("P1258", []):
                value = claim.get("mainsnak", {}).get("datavalue", {}).get("value")
                if isinstance(value, str) and re.fullmatch(r"m/[A-Za-z0-9_-]+", value.strip()):
                    results[wikidata_id] = "https://www.rottentomatoes.com/" + value.strip()
                    break
        return results

    def display_image(self, path, width=None, local_only=False):
        if local_only:
            if not IMAGE_RE.fullmatch(path) or width not in (None, 185, 342, 500, 780, 1280):
                raise ValueError("Imagen o tamaño no permitido")
            target = self.root / "thumbnails" / str(width) / (path.lstrip("/") + ".webp") if width else self.root / "images" / path.lstrip("/")
            if target.is_file() and target.stat().st_size:
                return target
            raise TmdbError("Imagen pendiente de preparación local", "TMDB_LOCAL_MISSING")
        if width is None:
            return self.image(path)
        if width not in (185, 342, 500, 780, 1280):
            raise ValueError("Tamaño de imagen no permitido")
        if not IMAGE_RE.fullmatch(path):
            raise ValueError("Ruta de imagen no permitida")
        target = self.root / "thumbnails" / str(width) / (path.lstrip("/") + ".webp")
        if target.is_file() and target.stat().st_size:
            return target
        source = None if width == 185 else self.image(path)
        if source is not None and source.suffix == ".svg":
            return source
        with self.state_lock:
            generation = self.generations.get("image:" + path, 0)
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            if target.is_file() and target.stat().st_size:
                return target
            if width == 185:
                # Avatars do not need an original multi-megapixel portrait.
                raw, _ = self._download("https://image.tmdb.org/t/p/w185" + path, {}, 4 * 1024 * 1024)
                source = io.BytesIO(raw)
            from PIL import Image, ImageOps
            with self.thumbnail_slots, Image.open(source) as original:
                original.draft("RGB", (width, width * 2))
                resized = ImageOps.exif_transpose(original)
                resized.thumbnail((width, max(1, round(width * resized.height / resized.width))))
                if resized.mode not in ("RGB", "RGBA"):
                    resized = resized.convert("RGBA" if "transparency" in resized.info else "RGB")
                buffer = io.BytesIO()
                resized.save(buffer, "WEBP", quality=82, method=3)
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get("image:" + path, 0):
                    raise RuntimeError("Miniatura cancelada por borrado del catálogo")
                atomic_write(target, buffer.getvalue())
        return target

    def image(self, path):
        if not IMAGE_RE.fullmatch(path):
            raise ValueError("Ruta de imagen no permitida")
        target = self.root / "images" / path.lstrip("/")
        with self.state_lock:
            generation = self.generations.get("image:" + path, 0)
            self._check_worker()
        with self.io_locks[hash(str(target)) % len(self.io_locks)]:
            if target.is_file() and target.stat().st_size:
                return target
            raw, content_type = self._download("https://image.tmdb.org/t/p/original" + path, {}, 64 * 1024 * 1024)
            # Some TMDB CDN responses omit Content-Type (urllib reports text/plain).
            # Only accept a recognized raster signature matching the requested suffix.
            suffix = target.suffix.lower()
            recognized = (
                (suffix in {".jpg", ".jpeg"} and raw.startswith(b"\xff\xd8\xff"))
                or (suffix == ".png" and raw.startswith(b"\x89PNG\r\n\x1a\n"))
                or (suffix == ".webp" and raw.startswith(b"RIFF") and raw[8:12] == b"WEBP")
            )
            if not content_type.startswith("image/") and not recognized:
                raise ValueError("TMDB no devolvió una imagen")
            with self.state_lock:
                self._check_worker()
                if generation != self.generations.get("image:" + path, 0):
                    raise RuntimeError("Imagen cancelada por borrado del catálogo")
                atomic_write(target, raw)
        return target

    def _check_worker(self):
        context = getattr(self.worker_context, "job", None)
        if context and self.generations.get(context[0], 0) != context[1]:
            raise RuntimeError("Descarga cancelada por borrado del catálogo")

    def _index_metadata(self, filename, owner, data):
        entry = {"owner": owner, "images": sorted(self._images_in(data) | set(self.index.get(filename, {}).get("images", [])))}
        if self.index.get(filename) != entry:
            self.index[filename] = entry
            atomic_write(self.root / "index.json", json.dumps(self.index).encode())

    def _images_in(self, data, include_profiles=True):
        paths = set()
        if isinstance(data, dict):
            for key, value in data.items():
                if key == "profile_path" and not include_profiles:
                    continue
                if key in {"poster_path", "backdrop_path", "still_path", "profile_path", "file_path", "logo_path"} and isinstance(value, str) and IMAGE_RE.fullmatch(value):
                    paths.add(value)
                else:
                    paths.update(self._images_in(value, include_profiles=include_profiles))
        elif isinstance(data, list):
            for value in data:
                paths.update(self._images_in(value, include_profiles=include_profiles))
        return paths

    def warm(self, kind, tmdb_id, extra_images=(), refresh=False):
        base = f"/{kind}/{tmdb_id}"
        images = set(extra_images)
        thumbnails = {(path, 1280) for path in extra_images}
        errors = []
        collected = {}
        self._progress("metadata", 0, 0, base)
        def collect_thumbnails(data):
            # Match the sizes used by library cards, seasons and detail galleries.
            if isinstance(data, dict):
                for field, widths in (("poster_path", (500, 780)),
                                      ("backdrop_path", (1280,)),
                                      ("still_path", (780,))):
                    path = data.get(field)
                    if isinstance(path, str) and IMAGE_RE.fullmatch(path):
                        thumbnails.update((path, width) for width in widths)
                for field, width in (("posters", 780), ("backdrops", 1280), ("stills", 780)):
                    for item in data.get(field, []):
                        path = item.get("file_path")
                        if isinstance(path, str) and IMAGE_RE.fullmatch(path):
                            thumbnails.add((path, width))
                for value in data.values():
                    collect_thumbnails(value)
            elif isinstance(data, list):
                for value in data:
                    collect_thumbnails(value)

        def collect(path, params=None):
            self._check_worker()
            try:
                key = (path, json.dumps(params, sort_keys=True))
                if key in collected:
                    return collected[key]
                data = self.json(path, params, refresh=refresh)
                collected[key] = data
                self._progress("metadata", len(collected), 0, path)
                images.update(self._images_in(data, include_profiles=False))
                collect_thumbnails(data)
                return data
            except Exception as exc:
                errors.append(f"{path}: {exc}")
                return {}
        collect(base + "/images")
        for language in LANGUAGES:
            params = {"language": language}
            if kind == "movie":
                params["append_to_response"] = "external_ids"
            detail = collect(base, params)
            if kind == "movie" and language == LANGUAGES[0]:
                self._with_movie_links(base, detail, refresh=refresh, lookup=True)
            if kind == "tv":
                for season in detail.get("seasons", []):
                    number = season.get("season_number")
                    if not isinstance(number, int) or number < 0:
                        continue
                    season_path = base + f"/season/{number}"
                    season_data = collect(season_path, {"language": language})
                    for episode in season_data.get("episodes", []):
                        episode_number = episode.get("episode_number")
                        if isinstance(episode_number, int) and episode_number > 0:
                            collect(season_path + f"/episode/{episode_number}/images")
                    collect(season_path + "/images")
        errors.extend(self._warm_images(images, thumbnails))
        if self.include_credits:
            try:
                credits = self.warm_credits(kind, tmdb_id, refresh=refresh)
                self.warm_credit_portraits(kind, tmdb_id, credits)
            except Exception as exc:
                errors.append(f"Créditos {base}: {exc}")
        if errors:
            raise RuntimeError("; ".join(errors)[:4000])

    def _warm_images(self, images, thumbnails):
        errors = []
        for count, path in enumerate(sorted(images), 1):
            self._check_worker()
            try:
                self.image(path)
            except Exception as exc:
                errors.append(f"{path}: {exc}")
            self._progress("images", count, len(images), path)
        for count, (path, width) in enumerate(sorted(thumbnails, key=lambda item: (item[1], item[0])), 1):
            self._check_worker()
            try:
                self.display_image(path, width)
            except Exception as exc:
                errors.append(f"Miniatura {path} ({width}): {exc}")
            self._progress("thumbnails", count, len(thumbnails), path)
        return errors

    def _progress(self, phase, completed, total, current):
        context = getattr(self.worker_context, "job", None)
        if context:
            with self.jobs_lock:
                job = self.jobs.get(context[0])
                if job and job["state"] == "running":
                    job["progress"] = {"phase": phase, "completed": completed, "total": total, "current": current}

    def _save_jobs(self):
        atomic_write(self.root / "jobs.json", json.dumps(self.jobs, ensure_ascii=False).encode())

    def enqueue(self, kind, tmdb_id, hero_image="", refresh=False):
        if kind not in ("movie", "tv") or not str(tmdb_id).isdigit() or int(tmdb_id) <= 0:
            return
        extra = []
        match = re.fullmatch(r"https://image\.tmdb\.org/t/p/[^/]+(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))", hero_image or "")
        if not match:
            match = re.search(r"/tmdb/images(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))(?:\?.*)?$", hero_image or "")
        if match:
            extra = [match[1]]
        key = f"{kind}/{int(tmdb_id)}"
        with self.jobs_lock:
            previous = self.jobs.get(key, {})
            images = sorted(set(previous.get("images", [])) | set(extra))
            same_images = images == previous.get("images", [])
            active = previous.get("state") in ("pending", "running")
            if active and not previous.get("creditsOnly") and same_images and not refresh:
                return
            credits_ready = self.credits_ready(kind, tmdb_id, include_portraits=True)
            artwork_ready = bool(previous.get("thumbnailsReady"))
            credits_only = artwork_ready and same_images and not refresh
            if credits_only and ((active and previous.get("creditsOnly")) or credits_ready or not self.include_credits):
                return
            self.jobs[key] = {"kind": kind, "id": int(tmdb_id), "state": "pending", "error": "", "images": images,
                              "refresh": refresh, "creditsOnly": credits_only, "thumbnailsReady": artwork_ready,
                              "creditsReady": credits_ready, "creditsVersion": CREDITS_VERSION if credits_ready else 0}
            try:
                self._save_jobs()
            except OSError as exc:
                self.jobs[key].update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                raise
        self.start()

    def enqueue_credits(self, kind, tmdb_id, refresh=False):
        """Queue credits and portraits, preserving artwork and deduplicating work."""
        self._credits_path(kind, tmdb_id)
        key = f"{kind}/{int(tmdb_id)}"
        with self.jobs_lock:
            previous = self.jobs.get(key, {})
            if previous.get("state") in ("pending", "running"):
                return False  # Full preparation also includes credits.
            ready = self.credits_ready(kind, tmdb_id, include_portraits=True)
            if ready and not refresh:
                return False
            self.jobs[key] = {"kind": kind, "id": int(tmdb_id), "state": "pending", "error": "",
                              "images": list(previous.get("images", [])), "refresh": refresh,
                              "creditsOnly": True, "thumbnailsReady": bool(previous.get("thumbnailsReady")),
                              "creditsReady": ready, "creditsVersion": CREDITS_VERSION if ready else 0}
            try:
                self._save_jobs()
            except OSError as exc:
                self.jobs[key].update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                raise
        self.start()
        return True

    def cancel(self):
        # Invalidate in-flight writes; already published cache files remain reusable.
        with self.state_lock, self.jobs_lock:
            for key, job in self.jobs.items():
                if job["state"] in ("pending", "running"):
                    self.generations[key] = self.generations.get(key, 0) + 1
                    job.update(state="cancelled", error="", refresh=False)
            self._save_jobs()
        return self.status()

    def start(self):
        with self.jobs_lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self._run, name="tmdb-artwork", daemon=True)
            self.worker.start()

    def _run(self):
        while True:
            with self.jobs_lock:
                entry = next(((key, job) for key, job in self.jobs.items() if job["state"] == "pending"), None)
                if entry is None:
                    self.worker = None
                    return
                key, job = entry
                job["state"] = "running"
                generation = self.generations.get(key, 0)
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar la cola: {exc}")
                    continue
            try:
                self.worker_context.job = (key, generation)
                if job.get("creditsOnly"):
                    credits = self.warm_credits(job["kind"], job["id"], job.get("refresh", False))
                    self.warm_credit_portraits(job["kind"], job["id"], credits)
                else:
                    self.warm(job["kind"], job["id"], job["images"], job.get("refresh", False))
                state, error = "complete", ""
            except Exception as exc:
                state, error = "failed", str(exc)
            finally:
                self.worker_context.job = None
            with self.jobs_lock:
                if self.jobs.get(key) is job and job["state"] == "running":
                    job.update(state=state, error=error)
                    if not job.get("creditsOnly"):
                        job["thumbnailsReady"] = state == "complete"
                    job["creditsReady"] = self.credits_ready(job["kind"], job["id"], include_portraits=True)
                    job["creditsVersion"] = CREDITS_VERSION if job["creditsReady"] else 0
                try:
                    self._save_jobs()
                except OSError as exc:
                    job.update(state="failed", error=f"No se pudo guardar el progreso: {exc}")

    @staticmethod
    def profile_image(value):
        match = re.search(r"(?:https://image\.tmdb\.org/t/p/[^/]+|/tmdb/images)(/[A-Za-z0-9_-]+\.(?:jpg|jpeg|png|webp|svg))(?:\?.*)?$", value or "")
        return match[1] if match else None

    def _legacy_metadata(self, owner):
        """Discover the original hash-only cache without contacting TMDB."""
        base = "/" + owner
        paths = [base, base + "/images", self._credits_path(*owner.split("/"))]
        seen = set()
        for path in paths:
            if path in seen:
                continue
            seen.add(path)
            variants = [{}] if path.endswith(("/images", "/credits", "/aggregate_credits")) else [{}, *({"language": lang} for lang in LANGUAGES)]
            if owner.startswith("movie/") and path == base:
                variants += [{**params, "append_to_response": "external_ids"} for params in list(variants)]
            if path == base:
                variants.append({"append_to_response": "credits" if owner.startswith("movie/") else "aggregate_credits"})
            for params in variants:
                digest = hashlib.sha256((path + "?" + urllib.parse.urlencode(sorted(params.items()))).encode()).hexdigest()
                target = self.root / "metadata" / (digest + ".json")
                if not target.is_file():
                    continue
                data = json.loads(target.read_text())
                self._index_metadata(target.name, owner, data)
                if owner.startswith("tv/"):
                    for season in data.get("seasons", []):
                        number = season.get("season_number")
                        if isinstance(number, int) and number >= 0:
                            paths.extend([base + f"/season/{number}", base + f"/season/{number}/images"])
                    if re.fullmatch(re.escape(base) + r"/season/\d+", path):
                        for episode in data.get("episodes", []):
                            number = episode.get("episode_number")
                            if isinstance(number, int) and number > 0:
                                paths.append(path + f"/episode/{number}/images")

    def remove_unused(self, removed, library):
        """Remove only deleted titles' resources, retaining shared references."""
        with self.state_lock, self.jobs_lock:
            active = set()
            protected_images = set()
            for collection, kind in (("movies", "movie"), ("series", "tv")):
                for item in library.get(collection, {}).values():
                    if item.get("tmdbId"):
                        active.add(f"{kind}/{int(item['tmdbId'])}")
                    image = self.profile_image(item.get("heroImage"))
                    if image:
                        protected_images.add(image)
            owners = {f"{kind}/{int(item['tmdbId'])}" for kind, item in removed if item.get("tmdbId")}
            unused = owners - active
            candidates = {self.profile_image(item.get("heroImage")) for _, item in removed}
            candidates.discard(None)
            # Upgrade ownership information for caches created before index.json existed.
            for owner in unused | active | set(self.jobs):
                self._legacy_metadata(owner)
            for owner in unused:
                self.generations[owner] = self.generations.get(owner, 0) + 1
                (self.root / "links" / (owner.replace("/", "-") + ".json")).unlink(missing_ok=True)
                job = self.jobs.pop(owner, {})
                candidates.update(job.get("images", []))
            self._save_jobs()
            deleted_metadata = []
            for filename, entry in self.index.items():
                if entry.get("owner") in unused:
                    candidates.update(entry.get("images", []))
                    deleted_metadata.append(filename)
                elif entry.get("owner") is not None:
                    protected_images.update(entry.get("images", []))
            # Unknown legacy files are retained conservatively, including their images.
            for target in (self.root / "metadata").glob("*.json"):
                if target.name not in self.index:
                    data = json.loads(target.read_text())
                    if isinstance(data.get("results"), list):
                        self._index_metadata(target.name, None, data)
                    else:
                        protected_images.update(self._images_in(data))
            for job in self.jobs.values():
                protected_images.update(job.get("images", []))
            for filename in deleted_metadata:
                if re.fullmatch(r"[a-f0-9]{64}\.json", filename):
                    (self.root / "metadata" / filename).unlink(missing_ok=True)
                del self.index[filename]
            count = 0
            for path in candidates - protected_images:
                if IMAGE_RE.fullmatch(path):
                    self.generations["image:" + path] = self.generations.get("image:" + path, 0) + 1
                    for width in (185, 342, 500, 780, 1280):
                        (self.root / "thumbnails" / str(width) / (path.lstrip("/") + ".webp")).unlink(missing_ok=True)
                    target = self.root / "images" / path.lstrip("/")
                    if target.is_file():
                        target.unlink()
                        count += 1
            atomic_write(self.root / "index.json", json.dumps(self.index).encode())
            return {"metadata": len(deleted_metadata), "images": count}

    def storage_background(self):
        """Return immediately; a single worker scans disk outside HTTP requests."""
        with self.storage_refresh_lock:
            if not self.storage_refreshing and (self.storage_snapshot is None or time.monotonic() - self.storage_checked_at >= 60):
                self.storage_refreshing = True
                def refresh():
                    try:
                        self.storage()
                    finally:
                        with self.storage_refresh_lock:
                            self.storage_refreshing = False
                threading.Thread(target=refresh, name="tmdb-storage", daemon=True).start()
            return {**(self.storage_snapshot or {"available": False}), "calculating": self.storage_refreshing}

    def storage(self):
        # Limit directory scans while several browsers poll download progress.
        with self.storage_lock:
            now = time.monotonic()
            if self.storage_snapshot is not None and now - self.storage_checked_at < 10:
                return dict(self.storage_snapshot)
            try:
                total_bytes = 0
                def fail(error):
                    raise error
                for directory, _, filenames in (os.walk(self.root, followlinks=False, onerror=fail) if self.root.exists() else []):
                    for filename in filenames:
                        path = Path(directory) / filename
                        try:
                            if not path.is_symlink():
                                total_bytes += path.stat().st_size
                        except FileNotFoundError:
                            pass  # Atomic downloads/deletions can race the scan.
                disk_path = self.root
                while not disk_path.exists() and disk_path != disk_path.parent:
                    disk_path = disk_path.parent
                capacity = shutil.disk_usage(disk_path).total
                snapshot = {"available": True, "bytes": total_bytes, "gb": total_bytes / 1_000_000_000,
                            "diskTotalGb": capacity / 1_000_000_000,
                            "percent": total_bytes / capacity * 100 if capacity else 0}
            except OSError:
                snapshot = {"available": False}
            self.storage_snapshot = snapshot
            self.storage_checked_at = now
            return dict(snapshot)

    def status(self):
        with self.jobs_lock:
            jobs = [dict(job) for job in self.jobs.values()]
        return {"total": len(jobs), **{state: sum(j["state"] == state for j in jobs) for state in ("pending", "running", "complete", "failed", "cancelled")},
                "jobs": {f'{j["kind"]}/{j["id"]}': {key: j.get(key) for key in ("state", "progress", "error", "creditsOnly", "creditsReady", "creditsVersion", "thumbnailsReady")} for j in jobs},
                "errors": [{"media": f'{j["kind"]}/{j["id"]}', "error": j["error"]} for j in jobs if j["state"] == "failed"],
                "current": next((f'{j["kind"]}/{j["id"]}' for j in jobs if j["state"] == "running"), "")}
