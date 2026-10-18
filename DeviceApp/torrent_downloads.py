"""Torrent search and persistent movie/series/book downloads with recoverable imports."""
import base64
import copy
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, wait
import json
import os
from pathlib import Path
import re
import shutil
import threading
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

from tmdb_cache import atomic_write
from video_formats import VIDEO_EXTENSIONS
from torrent_traffic import TorrentTraffic
from free_downloads import FreeDownloadsMixin, safe_path

HASH_RE = re.compile(r"[a-fA-F0-9]{40}")
TERMINAL = {"complete", "cancelled", "failed"}
SEARCH_TIMEOUT = 15
SEARCH_CACHE_SECONDS = 120
SEARCH_POOL = ThreadPoolExecutor(max_workers=12, thread_name_prefix="torrent-search")
SEARCH_CACHE = OrderedDict()
SEARCH_CACHE_LOCK = threading.Lock()
EPISODE_RE = re.compile(r"(?<![a-z0-9])(?:s(\d{1,2})[ ._-]*e(\d{1,3})|(\d{1,2})x(\d{1,3}))(?!\d)", re.I)
EPISODE_SUFFIX_RE = re.compile(r"([ ._]*[-+]?[ ._]*[ex]|[ ._]*[-+][ ._]*)(\d{1,3})(?!\d)(?=$|[^a-z0-9]|[ex]\d)", re.I)
LEGACY_COMBINED_EPISODES_ERROR = "No se admiten varios capítulos unidos en un solo vídeo. Elige otra versión."


class CombinedEpisodesWarning(ValueError):
    code = "COMBINED_EPISODES"

    def __init__(self, filename):
        self.filename = filename
        super().__init__("El nombre de un vídeo indica varios capítulos unidos. Puedes descargarlo igualmente; esos capítulos abrirán el mismo vídeo completo.")


def episode_number_groups(name):
    """Read explicit episode lists and ranges without treating resolutions as episodes."""
    filename = Path(str(name)).name
    numbers = []
    previous_end = None

    def append(season, episode, separator=""):
        if episode <= 0:
            return
        if numbers and "-" in separator and numbers[-1][0] == season and numbers[-1][1] < episode:
            numbers.extend((season, ep) for ep in range(numbers[-1][1] + 1, episode + 1))
        else:
            numbers.append((season, episode))

    matches = list(EPISODE_RE.finditer(filename))
    for index, match in enumerate(matches):
        season, episode = (int(match[1]), int(match[2])) if match[1] is not None else (int(match[3]), int(match[4]))
        separator = filename[previous_end:match.start()].strip() if previous_end is not None else ""
        append(season, episode, separator if separator == "-" else "")
        previous_end = match.end()
        next_start = matches[index + 1].start() if index + 1 < len(matches) else len(filename)
        while suffix := EPISODE_SUFFIX_RE.match(filename, previous_end, next_start):
            append(season, int(suffix[2]), suffix[1])
            previous_end = suffix.end()
    return list(dict.fromkeys(numbers))


def episode_numbers(name):
    numbers = episode_number_groups(name)
    if len(numbers) > 1:
        raise CombinedEpisodesWarning(str(name))
    return numbers[0] if numbers else None


def can_download_combined_episodes(job):
    return (job.get("mediaType") == "series" and job.get("state") == "failed"
            and not job.get("item") and not job.get("allowCombinedEpisodes")
            and (job.get("errorCode") == CombinedEpisodesWarning.code
                 or job.get("error") == LEGACY_COMBINED_EPISODES_ERROR))


def episode_filter(value, label, minimum=0, maximum=99):
    if value is None or value == "":
        return None
    if isinstance(value, bool) or not re.fullmatch(r"\d{1,3}", str(value)) or not minimum <= int(value) <= maximum:
        raise ValueError(f"{label} no válido.")
    return int(value)


def series_filters(season=None, episode=None):
    season = episode_filter(season, "Número de temporada")
    episode = episode_filter(episode, "Número de capítulo", 1, 999)
    if episode is not None and season is None:
        raise ValueError("Selecciona la temporada del capítulo.")
    return season, episode


class TorrentError(RuntimeError):
    pass


def positive_int(value):
    try:
        return max(0, int(value))
    except (TypeError, ValueError, OverflowError):
        return 0


def normalize_results(rows, media_type="movies"):
    if not isinstance(rows, list):
        raise TorrentError("The Pirate Bay ha devuelto una respuesta no válida.")
    results = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        info_hash = str(row.get("info_hash") or "").lower()
        categories = {"601"} if media_type == "books" else {"205", "208", "211"} if media_type == "series" else {"201", "207", "209"}
        if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40 or (media_type != "generic" and str(row.get("category")) not in categories):
            continue
        size = positive_int(row.get("size"))
        if not size or not str(row.get("name") or "").strip():
            continue
        results[info_hash] = {"infoHash": info_hash, "name": str(row["name"])[:500],
                              "sizeBytes": size, "seeds": positive_int(row.get("seeders")),
                              "leechers": positive_int(row.get("leechers")), "sources": ["The Pirate Bay"]}
    return sorted(results.values(), key=lambda row: (-row["seeds"], row["name"]))[:100]


def _search_json(url, source):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "MiniTV/1.0", "Accept": "application/json"}), timeout=12) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError("response too large")
        return json.loads(raw)
    except (OSError, ValueError) as exc:
        raise TorrentError(f"No se pudo consultar {source}. Inténtalo de nuevo más tarde.") from exc


def search_pirate_bay(query, media_type="movies"):
    url = "https://apibay.org/q.php?" + urllib.parse.urlencode({"q": query, "cat": "0" if media_type == "generic" else "601" if media_type == "books" else "200"})
    return normalize_results(_search_json(url, "The Pirate Bay"), media_type)


