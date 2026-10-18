"""Stream archive entries into a private directory without trusting stored paths.

libarchive reads ZIP, RAR, 7z and tar compression variants. It never writes to disk:
we allow only regular files/directories and publish the result after full success.
"""
import ctypes as C
from ctypes.util import find_library
from functools import lru_cache
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile

SUFFIXES = (".tar.gz", ".tar.bz2", ".tar.xz", ".zip", ".rar", ".7z", ".tar", ".tgz", ".tbz2", ".txz", ".gz", ".bz2", ".xz")
MAX_ENTRIES = 50000
MAX_BYTES = 100 * 1024 ** 3


def is_archive(path):
    return str(path).lower().endswith(SUFFIXES)


@lru_cache(maxsize=1)
def archive_library():
    name = find_library("archive")
    if not name:
        raise ValueError("Falta libarchive. Ejecuta DeviceApp/install_torrent_support.sh en la Raspberry.")
    lib = C.CDLL(name)
    signatures = {
        "archive_read_new": (C.c_void_p, []),
        "archive_read_support_filter_all": (C.c_int, [C.c_void_p]),
        "archive_read_support_format_all": (C.c_int, [C.c_void_p]),
        "archive_read_support_format_raw": (C.c_int, [C.c_void_p]),
        "archive_read_open_filename": (C.c_int, [C.c_void_p, C.c_char_p, C.c_size_t]),
        "archive_read_next_header": (C.c_int, [C.c_void_p, C.POINTER(C.c_void_p)]),
        "archive_read_data": (C.c_ssize_t, [C.c_void_p, C.c_void_p, C.c_size_t]),
        "archive_read_free": (C.c_int, [C.c_void_p]),
        "archive_entry_pathname": (C.c_char_p, [C.c_void_p]),
        "archive_entry_filetype": (C.c_uint, [C.c_void_p]),
        "archive_entry_size": (C.c_int64, [C.c_void_p]),
        "archive_entry_symlink": (C.c_char_p, [C.c_void_p]),
        "archive_entry_hardlink": (C.c_char_p, [C.c_void_p]),
    }
    for symbol, (result, args) in signatures.items():
        fn = getattr(lib, symbol)
        fn.restype, fn.argtypes = result, args
    return lib


def extract_archive(source, *, staging_parent=None):
    source = Path(source)
    lib = archive_library()
    suffix = next((suffix for suffix in SUFFIXES if source.name.lower().endswith(suffix)), "")
    stem = source.name[:-len(suffix)] if suffix else source.stem
    output = source.with_name((stem or "contenido") + " (extraído)")
    number = 2
    while output.exists():
        output = source.with_name(f"{stem or 'contenido'} (extraído {number})")
        number += 1
    budget = min(MAX_BYTES, max(0, shutil.disk_usage(source.parent).free - 64 * 1024 ** 2))
    reader = lib.archive_read_new()
    if not reader:
        raise ValueError("No se pudo abrir el descompresor.")
    try:
        lib.archive_read_support_filter_all(reader)
        lib.archive_read_support_format_all(reader)
        if suffix in {".gz", ".bz2", ".xz"}:
            lib.archive_read_support_format_raw(reader)
        if lib.archive_read_open_filename(reader, os.fsencode(source), 10240) != 0:
            raise ValueError("No se pudo abrir el comprimido. Comprueba que esté completo y sin contraseña.")
        with tempfile.TemporaryDirectory(prefix=".extract-", dir=staging_parent or source.parent) as staging:
            entry = C.c_void_p()
            buffer = C.create_string_buffer(1024 * 1024)
            count, total = 0, 0
            while True:
                code = lib.archive_read_next_header(reader, C.byref(entry))
                if code == 1:  # ARCHIVE_EOF
                    break
                if code != 0:
                    raise ValueError("El comprimido está dañado, cifrado o usa un formato no compatible.")
                count += 1
                raw_name = lib.archive_entry_pathname(entry)
                name = os.fsdecode(raw_name or b"")
                if suffix in {".gz", ".bz2", ".xz"} and name == "data":
                    name = stem
                path = PurePosixPath(name)
                kind = lib.archive_entry_filetype(entry)
                if (not name or path.is_absolute() or ".." in path.parts or "\\" in name or ":" in name
                        or lib.archive_entry_symlink(entry) is not None or lib.archive_entry_hardlink(entry) is not None
                        or kind not in {stat.S_IFREG, stat.S_IFDIR}):
                    raise ValueError("El comprimido contiene rutas, enlaces o archivos no seguros.")
                if count > MAX_ENTRIES or lib.archive_entry_size(entry) > budget - total:
                    raise ValueError("El contenido supera el espacio disponible o el límite de descompresión.")
                destination = Path(staging).joinpath(*path.parts)
                if kind == stat.S_IFDIR:
                    destination.mkdir(parents=True, exist_ok=True)
                    continue
                destination.parent.mkdir(parents=True, exist_ok=True)
                with destination.open("xb") as handle:
                    while True:
                        length = lib.archive_read_data(reader, buffer, len(buffer))
                        if length < 0:
                            raise ValueError("No se pudo descomprimir el archivo completo. Puede estar dañado o cifrado.")
                        if length == 0:
                            break
                        total += length
                        if total > budget:
                            raise ValueError("No hay espacio suficiente para descomprimir el contenido.")
                        handle.write(buffer.raw[:length])
            if not count:
                raise ValueError("El comprimido está vacío.")
            os.rename(staging, output)
        return output
    finally:
        lib.archive_read_free(reader)
