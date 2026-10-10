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
          "editionKey", "publisher", "publishDate", "language", "pageCount", "pageCountSource", "subjects", "subtitle")
LANGUAGES = {"es": "spa", "ca": "cat", "en": "eng"}
LOCALIZED_FIELDS = ("title", "subtitle", "description", "subjects")
_request_lock = threading.Lock()
_last_request = 0


def normalize_profile(data):
    profile = {key: str(data[key] or "").strip()[:20000 if key == "description" else 2000]
               for key in FIELDS if key in data}
    if "isGraphicNovel" in data:
        value = data["isGraphicNovel"]
        if isinstance(value, str) and value.strip().lower() in {"true", "false"}:
            value = value.strip().lower() == "true"
        if not isinstance(value, bool):
            raise ValueError("Invalid graphic novel classification")
        profile["isGraphicNovel"] = value
    if "localizedMetadata" in data:
        variants = data["localizedMetadata"]
        if isinstance(variants, str):
            variants = json.loads(variants)
        if not isinstance(variants, dict):
            raise ValueError("Invalid localized book metadata")
        profile["localizedMetadata"] = {
            language: {key: str(value[key] or "").strip()[:20000 if key == "description" else 2000]
                       for key in LOCALIZED_FIELDS if key in value}
            for language, value in variants.items() if language in LANGUAGES and isinstance(value, dict)
        }
    return profile


def is_graphic_novel(data, filename):
    profile = normalize_profile(data)
    return profile.get("isGraphicNovel", os.path.splitext(filename)[1].lower() in {".cbz", ".cbr"})


def normalize_language(language):
    language = str(language or "").strip().lower().replace("_", "-").split("-")[0]
    return {"spa": "es", "cat": "ca", "eng": "en"}.get(language, language) if language else "es"


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


def edition_page_count(edition):
    count = str(edition.get("number_of_pages") or "").strip()
    if re.fullmatch(r"[1-9]\d{0,5}", count):
        return count
    # Some catalog records only have a physical-description string. Accept one
    # unambiguous Arabic page sequence; do not guess from ranges or volume counts.
    pagination = str(edition.get("pagination") or "").strip()
    match = re.fullmatch(r"(?:[ivxlcdm]+\s*,\s*)?([1-9]\d{0,5})\s*(?:p\.?|pages\.?|páginas\.?|pàgines\.?)", pagination, re.I)
    return match.group(1) if match else ""


def first_publication_year(work_key, work):
    """Date the work, never a translation/reprint or the creation of its record."""
    match = re.search(r"\b[1-9]\d{3}\b", str(work.get("first_publish_date") or ""))
    if match:
        return match.group()
    if work_key:
        try:
            payload = _get("/search.json", {"q": f"key:{work_key}",
                "fields": "key,first_publish_year", "limit": 1})
            for item in payload.get("docs") or []:
                key = str(item.get("key") or "")
                if key == work_key or "/works/" + key == work_key:
                    year = str(item.get("first_publish_year") or "")
                    if re.fullmatch(r"[1-9]\d{3}", year):
                        return year
        except (OSError, ValueError):
            pass  # Unknown is safer than silently substituting the edition year.
    return ""


def search(query, language="es", *, strict=False):
    if not query.strip():
        return []
    language = normalize_language(language)
    language = language if language in LANGUAGES else "es"
    params = {"q": f"({query[:300]}) language:{LANGUAGES[language]}", "lang": language, "limit": 8,
        "fields": "key,title,author_name,first_publish_year,cover_i,editions,editions.key,editions.title,editions.isbn,editions.language,editions.cover_i"}
    payload = _get("/search.json", params)
    if not payload.get("docs") and not strict:
        # Keep books without a translation discoverable; the UI shows their edition language.
        payload = _get("/search.json", {**params, "q": query[:300]})
    items = []
    for doc in (payload.get("docs") or [])[:8]:
        edition = next(iter((doc.get("editions") or {}).get("docs") or []), {})
        edition_key = str(edition.get("key") or "")
        if edition_key.startswith("OL"):
            edition_key = "/books/" + edition_key
        items.append({"openLibraryKey": _key(doc.get("key"), "works"),
            "editionKey": _key(edition_key, "books"),
            "title": edition.get("title") or doc.get("title") or "",
            "originalTitle": doc.get("title") or "",
            "author": ", ".join(doc.get("author_name") or []),
            "year": str(doc.get("first_publish_year") or ""),
            # ISBN and language must come from the selected edition, never another edition of the work.
            "isbn": next(iter(edition.get("isbn") or []), ""),
            "language": ", ".join(edition.get("language") or []),
            "coverUrl": _cover([edition.get("cover_i"), doc.get("cover_i")])})
    return items


def _localized_edition(edition, language):
    codes = {normalize_language(str(item.get("key") or "").rsplit("/", 1)[-1])
             for item in edition.get("languages") or []}
    if language not in codes:
        return {}
    # Work descriptions/subjects have no language tag. Never call them a translation.
    # Edition subjects also often use English catalog headings, regardless of book language.
    # Bilingual editions have useful titles but their description's language is ambiguous.
    values = {"title": _text(edition.get("title")), "subtitle": _text(edition.get("subtitle")),
              "description": _text(edition.get("description")) if codes == {language} else ""}
    return {key: value for key, value in values.items() if value}


def localized_metadata(work_key, edition_key, edition, language):
    variants = {}
    for code in dict.fromkeys([language, *LANGUAGES]):
        localized = _localized_edition(edition, code)
        if not localized and work_key:
            try:
                matches = search(f"key:{work_key}", code, strict=True)
                match = next((item for item in matches if item["openLibraryKey"] == work_key and item["editionKey"]), None)
                if match:
                    candidate = edition if match["editionKey"] == edition_key else _get(match["editionKey"] + ".json")
                    if any(item.get("key") == work_key for item in candidate.get("works") or []):
                        localized = _localized_edition(candidate, code)
            except (OSError, ValueError):
                # A missing/unavailable translation must not block identification or uploading.
                pass
        variants[code] = localized
    return variants


def details(work_key, edition_key="", language="es"):
    language = normalize_language(language)
    language = language if language in LANGUAGES else "es"
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
    date = str(edition.get("publish_date") or "")
    year = first_publication_year(work_key, work)
    pages = edition_page_count(edition)
    return {"openLibraryKey": work_key, "editionKey": edition_key,
        "title": edition.get("title") or work.get("title") or "",
        "subtitle": edition.get("subtitle") or work.get("subtitle") or "",
        "author": ", ".join(filter(None, authors)), "year": year,
        "isbn": next(iter(edition.get("isbn_13") or edition.get("isbn_10") or []), ""),
        "publisher": ", ".join(edition.get("publishers") or []), "publishDate": date,
        "language": ", ".join(str(item.get("key") or "").rsplit("/", 1)[-1] for item in edition.get("languages") or []),
        "pageCount": pages, "pageCountSource": "openlibrary" if pages else "",
        "subjects": ", ".join((work.get("subjects") or edition.get("subjects") or [])[:20]),
        "description": _text(edition.get("description") or work.get("description")),
        "coverUrl": _cover(edition.get("covers") or []) or _cover(work.get("covers") or []),
        "localizedMetadata": localized_metadata(work_key, edition_key, edition, language)}


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