def normalize_knaben_results(payload, media_type="movies"):
    if not isinstance(payload, dict) or not isinstance(payload.get("hits"), list):
        raise TorrentError("Knaben ha devuelto una respuesta no válida.")
    results = []
    for row in payload["hits"]:
        if not isinstance(row, dict):
            continue
        categories = row.get("categoryId")
        # Prefer subcategories: some movie records incorrectly include the TV parent id.
        ids = [positive_int(cat) for cat in categories] if isinstance(categories, list) else []
        is_movie = any(3000000 <= cat < 4000000 for cat in ids)
        is_series = any(2000000 <= cat < 3000000 for cat in ids) and not is_movie
        is_book = any(cat in {9000000, 9001000} for cat in ids) and not any(cat in {9002000, 9003000, 9004000} for cat in ids)
        if media_type != "generic" and not (is_book if media_type == "books" else is_series if media_type == "series" else is_movie):
            continue
        info_hash = str(row.get("hash") or "").lower()
        name = row.get("title")
        size = positive_int(row.get("bytes"))
        # The current downloader uses public magnets; do not follow arbitrary download URLs.
        if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40 or not size or not isinstance(name, str) or not name.strip():
            continue
        tracker = row.get("tracker")
        source = f"{tracker.strip()[:80]} (Knaben)" if isinstance(tracker, str) and tracker.strip() else "Knaben"
        results.append({"infoHash": info_hash, "name": name[:500], "sizeBytes": size,
                        "seeds": positive_int(row.get("liveSeeders") if row.get("liveSeeders") is not None else row.get("seeders")),
                        "leechers": positive_int(row.get("livePeers") if row.get("livePeers") is not None else row.get("peers")),
                        "sources": [source]})
    return results


def search_knaben(query, media_type="movies"):
    # API v2: https://knaben.org/api/v2/ ; categories: https://knaben.org/rss/
    base = 2000000 if media_type == "series" else 3000000
    categories = "9001000" if media_type == "books" else ",".join(str(cat) for cat in range(base, base + 8001, 1000))
    params = {"q": query, "o": "seeders", "d": "desc", "s": 100}
    if media_type != "generic":
        params["c"] = categories
    url = "https://api.knaben.org/v2/search?" + urllib.parse.urlencode(params)
    return normalize_knaben_results(_search_json(url, "Knaben"), media_type)


def search_eztv(imdb_id, season=None, episode=None, page=1):
    # https://eztvx.to/api/ : exact show lookup, paginated in batches of 100.
    imdb_id = str(imdb_id or "").removeprefix("tt")
    if not re.fullmatch(r"\d{5,10}", imdb_id):
        raise ValueError("Falta un identificador IMDb válido para consultar EZTV.")
    payload = _search_json("https://eztvx.to/api/get-torrents?" + urllib.parse.urlencode({
        "imdb_id": imdb_id, "limit": 100, "page": page,
    }), "EZTV")
    if not isinstance(payload, dict) or not isinstance(payload.get("torrents"), list):
        raise TorrentError("EZTV ha devuelto una respuesta no válida.")
    results = []
    for row in payload["torrents"]:
        if not isinstance(row, dict) or str(row.get("imdb_id")) != imdb_id:
            continue
        info_hash = str(row.get("hash") or "").lower()
        name = row.get("title") or row.get("filename")
        size = positive_int(row.get("size_bytes"))
        if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40 or not size or not isinstance(name, str) or not name.strip():
            continue
        if season is not None and str(row.get("season")) != str(season):
            continue
        if episode is not None and str(row.get("episode")) != str(episode):
            continue
        results.append({"infoHash": info_hash, "name": name[:500], "sizeBytes": size,
                        "seeds": positive_int(row.get("seeds")), "leechers": positive_int(row.get("peers")),
                        "sources": ["EZTV"]})
    return {"results": results, "nextEztvPage": page + 1 if page < 100 and page * 100 < positive_int(payload.get("torrents_count")) else None}


def torznab_sources():
    """Server-owned configuration only; URLs and API keys never enter responses."""
    try:
        sources = json.loads(os.environ.get("MINITV_TORZNAB_SOURCES", "[]"))
        if not isinstance(sources, list) or len(sources) > 8:
            raise ValueError()
        for source in sources:
            if not isinstance(source, dict):
                raise ValueError()
            if not isinstance(source.get("name"), str) or not source["name"].strip() or len(source["name"]) > 80:
                raise ValueError()
            url = urllib.parse.urlsplit(source.get("url", ""))
            if url.scheme not in {"http", "https"} or not url.hostname or url.username or url.password or url.fragment:
                raise ValueError()
            if not isinstance(source.get("apiKey", ""), str):
                raise ValueError()
        return sources
    except (ValueError, TypeError, AttributeError):
        raise ValueError("MINITV_TORZNAB_SOURCES debe contener hasta 8 fuentes con name, url HTTP(S) y apiKey.") from None


