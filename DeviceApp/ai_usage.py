"""Persistent, metadata-only API metering and separately reconciled OpenAI costs."""
from contextlib import contextmanager
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

PRICING_DATE = '2026-10-21'
PRICING_URL = 'https://developers.openai.com/api/docs/pricing'
# USD per million tokens, Standard processing. Store the applied rates on each row.
# Unknown models/tiers or unsupported billing details deliberately have no estimate.
TEXT_RATES = {
    'gpt-6.1-sol': (2, .1, 10), 'gpt-6-luna': (.1, .01, .5),
    'gpt-6-astra': (10, 1, 50), 'chat-latest': (5, .5, 30),
    'gpt-4.1-mini': (.4, .1, 1.6),
}
IMAGE_RATES = {'gpt-image-2': (5, 8, 30),
               'gpt-image-2.5-sunburst': (5, 8, 30), 'gpt-image-2.5-flare': (5, 8, 30)}
OPERATIONS = ('search', 'recommendation', 'subtitle', 'image', 'connection_test')
PERIODS = {'day': '%Y-%m-%d', 'week': None, 'month': '%Y-%m', 'year': '%Y'}


class UsageError(ValueError):
    def __init__(self, code, status=400):
        super().__init__(code)
        self.code, self.status = code, status


def counter(value):
    return value if type(value) is int and 0 <= value <= 10**12 else None


def clean_usage(value):
    if not isinstance(value, dict):
        return {}
    result = {key: counter(value.get(key)) for key in ('input_tokens', 'output_tokens', 'total_tokens')}
    for key in ('input_tokens_details', 'output_tokens_details'):
        detail = value.get(key)
        if isinstance(detail, dict):
            result[key] = {name: counter(detail[name]) for name in (
                'cached_tokens', 'text_tokens', 'image_tokens', 'audio_tokens', 'reasoning_tokens',
                'cache_write_tokens', 'cache_creation_tokens') if name in detail}
    return result


def estimate(model, usage, endpoint, tier='default'):
    """Return integer nano-USD; absent usage never means free, and reasoning is not added twice."""
    incoming, outgoing = usage.get('input_tokens'), usage.get('output_tokens')
    if incoming is None or outgoing is None:
        return None, None, 'missing_usage'
    if tier not in (None, 'default', 'standard'):
        return None, None, 'unknown_tariff'
    base = re.sub(r'-\d{4}-\d{2}-\d{2}$', '', model)
    details = usage.get('input_tokens_details', {})
    if any(details.get(key) for key in ('cache_write_tokens', 'cache_creation_tokens', 'audio_tokens')):
        return None, None, 'unknown_tariff'
    if endpoint == 'images/edits':
        rates = IMAGE_RATES.get(base)
        text_tokens, image_tokens = details.get('text_tokens'), details.get('image_tokens')
        if not rates:
            return None, None, 'unknown_tariff'
        if text_tokens is None or image_tokens is None or text_tokens + image_tokens != incoming:
            return None, None, 'missing_usage'
        # The direct Images API does not receive cached-input discounts.
        counts = (text_tokens, image_tokens, outgoing)
        names = ('textInput', 'imageInput', 'output')
    else:
        rates = TEXT_RATES.get(base)
        cached = details.get('cached_tokens', 0)
        if not rates or (base.startswith('gpt-6') and incoming > 272000):
            return None, None, 'unknown_tariff'
        if cached is None or cached > incoming:
            return None, None, 'missing_usage'
        counts, names = (incoming - cached, cached, outgoing), ('input', 'cachedInput', 'output')
    total = sum(Decimal(str(rate)) * count * 1000 for rate, count in zip(rates, counts))
    tariff = {'asOf': PRICING_DATE, 'source': PRICING_URL, 'usdPerMillion': dict(zip(names, rates))}
    return int(total.quantize(Decimal('1'), rounding=ROUND_HALF_UP)), tariff, 'estimated'


def date_range(start, end):
    try:
        if any(not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}', value) for value in (start, end)):
            raise ValueError()
        first, last = date.fromisoformat(start), date.fromisoformat(end)
        if first > last or (last - first).days > 3660:
            raise ValueError()
        finish = last + timedelta(days=1)
        return (int(datetime.combine(first, datetime.min.time(), timezone.utc).timestamp()),
                int(datetime.combine(finish, datetime.min.time(), timezone.utc).timestamp()))
    except (ValueError, TypeError, OverflowError):
        raise UsageError('AI_USAGE_RANGE') from None


def bucket(day, period):
    value = date.fromisoformat(day)
    if period == 'week':
        return (value - timedelta(days=value.weekday())).isoformat()
    return value.strftime(PERIODS[period])


