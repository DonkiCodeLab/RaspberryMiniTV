import binascii
import ast
import io
import os
import subprocess
import sys
import tempfile
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch, Mock

import fitz
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import comic_reader as comic
import control_api as api


class ComicTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.path = self.root / "sample.cbr"
        self.cache = str(self.root / "cache")

    def image(self, color):
        stream = io.BytesIO()
        Image.new("RGB", (40, 60), color).save(stream, format="PNG")
        return stream.getvalue()

    def write_zip(self):
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("page10.png", self.image("blue"))
            archive.writestr("page2.png", self.image("red"))
            archive.writestr("__MACOSX/._page1.png", b"ignored")

    def test_zip_disguised_as_cbr_natural_order_cover_and_cache(self):
        self.write_zip()
        output = comic.comic_pdf(str(self.path), self.cache)
        with fitz.open(output) as doc:
            self.assertEqual(len(doc), 2)
            self.assertEqual(doc[0].get_pixmap().pixel(0, 0), (255, 0, 0))
        with Image.open(comic.comic_cover(str(self.path), self.cache)) as cover:
            self.assertEqual(cover.getpixel((0, 0)), (255, 0, 0))
        with patch.object(zipfile, "ZipFile", side_effect=AssertionError("cache miss")):
            self.assertEqual(comic.comic_pdf(str(self.path), self.cache), output)
        with zipfile.ZipFile(self.path, "a") as archive:
            archive.writestr("page20.png", self.image("green"))
        self.assertNotEqual(comic.comic_pdf(str(self.path), self.cache), output)

    def test_rar_image_pipeline_and_damaged_image_cleanup(self):
        self.path.write_bytes(b"Rar!")
        with patch.object(comic, "_rar", side_effect=[b"page1.png\n", self.image("red")]):
            with fitz.open(comic.comic_pdf(str(self.path), self.cache)) as doc:
                self.assertEqual(len(doc), 1)
        self.path.write_bytes(b"damaged")
        with patch.object(comic, "_rar", side_effect=[b"page1.png\n", b"bad"]):
            with self.assertRaises(comic.ComicError):
                comic.comic_pdf(str(self.path), self.cache)
        self.assertEqual(len(list(Path(self.cache).glob("*.pdf"))), 1)

    @unittest.skipUnless(comic.shutil.which("bsdtar"), "libarchive-tools required")
    def test_real_rar_extraction(self):
        # libarchive's test_read_format_rar.rar.uu fixture (BSD licensed):
        # https://github.com/libarchive/libarchive/blob/master/libarchive/test/test_read_format_rar.rar.uu
        lines = (Path(__file__).parent / "fixtures" / "reader.rar.uu").read_bytes().splitlines()
        self.path.write_bytes(b"".join(binascii.a2b_uu(line) for line in lines[1:-1]))
        self.assertIn(b"test.txt", comic._rar(str(self.path)))
        self.assertEqual(comic._rar(str(self.path), "test.txt"), b"test text document\r\n")

    def test_missing_rar_backend_and_empty_archive(self):
        with patch.object(comic.shutil, "which", return_value=None):
            with self.assertRaisesRegex(comic.ComicError, "libarchive-tools"):
                comic._rar(str(self.path))
        with zipfile.ZipFile(self.path, "w") as archive:
            archive.writestr("readme.txt", "no images")
        with self.assertRaisesRegex(comic.ComicError, "no contiene"):
            comic.comic_pdf(str(self.path), self.cache)

    def test_official_decoder_handles_archives_unsupported_by_libarchive(self):
        def run(command, **kwargs):
            if command[0] == "/usr/bin/bsdtar":
                raise subprocess.CalledProcessError(1, command, stderr=b"Prefix found")
            self.assertIn("-p-", command)
            self.assertIn("--", command)
            return Mock(stdout=b"page1.jpg\n" if command[1] == "lb" else b"image bytes")
        with patch.object(comic.shutil, "which", side_effect=lambda name: "/usr/bin/" + name), patch.object(comic.subprocess, "run", side_effect=run):
            self.assertEqual(comic._rar(str(self.path)), b"page1.jpg\n")
            self.assertEqual(comic._rar(str(self.path), "page1.jpg"), b"image bytes")

    def test_libarchive_failure_recommends_compatible_decoder(self):
        with patch.object(comic.shutil, "which", side_effect=lambda name: "/usr/bin/bsdtar" if name == "bsdtar" else None), patch.object(comic.subprocess, "run", side_effect=subprocess.CalledProcessError(1, "bsdtar", stderr=b"Prefix found")):
            with self.assertRaisesRegex(comic.ComicError, "install_comic_support.sh"):
                comic._rar(str(self.path), "page1.jpg")

    def test_raspberry_launches_converted_pdf_with_evince_and_keeps_original_identity(self):
        # Exercise the real menu method without requiring a pygame display.
        tree = ast.parse((Path(__file__).resolve().parents[1] / "menu_app.py").read_text())
        method = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "open_book_path")
        process = Mock()
        process.wait.side_effect = subprocess.TimeoutExpired("evince", .8)
        process.poll.return_value = None
        launcher = Mock(return_value=process)
        namespace = dict(os=os, sys=sys, shutil=comic.shutil, subprocess=subprocess,
                         MULTIMEDIA_DIR=str(self.root), DESKTOP_PREVIEW=False,
                         BOOK_DEBUG_LOG_PATH=str(self.root / "reader.log"),
                         append_debug_log=Mock(), log_debug=Mock())
        exec(compile(ast.Module(body=[method], type_ignores=[]), "menu_app.py", "exec"), namespace)
        reader = Mock()
        converted = str(self.root / "converted.pdf")
        with patch.object(comic, "comic_pdf", return_value=converted), patch.object(comic.shutil, "which", return_value="/usr/bin/evince"), patch.object(subprocess, "Popen", launcher), patch.dict(os.environ, {"WAYLAND_DISPLAY": "wayland-0"}):
            namespace["open_book_path"](reader, str(self.path))
        self.assertEqual(launcher.call_args.args[0], ["evince", converted])
        self.assertEqual(reader.book_current_path, str(self.path))
        self.assertEqual(reader.state, "book")

    def test_authenticated_content_cover_and_original_download(self):
        self.write_zip()
        with patch.object(api, "BOOKS_DIR", str(self.root)), patch.object(api, "BOOK_COVERS_DIR", self.cache), patch.object(api, "is_authorized_request", return_value=True):
            client = api.app.test_client()
            response = client.get("/books/content?relativePath=sample.cbr&render=pdf")
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.data.startswith(b"%PDF-"))
            response.close()
            response = client.get("/books/content?relativePath=sample.cbr")
            self.assertEqual(response.data, self.path.read_bytes())
            response.close()
            response = client.get("/books/cover?relativePath=sample.cbr")
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.mimetype, "image/png")
            response.close()
            self.path.write_bytes(b"broken")
            response = client.get("/books/content?relativePath=sample.cbr&render=pdf")
            self.assertEqual(response.status_code, 422)
            self.assertIn("error", response.json)