def normalize_torznab_results(raw, source, media_type="movies"):
    # No DTDs/entities: external indexers only need a plain RSS document.
    if b"<!DOCTYPE" in raw.upper() or b"<!ENTITY" in raw.upper():
        raise TorrentError("Respuesta Torznab no válida.")
    try:
        root = ET.fromstring(raw)
    except ET.ParseError:
        raise TorrentError("Respuesta Torznab no válida.") from None
    if root.tag != "rss" or root.find("channel") is None:
        raise TorrentError("Respuesta Torznab no válida.")
    results = []
    category_base = 7000 if media_type == "books" else 5000 if media_type == "series" else 2000
    for item in root.findall("./channel/item"):
        attributes = [node for node in item if node.tag.rsplit("}", 1)[-1] == "attr"]
        attrs = {node.get("name"): node.get("value", "") for node in attributes}
        categories = [positive_int(node.get("value")) for node in attributes if node.get("name") == "category"]
        categories += [positive_int(node.text) for node in item.findall("category")]
        if media_type != "generic" and not (any(cat in {7000, 7020} for cat in categories) and not any(cat in {7010, 7030, 7040} for cat in categories) if media_type == "books" else any(category_base <= cat < category_base + 1000 for cat in categories)):
            continue
        if attrs.get("private", "0") != "0":
            continue  # Private trackers require their original torrent and passkey.
        info_hash = attrs.get("infohash", "").lower()
        if not HASH_RE.fullmatch(info_hash):
            enclosure = item.find("enclosure")
            magnet = attrs.get("magneturl") or item.findtext("link") or (enclosure.get("url", "") if enclosure is not None else "")
            parsed = urllib.parse.urlsplit(magnet)
            for xt in urllib.parse.parse_qs(parsed.query).get("xt", []) if parsed.scheme == "magnet" else []:
                if xt.lower().startswith("urn:btih:"):
                    candidate = xt[9:]
                    if re.fullmatch(r"[A-Za-z2-7]{32}", candidate):
                        candidate = base64.b32decode(candidate.upper()).hex()
                    if HASH_RE.fullmatch(candidate):
                        info_hash = candidate.lower()
                        break
        name = (item.findtext("title") or "").strip()
        enclosure = item.find("enclosure")
        size = positive_int(item.findtext("size") or attrs.get("size") or (enclosure.get("length") if enclosure is not None else 0))
        if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40 or not name or not size:
            continue
        seeds = positive_int(attrs.get("seeders"))
        results.append({"infoHash": info_hash, "name": name[:500], "sizeBytes": size,
                        "seeds": seeds, "leechers": positive_int(attrs.get("leechers")) if "leechers" in attrs else max(0, positive_int(attrs.get("peers")) - seeds),
                        "sources": [source]})
    return results


def search_torznab(query, media_type, source):
    url = urllib.parse.urlsplit(source["url"])
    params = dict(urllib.parse.parse_qsl(url.query))
    params.update(t="search", q=query, cat="7020" if media_type == "books" else "5000" if media_type == "series" else "2000", limit="100")
    if media_type == "generic":
        params.pop("cat", None)
    if source.get("apiKey"):
        params["apikey"] = source["apiKey"]
    endpoint = urllib.parse.urlunsplit(url._replace(query=urllib.parse.urlencode(params)))
    try:
        request = urllib.request.Request(endpoint, headers={"User-Agent": "MiniTV/1.0", "Accept": "application/rss+xml, application/xml"})
        with urllib.request.urlopen(request, timeout=12) as response:
            raw = response.read(4 * 1024 * 1024 + 1)
        if len(raw) > 4 * 1024 * 1024:
            raise ValueError()
        return normalize_torznab_results(raw, source["name"], media_type)
    except (OSError, ValueError):
        raise TorrentError("No se pudo consultar la fuente Torznab.") from None


def merge_torrent_results(rows):
    results = {}
    for row in rows:
        key = row["infoHash"]
        if key not in results:
            results[key] = copy.deepcopy(row)
            continue
        previous = results[key]
        sources = list(dict.fromkeys(previous["sources"] + row["sources"]))
        # The same swarm can appear on several sites; seed counts must not be added.
        best = row if row["seeds"] > previous["seeds"] else previous
        results[key] = {**best, "sources": sources, "leechers": max(previous["leechers"], row["leechers"])}
    return sorted(results.values(), key=lambda row: (-row["seeds"], row["name"]))[:100]


def search_torrents(query, media_type="movies", imdb_id=None, season=None, episode=None, eztv_page=1):
    query = str(query or "").strip()
    if not query or len(query) > 200:
        raise ValueError("Escribe un título de hasta 200 caracteres.")
    if not isinstance(media_type, str) or media_type not in {"movies", "series", "books", "generic"}:
        raise ValueError("Tipo de contenido no válido.")
    season, episode = series_filters(season, episode)
    eztv_page = episode_filter(eztv_page, "Página de EZTV", 1, 100)
    if eztv_page is None or (media_type != "series" and (season is not None or episode is not None or eztv_page != 1)):
        raise ValueError("Filtros de búsqueda no válidos.")
    imdb_id = str(imdb_id or "")
    if imdb_id and not re.fullmatch(r"(?:tt)?\d{5,10}", imdb_id):
        raise ValueError("Identificador IMDb no válido.")
    if eztv_page > 1 and not imdb_id:
        raise ValueError("Falta el identificador IMDb para consultar más resultados de EZTV.")
    extra_sources = torznab_sources() if eztv_page == 1 else []
    key = (query, media_type, imdb_id, season, episode, eztv_page, json.dumps(extra_sources, sort_keys=True))
    with SEARCH_CACHE_LOCK:
        cached = SEARCH_CACHE.get(key)
        if cached and time.monotonic() - cached[0] < SEARCH_CACHE_SECONDS:
            return copy.deepcopy(cached[1])
    scoped_query = query
    if media_type == "series" and season is not None:
        scoped_query += f" S{season:02d}" + (f"E{episode:02d}" if episode is not None else "")
    # Keep the movie provider call compatible with existing callers.
    args = (scoped_query, media_type) if media_type != "movies" else (query,)
    providers = [("piratebay", "The Pirate Bay", search_pirate_bay, args), ("knaben", "Knaben", search_knaben, args)] if eztv_page == 1 else []
    providers.extend((f"torznab_{i}", source["name"], search_torznab, (scoped_query, media_type, source))
                     for i, source in enumerate(extra_sources))
    if media_type == "series" and imdb_id:
        providers.append(("eztv", "EZTV", search_eztv, (imdb_id, season, episode, eztv_page)))
    futures = [(provider_id, name, SEARCH_POOL.submit(search, *params)) for provider_id, name, search, params in providers]
    done, _ = wait([future for _, _, future in futures], timeout=SEARCH_TIMEOUT)
    rows, sources, next_eztv_page = [], [], None
    for provider_id, name, future in futures:
        status = {"id": provider_id, "name": name, "status": "error", "count": 0}
        if future in done:
            try:
                found = future.result()
                if provider_id == "eztv":
                    next_eztv_page = found["nextEztvPage"]
                    found = found["results"]
                rows.extend(found)
                status.update(status="ok", count=len(found))
            except (TorrentError, OSError, ValueError):
                pass
        else:
            future.cancel()
        sources.append(status)
    if all(source["status"] == "error" for source in sources):
        names = " ni ".join(name for _, name, _, _ in providers) or "EZTV"
        raise TorrentError(f"No se pudo consultar {names}. Inténtalo de nuevo más tarde.")
    result = {"results": merge_torrent_results(rows), "sources": sources}
    if media_type == "series":
        result["nextEztvPage"] = next_eztv_page
        if not imdb_id:
            sources.append({"id": "eztv", "name": "EZTV", "status": "skipped", "reason": "missing_imdb", "count": 0})
        elif eztv_page == 1 and any(source["id"] == "eztv" and source["status"] == "error" for source in sources):
            result["nextEztvPage"] = 1
    # Cache only complete responses so that retrying a failed source works immediately.
    if all(source["status"] == "ok" for source in sources):
        with SEARCH_CACHE_LOCK:
            SEARCH_CACHE[key] = (time.monotonic(), copy.deepcopy(result))
            SEARCH_CACHE.move_to_end(key)
            while len(SEARCH_CACHE) > 32:
                SEARCH_CACHE.popitem(last=False)
    return result


