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

    def test_collection_type_updates_all_volumes_without_replacing_metadata(self):
        nested = self.root / "Books" / "The Boys" / "Extras"
        nested.mkdir()
        (nested / "02.pdf").write_bytes(b"book")
        (nested / "notes.txt").write_text("notes")
        key = "Books/The Boys/01.cbz"
        metadata = {"title": "Uno", "coverUrl": "/book-covers/custom.png", "localizedMetadata": {"es": {"description": "Texto"}}, "isGraphicNovel": False}
        api.persist_book_profile(key, metadata)
        api.persist_book_profile("Books/single.pdf", {"isGraphicNovel": False})
        for value in ("true", "false"):
            response = self.client.post("/books/collection/profile", data={"collection": "Books/The Boys", "name": "Colección", "isGraphicNovel": value})
            self.assertEqual(response.status_code, 200)
            profiles = api.load_media_library()["books"]
            self.assertEqual(profiles[key], {**metadata, "isGraphicNovel": value == "true"})
            self.assertEqual(profiles["Books/The Boys/Extras/02.pdf"]["isGraphicNovel"], value == "true")
            self.assertFalse(profiles["Books/single.pdf"]["isGraphicNovel"])
            self.assertNotIn("Books/The Boys/Extras/notes.txt", profiles)
            visible = {book["relativePath"]: book for book in api.list_book_entries()}
            self.assertEqual(visible[key]["isGraphicNovel"], value == "true")
        self.client.post("/books/collection/profile", data={"collection": "The Boys", "name": "Nuevo nombre"})
        self.assertEqual(api.load_media_library()["books"], profiles)

    def test_collection_author_persists_without_changing_volume_authors(self):
        key = "Books/The Boys/01.cbz"
        api.persist_book_profile(key, {"author": "Volume author"})
        response = self.client.post("/books/collection/profile", data={"collection": "The Boys", "author": "  Collection author  "})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json["item"]["author"], "Collection author")
        self.client.post("/books/collection/profile", data={"collection": "The Boys", "name": "Renamed"})
        library = api.load_media_library()
        self.assertEqual(library["bookCollections"]["The Boys"]["author"], "Collection author")
        self.assertEqual(library["books"][key]["author"], "Volume author")
        self.client.post("/books/collection/profile", data={"collection": "The Boys", "author": ""})
        self.assertEqual(api.load_media_library()["bookCollections"]["The Boys"]["author"], "")

    def test_collection_rejects_invalid_type_and_library_root(self):
        for data, status in (({"collection": "The Boys", "isGraphicNovel": "invalid"}, 400), ({"collection": "Books", "isGraphicNovel": "true"}, 404)):
            response = self.client.post("/books/collection/profile", data=data)
            self.assertEqual(response.status_code, status)
        self.assertFalse(api.load_media_library().get("books"))

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
