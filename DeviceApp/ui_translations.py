"""Small shared UI catalogue used by API-generated messages."""
import json
from pathlib import Path
from languages import normalize_language

TABLES = json.loads(Path(__file__).with_name('translations.json').read_text(encoding='utf-8'))


def translate(key, language='en', **values):
    code = normalize_language(language)
    text = TABLES.get(code, {}).get(key) or TABLES['en'].get(key) or key
    return text.format(**values)


def format_long_date(value, language='en'):
    code = normalize_language(language)
    weekday = translate(f'date.weekday.{value.weekday()}', code)
    month = translate(f'date.month.{value.month}', code)
    if code == 'ca':
        prefix = "d'" if month[0] in 'aeiou' else 'de '
        return f'{value.day} ({weekday}) {prefix}{month} del {value.year}'
    if code == 'es':
        return f'{value.day} ({weekday}) de {month} de {value.year}'
    return translate('date.full', code, weekday=weekday, day=value.day, month=month, year=value.year)
