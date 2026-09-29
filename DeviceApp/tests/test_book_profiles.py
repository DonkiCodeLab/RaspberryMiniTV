import io
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import control_api as api


class BookProfileTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name, value in {
            "MULTIMEDIA_DIR": str(self.root),
            "MEDIA_LIBRARY_PATH": str(self.root / "media_library.json"),
            "LEGACY_MOVIE_LIBRARY_PATH": str(self.root / "movie_library.json"),
            "BOOKS_DIR": str(self.root / "Books"),
            "BOOK_COVERS_DIR": str(self.root / "BookCovers"),
        }.items():
            mocked = patch.object(api, name, value)
            mocked.start()
            self.addCleanup(mocked.stop)
        for name in ("ensure_media_directories", "is_authorized_request"):
            mocked = patch.object(api, name, return_value=True)
            mocked.start()
            self.addCleanup(mocked.stop)
        (self.root / "Books" / "The Boys").mkdir(parents=True)
        (self.root / "Books" / "The Boys" / "01.cbz").write_bytes(b"book")
        (self.root / "Books" / "single.pdf").write_bytes(b"book")
        self.client = api.app.test_client()

    def test_names_and_cover_replacements_persist_and_versioned_covers_can_be_deleted(self):
        for endpoint, identity, metadata_key, name_key in (
            ("/books/profile", {"relativePath": "Books/single.pdf"}, "books", "title"),
            ("/books/collection/profile", {"collection": "The Boys"}, "bookCollections", "name"),
        ):
            with self.subTest(endpoint=endpoint):
                urls = []
                for version in (1, 2):
                    response = self.client.post(endpoint, data={
                        **identity, name_key: f"Nombre {version}",
                        "coverFile": (io.BytesIO(f"image-{version}".encode()), "cover.png"),
                    })
                    self.assertEqual(response.status_code, 200)
                    url = response.json["item"]["coverUrl"]
                    urls.append(url)
                    with self.client.get(url) as cover_response:
                        self.assertEqual(cover_response.data, f"image-{version}".encode())
                self.assertNotEqual(urls[0], urls[1])
                saved = api.load_media_library()[metadata_key][next(iter(identity.values()))]
                self.assertEqual(saved[name_key], "Nombre 2")
                self.assertEqual(saved["coverUrl"], urls[1])
                response = self.client.post(endpoint, data={**identity, name_key: "Otro nombre", "coverUrl": urls[1]})
                self.assertEqual(response.json["item"]["coverUrl"], urls[1])
                cover_file = self.root / "BookCovers" / Path(urlsplit(urls[1]).path).name
                self.assertTrue(cover_file.exists())
                delete_endpoint = "/books" if metadata_key == "books" else "/books/collection"
                self.assertEqual(self.client.delete(delete_endpoint, query_string=identity).status_code, 200)
                self.assertFalse(cover_file.exists())


if __name__ == "__main__":
    unittest.main()