class Transmission:
    def __init__(self):
        self.url = os.environ.get("MINITV_TRANSMISSION_URL", "http://127.0.0.1:9092/transmission/rpc")
        self.session = ""

    def call(self, method, arguments=None):
        headers = {"Content-Type": "application/json"}
        username = os.environ.get("MINITV_TRANSMISSION_USER", "")
        if username:
            credentials = username + ":" + os.environ.get("MINITV_TRANSMISSION_PASSWORD", "")
            headers["Authorization"] = "Basic " + base64.b64encode(credentials.encode()).decode()
        for attempt in range(2):
            headers["X-Transmission-Session-Id"] = self.session
            req = urllib.request.Request(self.url, data=json.dumps({"method": method, "arguments": arguments or {}}).encode(), headers=headers)
            try:
                with urllib.request.urlopen(req, timeout=10) as response:
                    payload = json.load(response)
                if payload.get("result") != "success":
                    raise TorrentError("Transmission: " + str(payload.get("result", "respuesta no válida")))
                return payload.get("arguments", {})
            except urllib.error.HTTPError as exc:
                if exc.code == 409 and attempt == 0:
                    self.session = exc.headers.get("X-Transmission-Session-Id", "")
                    continue
                raise TorrentError(f"Transmission respondió con HTTP {exc.code}.") from exc
            except (OSError, ValueError) as exc:
                raise TorrentError("No se puede conectar con Transmission. Comprueba el servicio minitv-torrents en la Raspberry.") from exc


def video_file(files):
    return max(video_files(files), key=lambda entry: positive_int(entry[1]["length"]))


def video_files(files):
    candidates = []
    for index, item in enumerate(files):
        name = str(item.get("name", ""))
        path = Path(name)
        if path.suffix.lower() not in VIDEO_EXTENSIONS or re.search(r"(^|[\W_])sample([\W_]|$)", name, re.I):
            continue
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            raise TorrentError("El torrent contiene una ruta de vídeo no permitida.")
        if positive_int(item.get("length")):
            candidates.append((index, item))
    if not candidates:
        # Metadata is available even before any video bytes have been downloaded.
        # Show what was rejected instead of mistaking a suffix filter for a codec error.
        extensions = sorted({Path(str(item.get("name", ""))).suffix.lower()[:24] or "(sin extensión)"
                             for item in files})
        detected = ", ".join(extensions[:20]) or "ningún archivo"
        if len(extensions) > 20:
            detected += ", …"
        raise TorrentError(
            f"El torrent no contiene un vídeo seleccionable. Extensiones detectadas: {detected}. "
            "Se excluyen samples, archivos vacíos, comprimidos e imágenes de disco."
        )
    return candidates


def series_video_files(files, season=None, episode=None, allow_combined=False):
    selected, seen = [], set()
    candidates = video_files(files)
    recognized = False
    for index, item in candidates:
        groups = episode_number_groups(item["name"])
        recognized = recognized or bool(groups)
        matching = [(sn, ep) for sn, ep in groups
                    if (season is None or sn == season) and (episode is None or ep == episode)]
        if not matching:
            continue
        if len(groups) > 1 and not allow_combined:
            raise CombinedEpisodesWarning(item["name"])
        for sn, ep in matching:
            if (sn, ep) in seen:
                raise TorrentError("El torrent contiene varias versiones del mismo capítulo. Elige otra versión.")
            seen.add((sn, ep))
            selected.append((index, item, sn, ep))
    if not selected:
        explanation = (
            "Ya se ha obtenido la lista de archivos del torrent: sus nombres se pueden leer "
            "sin descargar los vídeos, aunque el progreso marque 0 MB. "
        )
        if recognized:
            selection = f"la temporada {season}" if season is not None else "la selección actual"
            if episode is not None:
                selection += f", capítulo {episode}"
            explanation += (
                f"Se han reconocido capítulos, pero ninguno coincide con {selection}. "
                "Revisa la selección o elige otro torrent. "
            )
        else:
            explanation += (
                "MiniTV no puede identificar la temporada y el capítulo en los nombres de los vídeos. "
                "Necesita una numeración como S01E01 o 1x01 para importarlos a la biblioteca. "
                "Esto no significa que los vídeos estén dañados o sean incompatibles. "
                "Elige un torrent con esa numeración. "
            )
        names = [Path(item["name"]).name for _, item in candidates[:3]]
        examples = "; ".join(f'«{name[:160]}{"…" if len(name) > 160 else ""}»' for name in names)
        remaining = len(candidates) - len(names)
        explanation += f"Nombres encontrados: {examples}"
        if remaining:
            explanation += f" (y {remaining} vídeos más)"
        raise TorrentError(explanation + ".")
    return selected


