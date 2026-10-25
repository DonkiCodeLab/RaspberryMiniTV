"""Isolated smoke-test API. Never reads or modifies the real MiniTV library.

Run from the repository root. Debug builds accept MINITV_UI_TEST_SERVER pointing
at this loopback server; that hook is absent from Release builds.
"""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
import json
import subprocess
import tempfile
import urllib.parse

ROOT = Path(__file__).resolve().parents[1]
PIN = 'tvos-fixture'
STATE = {'marks': {}, 'progress': {}}
MOVIES = [{'id': f'MOVIE{i}', 'file': f'Película {i:02}.mp4', 'relativePath': f'Movies/movie{i}.mp4'} for i in range(1, 7)]
CATALOG = {'movieRootFiles': MOVIES, 'movieDirectories': [], 'rootFiles': [],
           'directories': [{'name': 'Serie de prueba', 'relativePath': 'TVShows/Test', 'videos': [
               {'id': 'S01E01', 'file': 'Un nuevo comienzo.mp4', 'relativePath': 'TVShows/Test/S01E01.mp4', 'seasonNumber': 1, 'episodeNumber': 1},
               {'id': 'S01E02', 'file': 'De vuelta a casa.mp4', 'relativePath': 'TVShows/Test/S01E02.mp4', 'seasonNumber': 1, 'episodeNumber': 2}]}],
           'books': [{'name': 'Un libro de prueba', 'relativePath': 'Books/test.epub', 'format': 'epub', 'author': 'MiniTV', 'description': 'Libro de prueba para el mando.'}],
           'games': [{'name': 'Juego de prueba', 'relativePath': 'Games/test.gba', 'platformName': 'Game Boy Advance'}],
           'mediaLibrary': {'movies': {m['relativePath']: {'name': f'Película {i:02}', 'heroImage': '/fixture.png', 'description': 'Vídeo generado para comprobar el reproductor de Apple TV.'} for i, m in enumerate(MOVIES, 1)}}}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass  # Stream URLs contain the test PIN; never write credentials to logs.

    def reply(self, value, status=200):
        data = json.dumps(value, ensure_ascii=False).encode()
        self.send_response(status); self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(data))); self.end_headers(); self.wfile.write(data)

    def file(self, path, content_type):
        data = path.read_bytes()
        begin, end = 0, len(data) - 1
        if self.headers.get('Range', '').startswith('bytes='):
            parts = self.headers['Range'][6:].split('-', 1)
            begin = int(parts[0] or 0); end = min(int(parts[1] or end), end)
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {begin}-{end}/{len(data)}')
        else:
            self.send_response(200)
        self.send_header('Content-Type', content_type); self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Content-Length', str(end - begin + 1)); self.end_headers()
        self.wfile.write(data[begin:end + 1])

    def do_GET(self):
        url = urllib.parse.urlsplit(self.path)
        query = urllib.parse.parse_qs(url.query)
        if self.headers.get('X-Web-Pin') != PIN and query.get('pin') != [PIN]:
            return self.reply({'error': 'Unauthorized'}, 401)
        if url.path == '/videos': return self.reply(CATALOG)
        if url.path == '/users': return self.reply({'users': [{'id': 'default', 'name': 'Invitado', 'avatar': 'avatar-01'}]})
        if url.path == '/users/default/state': return self.reply(STATE)
        if url.path == '/tmdb/library': return self.reply({})
        if url.path in {'/fixture.png', '/pictures/content'}: return self.file(ROOT / 'icon-preview.png', 'image/png')
        if url.path == '/pictures/library': return self.reply({'photos': [{'id': str(i), 'name': f'Foto {i}', 'relativePath': f'{i}.jpg', 'folderIds': ['album']} for i in range(1, 4)], 'folders': [{'id': 'album', 'name': 'Álbum de prueba'}], 'people': []})
        if url.path == '/media/stream':
            if query.get('subtitles') == ['list']: return self.reply({'tracks': []})
            return self.file(self.server.video, 'video/mp4')
        if url.path == '/tv/books/text':
            page = int(query.get('page', ['1'])[0])
            return self.reply({'page': page, 'total': 3, 'section': 1, 'text': f'Página {page}\n\n' + 'MiniTV permite leer desde el sofá. Pulsa derecha para pasar de página. ' * 18})
        if url.path == '/health': return self.reply({'storage': {'freeGb': 128, 'percentUsed': 36}, 'running': False})
        if url.path == '/torrents': return self.reply({'jobs': [{'id': 'sample', 'name': 'Descarga de prueba', 'state': 'paused', 'progress': 40, 'rateBytes': 0}]})
        if url.path == '/settings/weather': return self.reply({'location': 'Madrid'})
        if url.path == '/settings/language': return self.reply({'language': 'es'})
        if url.path == '/settings/alarms': return self.reply({'alarms': [{'id': i, 'time': '07:30', 'enabled': False, 'sound': ''} for i in range(1, 4)]})
        return self.reply({'error': 'Fixture endpoint missing'}, 404)

    def do_POST(self):
        self.mutate()

    def do_PATCH(self):
        self.mutate()

    def mutate(self):
        data = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or '{}')
        if self.path == '/web/auth': return self.reply({'ok': data.get('pin') == PIN}, 200 if data.get('pin') == PIN else 401)
        if self.headers.get('X-Web-Pin') != PIN: return self.reply({'error': 'Unauthorized'}, 401)
        if self.path == '/media/playback': return self.reply({'id': 'fixture', 'state': 'ready', 'converted': False})
        if self.path == '/users/default/state':
            for key, value in data.items(): STATE.setdefault(key, {}).update(value)
        return self.reply({'ok': True})


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='minitv-tvos-fixture-') as directory:
        video = Path(directory) / 'sample.mp4'
        subprocess.run(['ffmpeg', '-nostdin', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=960x540:rate=24',
                        '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=44100', '-t', '30', '-c:v', 'libx264',
                        '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart', str(video)], check=True)
        server = ThreadingHTTPServer(('127.0.0.1', 5097), Handler)
        server.video = video
        print('Isolated tvOS fixture server listening on 127.0.0.1:5097', flush=True)
        server.serve_forever()
