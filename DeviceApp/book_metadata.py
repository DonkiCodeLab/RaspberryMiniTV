"""Open Library lookup and local artwork for user-confirmed book profiles."""
import hashlib
import json
import os
import re
import tempfile
import threading
import time
import urllib.parse
import urllib.request


FIELDS = ("title", "author", "year", "isbn", "description", "coverUrl", "openLibraryKey",
          "editionKey", "publisher", "publishDate", "language", "pageCount", "subjects", "subtitle")
_request_lock = threading.Lock()
_last_request = 0


def normalize_profile(data):
    return {key: str(data[key] or "").strip()[:20000 if key == "description" else 2000]
            for key in FIELDS if key in data}


def _get(path, params=None):
    global _last_request
    url = "https://openlibrary.org" + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    # Identified clients may make three requests/second. Detail lookup is on demand.
    with _request_lock:
        time.sleep(max(0, .35 - (time.monotonic() - _last_request)))
        _last_request = time.monotonic()
    req = urllib.request.Request(url, headers={"User-Agent": "DonkicodeLab-MiniTV/1.0 (book catalog)", "Accept": "application/json"})
    with urllib.request.urlopen(req, timeout=12) as response:
        return json.loads(response.read(4 * 1024 * 1024).decode("utf-8"))


def _key(value, kind):
    value = str(value or "")
    suffix = {"works": "W", "books": "M", "authors": "A"}[kind]
    return value if re.fullmatch(rf"/{kind}/OL\d+{suffix}", value) else ""


def _text(value):
    return str(value.get("value") or "") if isinstance(value, dict) else str(value or "")


def _cover(ids):
    value = next((value for value in ids if isinstance(value, int) and value > 0), None)
    return f"https://covers.openlibrary.org/b/id/{value}-L.jpg?default=false" if value else ""


def search(query, language="es"):
    if not query.strip():
        return []
    payload = _get("/search.json", {"q": query[:300], "lang": language, "limit": 8,
        "fields": "key,title,author_name,first_publish_year,cover_i,editions,editions.key,editions.title,editions.isbn,editions.language"})
    items = []
    for doc in (payload.get("docs") or [])[:8]:
        edition = next(iter((doc.get("editions") or {}).get("docs") or []), {})
        edition_key = str(edition.get("key") or "")
        if edition_key.startswith("OL"):
            edition_key = "/books/" + edition_key
        items.append({"openLibraryKey": _key(doc.get("key"), "works"),
            "editionKey": _key(edition_key, "books"),
            "title": edition.get("title") or doc.get("title") or "",
            "author": ", ".join(doc.get("author_name") or []),
            "year": str(doc.get("first_publish_year") or ""),
            # ISBN and language must come from the selected edition, never another edition of the work.
            "isbn": next(iter(edition.get("isbn") or []), ""),
            "language": ", ".join(edition.get("language") or []),
            "coverUrl": _cover([doc.get("cover_i")])})
    return items


def details(work_key, edition_key=""):
    work_key, edition_key = _key(work_key, "works"), _key(edition_key, "books")
    if not work_key and not edition_key:
        raise ValueError("Selecciona un resultado válido de Open Library.")
    edition = _get(edition_key + ".json") if edition_key else {}
    edition_work = next(iter(edition.get("works") or []), {}).get("key")
    if edition_key and work_key and edition_work != work_key:
        raise ValueError("La edición seleccionada no pertenece a este libro.")
    work_key = _key(edition_work, "works") or work_key
    work = _get(work_key + ".json") if work_key else {}
    authors = []
    for entry in (edition.get("authors") or work.get("authors") or [])[:8]:
        author = entry.get("author", entry)
        key = _key(author.get("key"), "authors")
        if author.get("name"):
            authors.append(author["name"])
        elif key:
            authors.append(_get(key + ".json").get("name") or "")
    date = str(edition.get("publish_date") or work.get("first_publish_date") or "")
    year = re.search(r"\b\d{4}\b", date)
    return {"openLibraryKey": work_key, "editionKey": edition_key,
        "title": edition.get("title") or work.get("title") or "",
        "subtitle": edition.get("subtitle") or work.get("subtitle") or "",
        "author": ", ".join(filter(None, authors)), "year": year.group() if year else "",
        "isbn": next(iter(edition.get("isbn_13") or edition.get("isbn_10") or []), ""),
        "publisher": ", ".join(edition.get("publishers") or []), "publishDate": date,
        "language": ", ".join(str(item.get("key") or "").rsplit("/", 1)[-1] for item in edition.get("languages") or []),
        "pageCount": str(edition.get("number_of_pages") or ""),
        "subjects": ", ".join((work.get("subjects") or edition.get("subjects") or [])[:20]),
        "description": _text(edition.get("description") or work.get("description")),
        "coverUrl": _cover(edition.get("covers") or []) or _cover(work.get("covers") or [])}


class _CoverRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlsplit(newurl)
        # Open Library serves older covers from Internet Archive storage nodes.
        trusted_host = parsed.netloc in {"covers.openlibrary.org", "archive.org"} or re.fullmatch(r"ia\d+\.(?:us\.)?archive\.org", parsed.netloc)
        if parsed.scheme != "https" or not trusted_host:
            raise ValueError("La portada redirige fuera de Open Library / Internet Archive.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def cache_cover(url, directory, relative_path):
    """Only fetch provider artwork; local/manual URLs are never remote fetch targets."""
    if not re.fullmatch(r"https://covers\.openlibrary\.org/b/id/\d+-[SML]\.jpg(?:\?default=false)?", url):
        return url
    req = urllib.request.Request(url, headers={"User-Agent": "DonkicodeLab-MiniTV/1.0 (book catalog)"})
    with urllib.request.build_opener(_CoverRedirect()).open(req, timeout=15) as response:
        data = response.read(8 * 1024 * 1024 + 1)
    if len(data) > 8 * 1024 * 1024 or not data.startswith(b"\xff\xd8\xff"):
        raise ValueError("Open Library no ha devuelto una portada JPEG válida.")
    os.makedirs(directory, exist_ok=True)
    digest = hashlib.sha256(relative_path.encode() + data).hexdigest()[:32]
    name = f"openlibrary-{digest}.jpg"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=directory, delete=False) as handle:
            temporary = handle.name
            handle.write(data)
        os.replace(temporary, os.path.join(directory, name))
    finally:
        if temporary and os.path.exists(temporary):
            os.remove(temporary)
    return "/book-covers/" + name
