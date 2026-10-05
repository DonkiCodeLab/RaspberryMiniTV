"""Render ZIP/RAR comics once for both PDF readers and library covers."""
import hashlib
import fcntl
import os
import re
import shutil
import subprocess
import tempfile
import zipfile


class ComicError(ValueError):
    pass


def page_names(names):
    images = [name for name in names if not name.endswith("/")
              and not any(part.startswith(".") or part == "__MACOSX" for part in name.split("/"))
              and os.path.splitext(name)[1].lower() in {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp"}]
    return sorted(images, key=lambda name: [int(part) if part.isdigit() else part.lower()
                                          for part in re.split(r"(\d+)", name)])


def _rar(path, member=None):
    # libarchive can list some RAR archives whose compression it cannot decode
    # (e.g. older RAR image filters). Prefer the official decoder when installed.
    unrar = shutil.which("unrar")
    if unrar:
        command = [unrar, "lb" if member is None else "p", "-c-" if member is None else "-inul", "-p-", "-ai", "-scu", "-@", "--", os.path.abspath(path)]
        if member is not None:
            command.append(member)
        try:
            return subprocess.run(command, check=True, capture_output=True, timeout=120).stdout
        except (OSError, subprocess.SubprocessError) as exc:
            raise ComicError("No se pudo leer el CBR. Comprueba que no esté dañado ni protegido con contraseña.") from exc
    executable = shutil.which("bsdtar")
    if not executable:
        raise ComicError("Falta el lector RAR. Actualiza la Raspberry o instala libarchive-tools.")
    command = [executable, "-tf" if member is None else "-xOf", path]
    if member is not None:
        # bsdtar member selectors are patterns, even when passed without a shell.
        command += ["--", re.sub(r"([*?\[\]\\])", r"\\\1", member)]
    try:
        return subprocess.run(command, check=True, capture_output=True, timeout=120).stdout
    except (OSError, subprocess.SubprocessError) as exc:
        raise ComicError("No se pudo leer el CBR con libarchive. Instala UnRAR con DeviceApp/install_comic_support.sh y vuelve a intentarlo.") from exc


def comic_pdf(path, cache_dir):
    stat = os.stat(path)
    key = hashlib.sha256(f"v1:{os.path.realpath(path)}:{stat.st_size}:{stat.st_mtime_ns}".encode()).hexdigest()
    os.makedirs(cache_dir, exist_ok=True)
    output = os.path.join(cache_dir, key + ".pdf")
    # The menu and concurrent cover/browser requests share one conversion.
    with open(output + ".lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        return _render_pdf(path, cache_dir, output)


def _render_pdf(path, cache_dir, output):
    if os.path.isfile(output):
        return output
    try:
        import fitz
    except ImportError as exc:
        raise ComicError("Falta el conversor de cómics. Actualiza la Raspberry o instala python3-fitz.") from exc

    archive = None
    temporary = None
    try:
        # Some .cbr files are actually ZIPs; detect the content, not the suffix.
        if zipfile.is_zipfile(path):
            archive = zipfile.ZipFile(path)
            names = page_names(archive.namelist())
            read = archive.read
        else:
            names = page_names(_rar(path).decode("utf-8").splitlines())
            read = lambda name: _rar(path, name)
        if not names:
            raise ComicError("El cómic no contiene páginas de imagen compatibles.")
        with fitz.open() as document:
            for name in names:
                with fitz.open(stream=read(name), filetype=os.path.splitext(name)[1][1:]) as picture:
                    with fitz.open("pdf", picture.convert_to_pdf()) as page:
                        document.insert_pdf(page)
            fd, temporary = tempfile.mkstemp(suffix=".pdf", dir=cache_dir)
            os.close(fd)
            document.save(temporary, deflate=True)
        os.replace(temporary, output)
        return output
    except ComicError:
        raise
    except Exception as exc:
        raise ComicError("No se pudo convertir el cómic: archivo dañado, cifrado o imagen incompatible.") from exc
    finally:
        if archive:
            archive.close()
        if temporary and os.path.exists(temporary):
            os.unlink(temporary)


def comic_cover(path, cache_dir):
    pdf = comic_pdf(path, cache_dir)
    cover = pdf[:-4] + ".png"
    if not os.path.isfile(cover):
        import fitz
        with fitz.open(pdf) as document:
            page = document[0]
            scale = 720 / max(page.rect.width, page.rect.height)
            data = page.get_pixmap(matrix=fitz.Matrix(scale, scale), alpha=False).tobytes("png")
        fd, temporary = tempfile.mkstemp(suffix=".png", dir=cache_dir)
        try:
            with os.fdopen(fd, "wb") as handle:
                handle.write(data)
            os.replace(temporary, cover)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
    return cover
