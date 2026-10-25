"""Short-lived QR pairing; phone credentials can only check and upload photos."""
import hashlib
import secrets
import threading
import time

from flask import Blueprint, jsonify, request
from photo_library import PhotoError

PAIR_SECONDS = 300
SESSION_SECONDS = 24 * 60 * 60
MOBILE_ROUTES = {('POST', '/pictures/import/check'), ('POST', '/pictures/upload'),
                 ('GET', '/pictures/mobile/session'), ('POST', '/pictures/mobile/disconnect')}


def digest(value):
    return hashlib.sha256(value.encode()).hexdigest()


class PhotoMobilePairings:
    def __init__(self, clock=time.time):
        self.clock = clock
        self.lock = threading.RLock()
        self.pairs = {}

    def _prune(self):
        now = self.clock()
        self.pairs = {key: value for key, value in self.pairs.items()
                      if value.get('sessionExpiresAt', value['expiresAt']) > now}

    def create(self, pin):
        with self.lock:
            self._prune()
            if len(self.pairs) >= 100:
                raise PhotoError('Hay demasiados enlaces activos. Desconecta algún móvil o espera a que caduquen.', 429)
            ident, code = secrets.token_urlsafe(18), secrets.token_urlsafe(32)
            self.pairs[ident] = {'id': ident, 'codeHash': digest(code), 'pinHash': digest(pin),
                                 'expiresAt': int(self.clock()) + PAIR_SECONDS}
            return {'id': ident, 'code': code, 'expiresAt': self.pairs[ident]['expiresAt']}

    def claim(self, code, client, name, pin):
        if (not isinstance(code, str) or len(code) != 43 or not isinstance(client, str)
                or not 16 <= len(client) <= 100 or not isinstance(name, str) or len(name) > 80):
            raise PhotoError('Código de enlace inválido.', 400)
        with self.lock:
            self._prune()
            pair = next((p for p in self.pairs.values() if secrets.compare_digest(p['codeHash'], digest(code))), None)
            if not pair or pair['expiresAt'] <= self.clock() or pair['pinHash'] != digest(pin):
                raise PhotoError('El QR ha caducado. Genera otro desde la web.', 401)
            if pair.get('client') and pair['client'] != client:
                raise PhotoError('Este QR ya se ha utilizado. Genera otro desde la web.', 409)
            if not pair.get('token'):
                pair.update(client=client, name=name.strip() or 'Móvil', token=secrets.token_urlsafe(32),
                            sessionExpiresAt=int(self.clock()) + SESSION_SECONDS)
            # Retrying a lost claim response from the same installation is safe.
            return {'token': pair['token'], 'expiresAt': pair['sessionExpiresAt'], 'name': 'MiniTV'}

    def authorized(self, token, pin, method, path):
        if (method, path) not in MOBILE_ROUTES or not token or len(token) > 100:
            return False
        with self.lock:
            self._prune()
            return any(p.get('token') and secrets.compare_digest(p['token'], token)
                       and p['pinHash'] == digest(pin) for p in self.pairs.values())

    def status(self, ident, pin):
        with self.lock:
            self._prune()
            pair = self.pairs.get(ident)
            if not pair or pair['pinHash'] != digest(pin):
                return {'state': 'expired'}
            return {'state': 'connected' if pair.get('token') else 'waiting',
                    'deviceName': pair.get('name', ''), 'expiresAt': pair['expiresAt']}

    def revoke(self, ident=None, token=None):
        with self.lock:
            for key, pair in list(self.pairs.items()):
                if key == ident or (token and pair.get('token') == token):
                    del self.pairs[key]


def mobile_token():
    value = request.headers.get('Authorization', '')
    return value[7:] if value.startswith('Bearer ') else ''


def create_mobile_blueprint(store, get_pin, get_address):
    bp = Blueprint('photo_mobile', __name__)

    @bp.after_request
    def private(response):
        response.headers['Cache-Control'] = 'no-store'
        return response

    @bp.errorhandler(PhotoError)
    def invalid(error):
        return jsonify({'error': str(error)}), error.status

    def body():
        if request.content_length is None or request.content_length > 4096:
            raise PhotoError('Solicitud demasiado grande.', 413)
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise PhotoError('Solicitud inválida.')
        return value

    @bp.post('/pictures/mobile/pairing')
    def create():
        result = store.create(get_pin())
        return jsonify({**result, 'localAddress': get_address()}), 201

    @bp.get('/pictures/mobile/pairing/<ident>')
    def status(ident):
        return jsonify(store.status(ident, get_pin()))

    @bp.post('/pictures/mobile/revoke')
    def revoke():
        ident = body().get('id')
        if not isinstance(ident, str): raise PhotoError('Enlace inválido.')
        store.revoke(ident=ident)
        return jsonify({'ok': True})

    @bp.post('/pictures/mobile/claim')
    def claim():
        data = body()
        return jsonify(store.claim(data.get('code'), data.get('clientId'), data.get('deviceName', 'iPhone'), get_pin()))

    @bp.get('/pictures/mobile/session')
    def session():
        return jsonify({'ok': True, 'name': 'MiniTV', 'maxFileBytes': 50 * 1024 * 1024})

    @bp.post('/pictures/mobile/disconnect')
    def disconnect():
        store.revoke(token=mobile_token())
        return jsonify({'ok': True})

    return bp
