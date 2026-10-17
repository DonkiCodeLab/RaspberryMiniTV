"""Bounded, metadata-only magnet inspection, isolated from download jobs."""
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import tempfile
import threading
import time

from torrent_downloads import HASH_RE, TorrentError, episode_number_groups
from video_formats import VIDEO_EXTENSIONS

_POOL = ThreadPoolExecutor(max_workers=2, thread_name_prefix="torrent-preview")
_LOCK = threading.Lock()
_CACHE = OrderedDict()


def describe_files(files):
    result = []
    for index in range(files.num_files()):
        if files.pad_file_at(index):
            continue
        name = files.file_path(index)
        video = Path(name).suffix.lower() in VIDEO_EXTENSIONS
        result.append({"name": name, "sizeBytes": files.file_size(index), "video": video,
                       "episodes": [{"season": season, "episode": episode}
                                    for season, episode in episode_number_groups(name)] if video else []})
    return result


def read_metadata(info_hash, timeout=45):
    try:
        import libtorrent as lt
    except ImportError as exc:
        raise TorrentError("El visor necesita python3-libtorrent. Ejecuta DeviceApp/install_torrent_support.sh en la Raspberry y reinicia la API.") from exc
    with tempfile.TemporaryDirectory(prefix="minitv-preview-") as folder:
        session = lt.session({"listen_interfaces": "0.0.0.0:0", "enable_upnp": False,
                              "enable_natpmp": False, "enable_lsd": False,
                              "connections_limit": 40})
        params = lt.parse_magnet_uri("magnet:?xt=urn:btih:" + info_hash)
        params.save_path = folder
        # upload_mode prevents piece requests; auto-management must never clear it.
        params.flags |= lt.torrent_flags.upload_mode
        params.flags &= ~(lt.torrent_flags.auto_managed | lt.torrent_flags.paused)
        handle = None
        try:
            handle = session.add_torrent(params)
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if handle.has_metadata():
                    handle.pause()
                    metadata = handle.torrent_file()
                    files = describe_files(metadata.files())
                    return {"status": "ready", "name": metadata.name(), "files": files,
                            "sizeBytes": sum(file["sizeBytes"] for file in files)}
                time.sleep(0.25)
            raise TorrentError("No se ha podido obtener el contenido: los peers no han respondido. Prueba de nuevo o elige otro torrent.")
        finally:
            session.pause()
            if handle is not None:
                session.remove_torrent(handle)


def preview(info_hash):
    info_hash = str(info_hash or "").lower()
    if not HASH_RE.fullmatch(info_hash) or info_hash == "0" * 40:
        raise ValueError("Selecciona un torrent válido.")
    with _LOCK:
        now = time.monotonic()
        for key, (created, future) in list(_CACHE.items()):
            if future.done() and now - created > 600:
                del _CACHE[key]
        entry = _CACHE.get(info_hash)
        if entry is None:
            if sum(not future.done() for _, future in _CACHE.values()) >= 2:
                raise TorrentError("Hay otras consultas de contenido en curso. Inténtalo en unos segundos.")
            if len(_CACHE) >= 32:
                oldest = next(key for key, (_, future) in _CACHE.items() if future.done())
                del _CACHE[oldest]
            entry = (now, _POOL.submit(read_metadata, info_hash))
            _CACHE[info_hash] = entry
        future = entry[1]
        if not future.done():
            return {"status": "loading"}
        try:
            return future.result()
        except Exception as exc:
            del _CACHE[info_hash]
            if isinstance(exc, TorrentError):
                raise
            raise TorrentError("No se ha podido inspeccionar el torrent. Inténtalo de nuevo.") from exc
