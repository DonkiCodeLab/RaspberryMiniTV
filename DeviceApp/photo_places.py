"""On-demand Photon reverse geocoding, separate from photo catalogue transactions."""
from contextlib import closing
import json
import math
import os
import re
import sqlite3
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


DEFAULT_ENDPOINT = 'https://photon.komoot.io'
DAY = 86400


def coordinates(data):
    values = [data.get(key) for key in ('latitude', 'longitude')]
    if any(isinstance(value, bool) or not isinstance(value, (int, float)) or
           abs(value) > bound or not math.isfinite(value) for value, bound in zip(values, (90, 180))):
        raise ValueError('Selecciona una ubicación válida.')
    # About 11 m precision; only these coordinates are sent to the provider.
    return tuple(0.0 if abs(value) < .00005 else round(value, 4) for value in values)


def place_from_photon(data):
    if not isinstance(data, dict) or not isinstance(data.get('features'), list):
        raise ValueError('Invalid Photon response')
    if not data['features']:
        return {'status': 'not_found'}
    feature = data['features'][0]
    props = feature.get('properties') if isinstance(feature, dict) else None
    if not isinstance(props, dict):
        raise ValueError('Invalid Photon feature')

    def label(key):
        value = props.get(key)
        return value.strip()[:160] if isinstance(value, str) else ''

    city = label('city') or label('town') or label('village')
    if not city and (props.get('type') == 'city' or props.get('osm_key') == 'place' and
                     props.get('osm_value') in ('city', 'town', 'village', 'hamlet', 'municipality')):
        city = label('name')
    country, code = label('country'), label('countrycode').upper()
    code = code if re.fullmatch('[A-Z]{2}', code) else ''
    return {'status': 'found', 'city': city, 'country': country, 'countryCode': code} if city or country or code else {'status': 'not_found'}


class PhotoPlaces:
    def __init__(self, cache, clock=time.time):
        self.path = cache / 'places.sqlite3'
        self.clock = clock
        self.lock = threading.Lock()
        self.next_request = 0

    def _fetch(self, endpoint, latitude, longitude):
        query = urllib.parse.urlencode({'lat': f'{latitude:.4f}', 'lon': f'{longitude:.4f}', 'limit': 1})
        request = urllib.request.Request(f'{endpoint}/reverse?{query}', headers={
            'User-Agent': 'RaspberryMiniTV/1.0 (photo locations; https://github.com/DonkiCodeLab/RaspberryMiniTV)',
            'Accept': 'application/json',
        })
        with urllib.request.urlopen(request, timeout=5) as response:
            raw = response.read(262145)
        if len(raw) > 262144:
            raise ValueError('Photon response too large')
        return place_from_photon(json.loads(raw))

    def resolve(self, data):
        latitude, longitude = coordinates(data)
        endpoint = os.environ.get('MINITV_PHOTON_URL', DEFAULT_ENDPOINT).strip().rstrip('/')
        if endpoint.lower() in ('', 'off', 'disabled'):
            return {'status': 'disabled'}
        url = urllib.parse.urlsplit(endpoint)
        if url.scheme not in ('http', 'https') or not url.netloc or url.query or url.fragment:
            return {'status': 'unavailable'}
        key = json.dumps([endpoint, latitude, longitude])
        now = self.clock()
        with closing(sqlite3.connect(self.path)) as db, db:
            db.execute('CREATE TABLE IF NOT EXISTS places (key TEXT PRIMARY KEY, data TEXT NOT NULL, expires REAL NOT NULL)')
            row = db.execute('SELECT data FROM places WHERE key=? AND expires>?', (key, now)).fetchone()
        if row:
            return json.loads(row[0])
        # Never queue a batch behind a slow provider, or hold the catalogue lock.
        if not self.lock.acquire(blocking=False):
            return {'status': 'busy', 'retryAfter': 1.1}
        try:
            if now < self.next_request:
                return {'status': 'busy', 'retryAfter': round(self.next_request - now, 1) + .1}
            self.next_request = now + 1.1
            try:
                result = self._fetch(endpoint, latitude, longitude)
            except (OSError, ValueError) as error:
                delay = 60
                if isinstance(error, urllib.error.HTTPError) and error.code == 429:
                    retry = error.headers.get('Retry-After', '') if error.headers else ''
                    delay = max(60, min(DAY, int(retry))) if retry.isdigit() else 300
                self.next_request = self.clock() + delay
                return {'status': 'unavailable', 'retryAfter': delay}
            with closing(sqlite3.connect(self.path)) as db, db:
                db.execute('DELETE FROM places WHERE expires<=?', (now,))
                db.execute('INSERT OR REPLACE INTO places VALUES (?,?,?)',
                           (key, json.dumps(result), now + (30 * DAY if result['status'] == 'found' else DAY)))
            return result
        finally:
            self.lock.release()