class UsageStore:
    def __init__(self, path):
        self.path = Path(path)

    @contextmanager
    def db(self):
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.path, os.O_CREAT | os.O_RDWR, 0o600)
        os.close(fd)
        os.chmod(self.path, 0o600)
        db = sqlite3.connect(self.path, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            db.execute('PRAGMA secure_delete=ON')
            db.executescript('''
                CREATE TABLE IF NOT EXISTS calls (
                  id TEXT PRIMARY KEY, started REAL NOT NULL, finished REAL,
                  operation TEXT NOT NULL, model TEXT NOT NULL, endpoint TEXT NOT NULL,
                  group_id TEXT, status TEXT NOT NULL, http_status INTEGER, request_id TEXT,
                  duration_ms INTEGER, usage TEXT, cost_nano INTEGER, tariff TEXT, cost_status TEXT NOT NULL);
                CREATE INDEX IF NOT EXISTS calls_time ON calls(started);
                CREATE TABLE IF NOT EXISTS billing_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS reported_costs (
                  scope TEXT NOT NULL, day TEXT NOT NULL, cost_nano INTEGER NOT NULL, synced REAL NOT NULL,
                  PRIMARY KEY(scope,day));
            ''')
            with db:
                yield db
        finally:
            db.close()

    def begin(self, operation, model, endpoint, group_id=None):
        ident = uuid.uuid4().hex
        with self.db() as db:
            db.execute('INSERT INTO calls(id,started,operation,model,endpoint,group_id,status,cost_status) VALUES(?,?,?,?,?,?,?,?)',
                       (ident, time.time(), operation, model, endpoint, group_id, 'pending', 'missing_usage'))
        return ident

    def finish(self, ident, payload, http_status, request_id, duration_ms, failed=False):
        payload = payload if isinstance(payload, dict) else {}
        usage = clean_usage(payload.get('usage'))
        with self.db() as db:
            row = db.execute('SELECT * FROM calls WHERE id=?', (ident,)).fetchone()
            model = payload.get('model')
            if not isinstance(model, str) or not re.fullmatch(r'[A-Za-z0-9_.:-]{1,100}', model):
                model = row['model']
            cost, tariff, cost_status = estimate(model, usage, row['endpoint'], payload.get('service_tier', 'default'))
            status = 'completed'
            if payload.get('error') or payload.get('status', 'completed') != 'completed' or (http_status and http_status >= 400):
                status = 'failed'
            elif failed and not payload:
                # Headers alone do not confirm the result of a timed-out request.
                status = 'unknown'
            db.execute('''UPDATE calls SET finished=?,model=?,status=?,http_status=?,request_id=?,duration_ms=?,
                          usage=?,cost_nano=?,tariff=?,cost_status=? WHERE id=?''',
                       (time.time(), model, status, http_status, request_id, duration_ms,
                        json.dumps(usage), cost, json.dumps(tariff), cost_status, ident))

    @staticmethod
    def _settings(db):
        row = db.execute('SELECT data FROM billing_settings WHERE id=1').fetchone()
        return json.loads(row[0]) if row else {'adminKey': '', 'projectId': '', 'apiKeyId': ''}

    @staticmethod
    def _scope(settings):
        return settings.get('projectId', '') + ':' + settings.get('apiKeyId', '')

    def billing(self):
        with self.db() as db:
            config = self._settings(db)
            last = db.execute('SELECT MAX(synced) FROM reported_costs WHERE scope=?', (self._scope(config),)).fetchone()[0]
        return {'configured': bool(config['adminKey']), 'projectId': config['projectId'],
                'apiKeyId': config['apiKeyId'], 'lastSync': last}

    def configure(self, changes):
        if not isinstance(changes, dict) or set(changes) - {'adminKey', 'projectId', 'apiKeyId', 'clearAdminKey'}:
            raise UsageError('AI_USAGE_SETTINGS')
        if 'clearAdminKey' in changes and type(changes['clearAdminKey']) is not bool:
            raise UsageError('AI_USAGE_SETTINGS')
        for key in ('adminKey', 'projectId', 'apiKeyId'):
            if key in changes:
                value = changes[key]
                if not isinstance(value, str) or len(value) > 512 or not value.isascii() or any(ord(c) < 32 for c in value):
                    raise UsageError('AI_USAGE_SETTINGS')
                if key != 'adminKey' and value and (value.startswith('sk-') or not re.fullmatch(r'[A-Za-z0-9_-]{1,200}', value)):
                    raise UsageError('AI_USAGE_SETTINGS')
        with self.db() as db:
            config = self._settings(db)
            for key in ('projectId', 'apiKeyId'):
                if key in changes:
                    config[key] = changes[key]
            if changes.get('adminKey', '').strip():
                config['adminKey'] = changes['adminKey'].strip()
            if changes.get('clearAdminKey'):
                config['adminKey'] = ''
            db.execute('INSERT OR REPLACE INTO billing_settings VALUES(1,?)', (json.dumps(config),))
        return self.billing()

    def snapshot(self, start, end, period='day', operation='', model='', page=0, group_id=''):
        first, finish = date_range(start, end)
        if period not in PERIODS or operation and operation not in OPERATIONS:
            raise UsageError('AI_USAGE_FILTER')
        if not isinstance(model, str) or len(model) > 100 or len(group_id) > 100 or type(page) is not int or not 0 <= page <= 100000:
            raise UsageError('AI_USAGE_FILTER')
        where, params = 'started>=? AND started<?', [first, finish]
        for field, value in (('operation', operation), ('model', model), ('group_id', group_id)):
            if value:
                where += ' AND ' + field + '=?'
                params.append(value)
        with self.db() as db:
            rows = db.execute('SELECT * FROM calls WHERE ' + where + ' ORDER BY started DESC,id DESC LIMIT 50 OFFSET ?',
                              (*params, page * 50)).fetchall()
            daily = db.execute('''SELECT strftime('%Y-%m-%d',started,'unixepoch') AS day,operation,
                COUNT(*) AS calls,SUM(cost_nano) AS cost, SUM(cost_nano IS NULL) AS unknown,
                SUM(COALESCE(json_extract(usage,'$.input_tokens'),0)) AS input,
                SUM(COALESCE(json_extract(usage,'$.output_tokens'),0)) AS output,
                SUM(usage IS NULL OR json_extract(usage,'$.input_tokens') IS NULL OR
                    json_extract(usage,'$.output_tokens') IS NULL) AS missing_tokens
                FROM calls WHERE ''' + where + ' GROUP BY day,operation', params).fetchall()
            config = self._settings(db)
            reported = db.execute('SELECT * FROM reported_costs WHERE scope=? AND day>=? AND day<=? ORDER BY day',
                                  (self._scope(config), start, end)).fetchall()
            models = [row[0] for row in db.execute('SELECT DISTINCT model FROM calls ORDER BY model')]
            since = db.execute('SELECT MIN(started) FROM calls').fetchone()[0]
        points, breakdown = {}, {}
        day = date.fromisoformat(start)
        while day <= date.fromisoformat(end):
            key = bucket(day.isoformat(), period)
            points.setdefault(key, {'date': key, 'calls': 0, 'costNano': 0, 'unknown': 0, 'tokens': 0,
                                    'missingTokens': 0, 'reportedNano': 0, 'reportedDays': 0, 'days': 0})['days'] += 1
            day += timedelta(days=1)
        totals = {'calls': 0, 'costNano': 0, 'unknown': 0, 'tokens': 0, 'missingTokens': 0}
        for row in daily:
            values = {'calls': row['calls'], 'costNano': row['cost'] or 0, 'unknown': row['unknown'],
                      'tokens': row['input'] + row['output'], 'missingTokens': row['missing_tokens']}
            part = breakdown.setdefault(row['operation'], {'operation': row['operation'], **dict.fromkeys(values, 0)})
            for key, value in values.items():
                totals[key] += value
                part[key] += value
                points[bucket(row['day'], period)][key] += value
        for row in reported:
            point = points[bucket(row['day'], period)]
            point['reportedNano'] += row['cost_nano']
            point['reportedDays'] += 1
        def money(item):
            item['estimatedUsd'] = item.pop('costNano') / 1e9
            if 'reportedNano' in item:
                item['reportedUsd'] = item.pop('reportedNano') / 1e9 if item['reportedDays'] else None
            return item
        calls = []
        for row in rows:
            item = dict(row)
            item['usage'] = json.loads(item['usage']) if item['usage'] else {}
            item['tariff'] = json.loads(item['tariff']) if item['tariff'] else None
            cost = item.pop('cost_nano')
            item['estimatedUsd'] = cost / 1e9 if cost is not None else None
            # A persisted in-flight call after a crash remains unconfirmed, never free.
            if item['status'] == 'pending' and time.time() - item['started'] > 600:
                item['status'] = 'unknown'
            calls.append(item)
        return {'currency': 'USD', 'timezone': 'UTC', 'since': since, 'pricingDate': PRICING_DATE,
                'summary': money(totals), 'series': [money(item) for item in points.values()],
                'breakdown': [money(item) for item in breakdown.values()], 'calls': calls, 'models': models,
                'page': page, 'hasMore': (page + 1) * 50 < totals['calls'], 'billing': self.billing(),
                'reported': {'usd': sum(row['cost_nano'] for row in reported) / 1e9 if reported else None,
                             'days': len(reported), 'totalDays': (finish - first) // 86400,
                             'filtered': False}}

    def sync(self, start, end):
        first, finish = date_range(start, end)
        if finish - first > 366 * 86400:
            raise UsageError('AI_USAGE_SYNC_RANGE')
        with self.db() as db:
            config = self._settings(db)
        if not config['adminKey'] or not config['projectId']:
            raise UsageError('AI_USAGE_ADMIN_REQUIRED')
        params = {'start_time': first, 'end_time': finish, 'bucket_width': '1d', 'limit': 180,
                  'project_ids': [config['projectId']]}
        if config['apiKeyId']:
            params['api_key_ids'] = [config['apiKeyId']]
        days, seen, deadline = {}, set(), time.monotonic() + 45
        try:
            while True:
                if time.monotonic() >= deadline or len(seen) > 20:
                    raise UsageError('AI_USAGE_SYNC_FAILED', 502)
                url = 'https://api.openai.com/v1/organization/costs?' + urllib.parse.urlencode(params, doseq=True)
                req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + config['adminKey'], 'Accept': 'application/json'})
                with urllib.request.build_opener(NoRedirect).open(req, timeout=min(15, max(1, deadline - time.monotonic()))) as response:
                    raw = response.read(4 * 1024 * 1024 + 1)
                if len(raw) > 4 * 1024 * 1024:
                    raise ValueError()
                payload = json.loads(raw)
                for item in payload['data']:
                    timestamp = item['start_time']
                    if (type(timestamp) is not int or timestamp % 86400 or not first <= timestamp < finish
                            or item.get('end_time') != timestamp + 86400):
                        raise ValueError()
                    amount = Decimal('0')
                    for result in item['results']:
                        if result['amount']['currency'].lower() != 'usd':
                            raise ValueError()
                        value = Decimal(str(result['amount']['value']))
                        if not value.is_finite() or abs(value) > Decimal('1000000000'):
                            raise ValueError()
                        amount += value
                    if abs(amount) > Decimal('1000000000'):
                        raise ValueError()
                    day = datetime.fromtimestamp(timestamp, timezone.utc).date().isoformat()
                    if day in days:
                        raise ValueError()
                    days[day] = int((amount * 10**9).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
                if not payload.get('has_more'):
                    break
                cursor = payload.get('next_page')
                if not isinstance(cursor, str) or not cursor or cursor in seen:
                    raise ValueError()
                seen.add(cursor)
                params['page'] = cursor
        except urllib.error.HTTPError as error:
            raise UsageError('AI_USAGE_ADMIN_AUTH' if error.code in (401, 403) else 'AI_USAGE_SYNC_FAILED', 502) from None
        except (OSError, ValueError, TypeError, KeyError, InvalidOperation):
            raise UsageError('AI_USAGE_SYNC_FAILED', 502) from None
        # Commit only after every page succeeds. Repeated imports replace, never add.
        with self.db() as db:
            if self._settings(db) != config:
                raise UsageError('AI_USAGE_SETTINGS_CHANGED', 409)
            scope = self._scope(config)
            db.execute('DELETE FROM reported_costs WHERE scope=? AND day>=? AND day<=?', (scope, start, end))
            db.executemany('INSERT INTO reported_costs VALUES(?,?,?,?)',
                           [(scope, day, value, time.time()) for day, value in days.items()])
        return {'days': len(days), 'billing': self.billing()}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class Meter:
    def __init__(self):
        self.payload, self.http_status, self.request_id = None, None, None

    def response(self, status, headers):
        self.http_status = status if type(status) is int else None
        value = headers.get('x-request-id') if headers else None
        self.request_id = value if isinstance(value, str) and re.fullmatch(r'[A-Za-z0-9_-]{1,200}', value) else None


@contextmanager
def track_call(data, model, operation, endpoint):
    meter, started = Meter(), time.monotonic()
    store = UsageStore(data['_usage_path']) if data.get('_usage_path') else None
    try:
        ident = store.begin(operation, model, endpoint, data.get('_usage_group')) if store else None
    except (OSError, sqlite3.Error):
        from catalog_ai import AIError
        raise AIError('No se puede registrar el consumo. Revisa el almacenamiento.', 'AI_USAGE_STORAGE', 503) from None
    failed = False
    try:
        yield meter
    except Exception:
        failed = True
        raise
    finally:
        if store:
            try:
                store.finish(ident, meter.payload, meter.http_status, meter.request_id,
                             round((time.monotonic() - started) * 1000), failed)
            except (OSError, sqlite3.Error):
                # Preserve the original result; the existing pending row flags missing accounting.
                logging.getLogger(__name__).error('Could not finalize AI usage record %s', ident)
