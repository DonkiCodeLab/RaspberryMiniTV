"""Local, synthetic API for browser checks. Never connects to a real MiniTV."""
import sys
from pathlib import Path
from flask import Flask, jsonify, request, send_file, Response

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'DeviceApp'))
from tv_access import register_tv_access

app = Flask(__name__)
register_tv_access(app)
state = {'marks': {}, 'progress': {}}


@app.post('/fixture/reset')
def reset():
    state['marks'].clear()
    state['progress'].clear()
    return jsonify(ok=True)


@app.before_request
def pin():
    if request.path == '/web/auth':
        return None
    if (request.headers.get('X-Web-Pin') or request.args.get('pin')) != '9999':
        return jsonify(error='Unauthorized'), 401


@app.post('/web/auth')
def auth():
    return (jsonify(ok=True) if request.json.get('pin') == '9999' else (jsonify(error='Invalid PIN'), 401))


@app.get('/videos')
def videos():
    return jsonify(directories=[{'relativePath': 'TVShows/test', 'name': 'Serie de prueba', 'videos': [
        {'relativePath': 'TVShows/test/S01E01.mp4', 'file': 'S01E01.mp4', 'seasonNumber': 1, 'episodeNumber': 1},
        {'relativePath': 'TVShows/test/S01E02.mp4', 'file': 'S01E02.mp4', 'seasonNumber': 1, 'episodeNumber': 2}]}],
        movieRootFiles=[{'relativePath': 'Movies/hello.mp4', 'name': 'Película de prueba'}], mediaLibrary={})


@app.get('/users')
def users():
    return jsonify(users=[{'id': 'default', 'name': 'Casa', 'avatar': 'avatar-01'}])


@app.route('/users/default/state', methods=['GET', 'PATCH'])
def profile():
    if request.method == 'PATCH':
        for category, values in request.json.items():
            state[category].update(values)
        return jsonify(ok=True)
    return jsonify(state)


@app.get('/tmdb/library')
def metadata():
    return jsonify(movies={}, series={})


@app.route('/media/playback', methods=['POST', 'GET'])
def playback():
    return jsonify(id='fixture-job', state='ready', converted=False)


@app.get('/media/stream')
def media():
    if request.args.get('subtitles') == 'list':
        return jsonify(tracks=[{'id': 'external:test.es.vtt', 'title': 'Castellano', 'language': 'es', 'available': True}])
    if request.args.get('subtitles'):
        return Response('WEBVTT\n\n00:00:00.000 --> 00:00:30.000\nMiniTV · Prueba de subtítulos\n', content_type='text/vtt')
    return send_file(ROOT / 'LGApp/src/assets/welcome.mp4', conditional=True, mimetype='video/mp4')


@app.get('/pictures/library')
def photos():
    return jsonify(photos=[{'id': 'p1', 'name': 'Foto de prueba', 'relativePath': 'Pictures/test.jpg'}], folders=[])


@app.get('/pictures/content')
def photo():
    return send_file(ROOT / 'LGApp/src/assets/demo-4x12.jpg', mimetype='image/jpeg')


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5059, debug=False)
