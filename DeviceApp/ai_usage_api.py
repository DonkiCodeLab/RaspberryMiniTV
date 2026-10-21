"""Dashboard endpoints; protected by control_api's shared PIN gate."""
from datetime import datetime, timezone
import sqlite3
from flask import Blueprint, jsonify, request
from ai_usage import UsageError, UsageStore


def create_usage_blueprint(settings):
    blueprint = Blueprint('ai_usage', __name__)

    def store():
        return UsageStore(settings().path.with_suffix('.usage.sqlite3'))

    def reply(payload, status=200):
        result = jsonify(payload)
        result.status_code = status
        result.headers['Cache-Control'] = 'no-store'
        return result

    @blueprint.errorhandler(UsageError)
    def usage_error(error):
        return reply({'ok': False, 'code': error.code, 'error': error.code}, error.status)

    @blueprint.errorhandler(sqlite3.Error)
    @blueprint.errorhandler(OSError)
    def storage_error(error):
        return reply({'ok': False, 'code': 'AI_USAGE_STORAGE', 'error': 'AI_USAGE_STORAGE'}, 503)

    def body():
        if request.content_length and request.content_length > 4096:
            raise UsageError('AI_USAGE_SETTINGS')
        value = request.get_json(silent=True)
        if not isinstance(value, dict):
            raise UsageError('AI_USAGE_SETTINGS')
        return value

    @blueprint.route('/settings/ai/usage')
    def usage():
        today = datetime.now(timezone.utc).date()
        if set(request.args) - {'start', 'end', 'period', 'operation', 'model', 'page', 'group'}:
            raise UsageError('AI_USAGE_FILTER')
        try:
            page = int(request.args.get('page', '0'))
        except ValueError:
            raise UsageError('AI_USAGE_FILTER') from None
        result = store().snapshot(request.args.get('start', today.replace(day=1).isoformat()),
                                  request.args.get('end', today.isoformat()), request.args.get('period', 'day'),
                                  request.args.get('operation', ''), request.args.get('model', ''), page,
                                  request.args.get('group', ''))
        return reply({'ok': True, **result})

    @blueprint.route('/settings/ai/billing', methods=['GET', 'POST'])
    def billing():
        result = store().configure(body()) if request.method == 'POST' else store().billing()
        return reply({'ok': True, 'billing': result})

    @blueprint.route('/settings/ai/billing/sync', methods=['POST'])
    def sync():
        value = body()
        if set(value) != {'start', 'end'}:
            raise UsageError('AI_USAGE_RANGE')
        return reply({'ok': True, **store().sync(value['start'], value['end'])})

    return blueprint