def book_file(files, book):
    """Select one readable book; never silently import an unrelated anthology/pack."""
    def normalized(value):
        return re.sub(r"[^a-z0-9]", "", unicodedata.normalize("NFKD", str(value)).encode("ascii", "ignore").decode().lower())
    candidates = []
    for index, item in enumerate(files):
        name = str(item.get("name", ""))
        path = Path(name)
        if path.suffix.lower() not in {".epub", ".pdf"} or not positive_int(item.get("length")):
            continue
        if path.is_absolute() or ".." in path.parts or "\\" in name:
            raise TorrentError("El torrent contiene una ruta de libro no permitida.")
        candidates.append((index, item))
    if not candidates:
        raise TorrentError("El torrent no contiene un libro EPUB o PDF. No se importan comprimidos ni audiolibros.")
    if len(candidates) == 1:
        return candidates[0]
    title = normalized(book["name"])
    matches = [entry for entry in candidates if len(title) >= 4 and title in normalized(Path(entry[1]["name"]).stem)]
    if not matches:
        raise TorrentError("El torrent contiene varios libros y no se puede identificar el seleccionado. Elige un torrent de ese libro.")
    if len({normalized(Path(item["name"]).stem) for _, item in matches}) > 1:
        raise TorrentError("Hay varias ediciones o libros coincidentes. Elige un torrent de un solo libro.")
    return min(matches, key=lambda entry: (Path(entry[1]["name"]).suffix.lower() != ".epub", entry[0]))


