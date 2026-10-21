"""Language identities shared by the API, pygame menu and web UI."""
import json
from pathlib import Path

LANGUAGES = json.loads(Path(__file__).with_name('languages.json').read_text(encoding='utf-8'))
LANGUAGE_BY_ID = {item['id']: item for item in LANGUAGES}
SUPPORTED_LANGUAGES = frozenset(LANGUAGE_BY_ID)
ALIASES = {'cat': 'ca', 'spa': 'es', 'eng': 'en', 'cmn': 'zh', 'zho': 'zh', 'zh-hans': 'zh', 'ar-eg': 'arz'}


def normalize_language(value, fallback='en'):
    code = str(value or '').strip().lower().replace('_', '-')
    code = ALIASES.get(code, code.split('-')[0])
    return code if code in SUPPORTED_LANGUAGES else fallback


def language_info(value):
    return LANGUAGE_BY_ID[normalize_language(value)]