class TorrentDownloads(FreeDownloadsMixin):
    def __init__(self, root, import_movie, artwork_status, prepare_artwork, rpc=None,
                 import_series=None, series_artwork_status=None, prepare_series_artwork=None, import_book=None):
        self.root = Path(root).resolve()
        self.state_path = self.root / "jobs.json"
        self.rpc = rpc or Transmission()
        self.traffic = TorrentTraffic(self.root / "traffic.sqlite3", rpc or Transmission())
        self.import_movie = import_movie
        self.artwork_status = artwork_status
        self.prepare_artwork = prepare_artwork
        self.import_series = import_series
        self.import_book = import_book
        self.series_artwork_status = series_artwork_status
        self.prepare_series_artwork = prepare_series_artwork
        self.lock = threading.RLock()
        self.operation = threading.Lock()
        self.worker = None
        self.service_error = ""
        self.last_health = 0
        try:
            self.jobs = json.loads(self.state_path.read_text())
            if not isinstance(self.jobs, dict):
                raise ValueError("Invalid jobs")
        except FileNotFoundError:
            self.jobs = {}
        # Do not silently discard an unreadable queue and orphan its transfers.
        for job in self.jobs.values():
            if job.get("extraction", {}).get("state") == "extracting":
                staging = safe_path(self.root, f"extractions/{job['id']}", must_exist=False)
                if staging.exists():
                    shutil.rmtree(staging)
                self._update(job, extraction={"state": "failed", "error": "La descompresión se interrumpió al reiniciar. Puedes reintentarla."})

    def _save(self):
        atomic_write(self.state_path, json.dumps(self.jobs, ensure_ascii=False).encode())

    def _update(self, job, **updates):
        with self.lock:
            job.update(updates, updatedAt=time.time())
            self._save()

    def upload_settings(self):
        settings = self.rpc.call("session-get")
        return {"limited": bool(settings.get("speed-limit-up-enabled")),
                "limitKBps": settings.get("speed-limit-up", 100),
                "alternateLimits": bool(settings.get("alt-speed-enabled") or settings.get("alt-speed-time-enabled"))}

    def set_upload_settings(self, data):
        if not isinstance(data, dict) or type(data.get("limited")) is not bool:
            raise ValueError("Indica si quieres limitar la subida.")
        limit = data.get("limitKBps")
        if type(limit) is not int or not 1 <= limit <= 1000000:
            raise ValueError("El límite debe ser un entero entre 1 y 1000000 kB/s.")
        with self.operation:
            if self.upload_settings()["alternateLimits"]:
                raise ValueError("Desactiva los límites alternativos y su horario en Transmission antes de cambiar este ajuste.")
            self.rpc.call("session-set", {"speed-limit-up-enabled": data["limited"], "speed-limit-up": limit})
            return self.upload_settings()

    def snapshot(self):
        with self.lock:
            return {"jobs": sorted(copy.deepcopy([{**job, "canDownloadAnyway": can_download_combined_episodes(job)}
                                                   for job in self.jobs.values() if not job.get("hidden")]), key=lambda j: -j["createdAt"]),
                    "serviceError": self.service_error}

    def _remove_history(self, job):
        if job["state"] not in {"complete", "cancelled"}:
            raise ValueError("Solo puedes quitar del historial descargas finalizadas o canceladas.")
        if job.get("mediaType") == "generic" and job["state"] == "complete" and not job.get("deleted"):
            raise ValueError("Borra el contenido de la descarga libre antes de quitarla.")
        self._cleanup_free_cancelled(job)
        with self.lock:
            previous = copy.deepcopy(job)
            if job.get("transferRemoved"):
                del self.jobs[job["id"]]
            else:
                # Keep a hidden cleanup record if Transmission has not acknowledged removal yet.
                job["hidden"] = True
            try:
                self._save()
            except OSError:
                self.jobs[job["id"]] = previous
                raise
        return {"id": job["id"], "removed": True}

    def add(self, data):
        info_hash = str(data.get("infoHash", "")).lower()
        media_type = data.get("mediaType", "movies")
        if not isinstance(media_type, str) or media_type not in {"movies", "series", "books", "generic"}:
            raise ValueError("Tipo de contenido no válido.")
        is_series = media_type == "series"
        is_book = media_type == "books"
        is_generic = media_type == "generic"
        media_key = "generic" if is_generic else "book" if is_book else "series" if is_series else "movie"
        media = {"id": info_hash, "name": data.get("name")} if is_generic else data.get(media_key)
        if not isinstance(media, dict) or not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40:
            raise ValueError("Selecciona un torrent y una ficha válidos.")
        if is_series and not all((self.import_series, self.series_artwork_status, self.prepare_series_artwork)):
            raise TorrentError("Las descargas de series no están configuradas.")
        if is_book and not self.import_book:
            raise TorrentError("Las descargas de libros no están configuradas.")
        season, episode = series_filters(data.get("seasonNumber"), data.get("episodeNumber"))
        tmdb_id = info_hash if is_generic else str(media.get("openLibraryKey") or "") if is_book else positive_int(media.get("id"))
        name = str(media.get("name") or "").strip()[:250]
        if not tmdb_id or not name:
            raise ValueError("Falta el nombre de la descarga." if is_generic else "Falta la ficha de Open Library del libro." if is_book else "Falta la ficha TMDB del contenido.")
        if is_generic and (season is not None or episode is not None):
            raise ValueError("Las descargas libres no tienen filtros de capítulos.")
        if is_book and (not re.fullmatch(r"/works/OL\d+W", tmdb_id) or season is not None or episode is not None):
            raise ValueError("Falta una ficha de Open Library válida para el libro.")
        overwrite = data.get("overwriteExisting") is True
        with self.operation:
            archive = None
            for existing in self.jobs.values():
                if existing["id"] == info_hash:
                    same_target = (existing.get("mediaType", "movies") == media_type
                                   and existing.get(media_key, {}).get("id") == tmdb_id)
                    if existing.get("mediaType") == "generic" and existing["state"] == "complete" and not existing.get("deleted"):
                        if same_target:
                            return copy.deepcopy(existing)
                        raise ValueError("Este torrent está guardado en Descargas libres. Abre su contenido para añadirlo a una ficha.")
                    if existing["state"] in {"complete", "cancelled"}:
                        self._remove_transfer(existing)
                        if not existing.get("transferRemoved"):
                            raise TorrentError("La descarga anterior sigue finalizando. Inténtalo de nuevo en unos segundos.")
                        self._cleanup_free_cancelled(existing)
                        archive = copy.deepcopy(existing)
                        archive["id"] = f"{info_hash}-history-{time.time_ns()}"
                    else:
                        if not same_target:
                            if is_generic and existing["state"] == "failed" and not existing.get("item"):
                                return self._retry_as_free(existing)
                            title = next((existing[key]["name"] for key in ("movie", "series", "book", "generic")
                                          if existing.get(key, {}).get("name")), existing["name"])
                            raise ValueError(f"Este torrent tiene un intento de descarga vinculado a «{title}». "
                                             "Revisa su estado en «Ver descargas». La asociación no significa que se haya descargado.")
                        if is_series and (existing.get("seasonNumber"), existing.get("episodeNumber")) != (season, episode):
                            raise ValueError("Este torrent ya tiene otra selección de capítulos en curso.")
                        if overwrite and not existing.get("overwriteExisting"):
                            self._update(existing, overwriteExisting=True)
                        return copy.deepcopy(existing)
                if not is_series and existing.get("mediaType", "movies") == media_type and existing[media_key]["id"] == tmdb_id and existing["state"] not in TERMINAL:
                    raise ValueError("Este contenido ya tiene una descarga en curso.")
            self.rpc.call("session-get")
            folder = self.root / ("free" if is_generic else "downloads") / info_hash
            safe_path(self.root, folder.relative_to(self.root).as_posix(), must_exist=False)
            folder.mkdir(parents=True, exist_ok=True)
            job = {"id": info_hash, "name": str(data.get("name") or name)[:500],
                   "mediaType": media_type, media_key: {"id": tmdb_id, "name": name}, "state": "queued", "error": "",
                   "sizeBytes": positive_int(data.get("sizeBytes")), "downloadedBytes": 0,
                   "progress": 0, "rateBytes": 0, "eta": -1, "createdAt": time.time()}
            job["overwriteExisting"] = overwrite
            if is_book:
                job["book"].update({key: copy.deepcopy(media[key]) for key in ("openLibraryKey", "author", "description", "localizedMetadata", "coverUrl", "originalTitle") if key in media})
                job["overwriteExisting"] = False
            if is_series:
                job.update(seasonNumber=season, episodeNumber=episode, overwriteExisting=False)
            sources = data.get("sources")
            if isinstance(sources, list):
                job["sources"] = list(dict.fromkeys(source.strip()[:100] for source in sources[:8]
                                                   if isinstance(source, str) and source.strip()))
            with self.lock:
                if archive:
                    self.jobs[archive["id"]] = archive
                self.jobs[info_hash] = job
                self._save()  # Journal the intent before sending the magnet; restart can recover it.
            try:
                self._add_transfer(job)
            except TorrentError as exc:
                self._update(job, state="failed", error=str(exc))
                raise
            self.start()
            return copy.deepcopy(job)

    def _retry_as_free(self, previous):
        # Keep the engine and partial files in their original directory. Changing
        # the destination would orphan data and trip the ownership check.
        self._check_ownership(previous)
        job = {**previous, "mediaType": "generic", "reuseMediaFolder": True,
               "generic": {"id": previous["id"], "name": previous["name"]},
               "state": "failed", "error": "La descarga libre está pendiente de reanudarse. Pulsa Reintentar.",
               "rateBytes": 0, "overwriteExisting": False}
        for key in ("movie", "series", "book", "seasonNumber", "episodeNumber", "allowCombinedEpisodes",
                    "videoIndex", "videoIndices", "videoName", "episodeCount", "errorCode", "errorFile", "transferRemoved", "hidden"):
            job.pop(key, None)
        with self.lock:
            self.jobs[job["id"]] = job
            try:
                self._save()
            except OSError:
                self.jobs[job["id"]] = previous
                raise
        try:
            self._add_transfer(job)
            # Adding a duplicate magnet does not resume a stopped transfer.
            self.rpc.call("torrent-start", {"ids": [job["id"]]})
        except TorrentError as exc:
            self._update(job, error=str(exc))
            raise
        self._update(job, state="queued", error="")
        self.start()
        return copy.deepcopy(job)

    def _add_transfer(self, job):
        folder = self.download_folder(job)
        result = self.rpc.call("torrent-add", {"filename": "magnet:?xt=urn:btih:" + job["id"],
                                               "download-dir": str(folder), "paused": False})
        if result.get("torrent-duplicate"):
            self._check_ownership(job)
        else:
            self._update(job, videoIndex=None, videoIndices=None)

    def _check_ownership(self, job):
        rows = self.rpc.call("torrent-get", {"ids": [job["id"]], "fields": ["downloadDir"]}).get("torrents", [])
        if rows and Path(rows[0].get("downloadDir", "")).resolve() != self.download_folder(job):
            raise TorrentError("Este torrent existe en Transmission fuera de MiniTV; no se modificará.")

    def action(self, job_id, action):
        if not isinstance(action, str) or action not in {"pause", "resume", "cancel", "retry", "remove", "delete", "download_anyway"}:
            raise ValueError("Acción no válida.")
        with self.operation:
            job = self.jobs.get(job_id)
            if not job:
                raise KeyError(job_id)
            if action == "delete":
                return self.delete_free_download(job)
            if action == "remove":
                return self._remove_history(job)
            if job["state"] in {"complete", "cancelled", "importing", "metadata"}:
                raise ValueError("Esta descarga ya no admite esa acción.")
            if action == "retry" and job["state"] != "failed":
                raise ValueError("Solo se pueden reintentar descargas con error.")
            if action == "download_anyway" and not can_download_combined_episodes(job):
                raise ValueError("Solo puedes omitir el aviso de capítulos unidos de una descarga de series.")
            if job.get("item"):
                if action != "retry":
                    raise ValueError("El contenido ya está importado; pulsa Reintentar para actualizar su estado.")
                # Recover queues written before artwork errors became non-fatal.
                self._complete_with_artwork_warning(job, job.get("error"))
            elif action == "cancel":
                self._check_ownership(job)
                # Persist cancellation before removing data so an API restart cannot re-import it.
                self.rpc.call("torrent-stop", {"ids": [job_id]})
                self._update(job, state="cancelled", error="", errorCode="", errorFile="", rateBytes=0)
                self.rpc.call("torrent-remove", {"ids": [job_id], "delete-local-data": True})
                self._update(job, transferRemoved=True)
                self._cleanup_free_cancelled(job)
            elif action == "pause":
                self._check_ownership(job)
                self.rpc.call("torrent-stop", {"ids": [job_id]})
                self._update(job, state="paused", rateBytes=0)
            else:
                self._check_ownership(job)
                if action == "download_anyway":
                    self._update(job, allowCombinedEpisodes=True)
                if action in {"retry", "download_anyway"}:
                    self._add_transfer(job)
                self.rpc.call("torrent-start", {"ids": [job_id]})
                self._update(job, state="queued", error="", errorCode="", errorFile="")
            return copy.deepcopy(job)

    def start(self):
        self.traffic.start()
        with self.lock:
            if self.worker and self.worker.is_alive():
                return
            self.worker = threading.Thread(target=self._run, name="media-torrents", daemon=True)
            self.worker.start()

    def _run(self):
        while True:
            try:
                self.tick()
            except Exception as exc:
                with self.lock:
                    self.service_error = str(exc)
            time.sleep(5)

    def tick(self):
        with self.operation:
            if time.time() - self.last_health > 30:
                self.last_health = time.time()
                try:
                    self.rpc.call("session-get")
                    self.service_error = ""
                except TorrentError as exc:
                    self.service_error = str(exc)
            for job in list(self.jobs.values()):
                if job.get("deleteRequested"):
                    self._finish_free_delete(job)
                    continue
                if job["state"] == "failed" and job.get("item"):
                    self._complete_with_artwork_warning(job, job.get("error"))
                if job["state"] in {"cancelled", "complete"}:
                    self._remove_transfer(job)
                    self._cleanup_free_cancelled(job)
                    if job.get("hidden") and job.get("transferRemoved"):
                        self._remove_history(job)
            active = [job for job in self.jobs.values() if job["state"] not in TERMINAL]
            if not active:
                return
            fields = ["hashString", "status", "error", "errorString", "metadataPercentComplete", "percentDone",
                      "sizeWhenDone", "leftUntilDone", "rateDownload", "eta", "peersConnected", "files", "downloadDir"]
            # Metadata preparation can finish even if Transmission is temporarily unavailable.
            for job in active:
                if job["state"] == "metadata":
                    self._finish_artwork(job)
            transfers = [job for job in active if job["state"] not in TERMINAL | {"metadata", "paused"}]
            if not transfers:
                return
            rows = self.rpc.call("torrent-get", {"ids": [j["id"] for j in transfers], "fields": fields}).get("torrents", [])
            self.service_error = ""
            by_hash = {row["hashString"].lower(): row for row in rows}
            for job in transfers:
                try:
                    row = by_hash.get(job["id"])
                    if not row:
                        self._add_transfer(job)
                        continue
                    self._advance(job, row)
                except (OSError, TorrentError, ValueError) as exc:
                    self._update(job, state="failed", error=str(exc), errorCode=getattr(exc, "code", ""),
                                 errorFile=getattr(exc, "filename", "") if isinstance(exc, CombinedEpisodesWarning) else "", rateBytes=0)
                    try:
                        self._check_ownership(job)
                        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
                    except TorrentError:
                        pass

    def _advance(self, job, row):
        folder = self.download_folder(job)
        if Path(row.get("downloadDir", "")).resolve() != folder:
            raise TorrentError("La carpeta de descarga no pertenece a MiniTV.")
        if row.get("error"):
            raise TorrentError(row.get("errorString") or "Transmission no pudo descargar el torrent.")
        if row.get("metadataPercentComplete", 0) < 1:
            self._update(job, state="queued", peers=positive_int(row.get("peersConnected")))
            return
        if job.get("mediaType") == "generic":
            self._advance_free(job, row, folder)
            return
        if job.get("mediaType") == "series":
            self._advance_series(job, row, folder)
            return
        is_book = job.get("mediaType") == "books"
        index, selected = book_file(row.get("files", []), job["book"]) if is_book else video_file(row.get("files", []))
        if job.get("videoIndex") != index:
            unwanted = [i for i in range(len(row["files"])) if i != index]
            args = {"ids": [job["id"]], "files-wanted": [index]}
            if unwanted:
                args["files-unwanted"] = unwanted
            self.rpc.call("torrent-set", args)
            self._update(job, videoIndex=index, videoName=selected["name"])
            return  # Wait for Transmission to report the new wanted size and verified completion.
        length = positive_int(selected["length"])
        downloaded = min(length, positive_int(selected.get("bytesCompleted")))
        status = int(row.get("status", 0))
        self._update(job, state="paused" if status == 0 and downloaded < length else "downloading",
                     sizeBytes=length, downloadedBytes=downloaded, progress=round(downloaded * 100 / length, 1),
                     rateBytes=positive_int(row.get("rateDownload")), eta=row.get("eta", -1),
                     peers=positive_int(row.get("peersConnected")))
        if downloaded != length or row.get("leftUntilDone") != 0 or row.get("percentDone", 0) < 1 or status in {1, 2}:
            return
        source = folder / selected["name"]
        resolved = source.resolve()
        if not resolved.is_relative_to(folder) or any(p.is_symlink() for p in [source, *source.parents] if p != self.root.parent):
            raise TorrentError("La ruta del libro descargado no es segura." if is_book else "La ruta del vídeo descargado no es segura.")
        if not source.is_file() or source.stat().st_size != length:
            raise TorrentError("El libro descargado está incompleto o no existe." if is_book else "El fichero de vídeo descargado está incompleto o no existe.")
        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
        self._update(job, state="importing", rateBytes=0)
        item = self.import_book(job, source) if is_book else self.import_movie(job, source)
        self._update(job, state="metadata", item=item, progress=100)
        self._finish_artwork(job)

    def _advance_series(self, job, row, folder):
        selected = series_video_files(row.get("files", []), job.get("seasonNumber"), job.get("episodeNumber"),
                                      allow_combined=job.get("allowCombinedEpisodes") is True)
        # Several catalog episodes may share a video, but it is downloaded and counted once.
        selected_files = {index: item for index, item, _, _ in selected}
        indices = list(selected_files)
        if job.get("videoIndices") != indices:
            self.rpc.call("torrent-set", {"ids": [job["id"]], "files-wanted": indices,
                                          "files-unwanted": [i for i in range(len(row["files"])) if i not in indices]})
            self._update(job, videoIndices=indices, episodeCount=len(selected))
            return
        length = sum(positive_int(item["length"]) for item in selected_files.values())
        downloaded = sum(min(positive_int(item["length"]), positive_int(item.get("bytesCompleted"))) for item in selected_files.values())
        status = int(row.get("status", 0))
        self._update(job, state="paused" if status == 0 and downloaded < length else "downloading",
                     sizeBytes=length, downloadedBytes=downloaded, progress=round(downloaded * 100 / length, 1),
                     rateBytes=positive_int(row.get("rateDownload")), eta=row.get("eta", -1),
                     peers=positive_int(row.get("peersConnected")))
        if downloaded != length or row.get("leftUntilDone") != 0 or row.get("percentDone", 0) < 1 or status in {1, 2}:
            return
        episodes = []
        for _, selected_file, sn, ep in selected:
            source = folder / selected_file["name"]
            if not source.resolve().is_relative_to(folder) or any(p.is_symlink() for p in [source, *source.parents] if p != self.root.parent):
                raise TorrentError("La ruta del capítulo descargado no es segura.")
            if not source.is_file() or source.stat().st_size != positive_int(selected_file["length"]):
                raise TorrentError("Un capítulo descargado está incompleto o no existe.")
            episodes.append({"source": source, "seasonNumber": sn, "episodeNumber": ep, "id": f"S{sn:02d}E{ep:02d}"})
        self.rpc.call("torrent-stop", {"ids": [job["id"]]})
        self._update(job, state="importing", rateBytes=0)
        item = self.import_series(job, episodes)
        self._update(job, state="metadata", item=item, progress=100)
        self._finish_artwork(job)

    def _prepare_job_artwork(self, job):
        if job.get("mediaType") == "series":
            self.prepare_series_artwork(job["series"]["id"])
        else:
            self.prepare_artwork(job["movie"]["id"])

    def _finish_artwork(self, job):
        self._remove_transfer(job)
        if job.get("mediaType") == "books":
            self._update(job, state="complete", completedAt=time.time(), error="")
            return
        try:
            status = (self.series_artwork_status(job["series"]["id"]) if job.get("mediaType") == "series"
                      else self.artwork_status(job["movie"]["id"]))
            if not status:
                self._prepare_job_artwork(job)
            elif status.get("state") == "complete":
                self._update(job, state="complete", completedAt=time.time(), error="")
            elif status.get("state") in {"failed", "cancelled"}:
                self._complete_with_artwork_warning(job, status.get("error"))
        except Exception as exc:
            self._complete_with_artwork_warning(job, str(exc))

    def _complete_with_artwork_warning(self, job, warning):
        # An imported library item is usable even if optional TMDB assets fail.
        self._update(job, state="complete", completedAt=time.time(), progress=100,
                     rateBytes=0, error="", artworkWarning=warning or "No se completaron los recursos de TMDB.")

    def _remove_transfer(self, job):
        # The library has its own hard link; deleting staging data preserves the video.
        if job.get("transferRemoved"):
            return
        try:
            self._check_ownership(job)
            self.rpc.call("torrent-remove", {"ids": [job["id"]], "delete-local-data": not (job.get("mediaType") == "generic" and job["state"] == "complete")})
            self._update(job, transferRemoved=True)
        except TorrentError as exc:
            # Retry cleanup on later ticks without blocking TMDB completion.
            self.service_error = str(exc)
