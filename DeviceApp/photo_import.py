"""Validate portable photo metadata. Keep the original dump separate from public rows."""
from datetime import datetime
import json
import math


def validate_import_records(records, count):
    if not isinstance(records, list) or len(records) != count:
        raise ValueError('Los metadatos no corresponden a las fotos seleccionadas.')
    result = []
    for record in records:
        if not isinstance(record, dict): raise ValueError('Metadatos inválidos.')
        raw = record.get('raw')
        source_json = json.dumps(raw, ensure_ascii=False, allow_nan=False)
        if len(source_json.encode()) > 2 * 1024 * 1024: raise ValueError('Los metadatos de una foto superan 2 MB.')
        data = record.get('metadata')
        if data is None:
            result.append(({}, None, []))
            continue
        if not isinstance(data, dict) or not isinstance(raw, (dict, list)):
            raise ValueError('Metadatos inválidos.')
        def string(key, maximum):
            value = data.get(key, '')
            if not isinstance(value, str) or len(value) > maximum or '\0' in value:
                raise ValueError('Texto de metadatos inválido: ' + key)
            return value
        def names(key):
            value = data.get(key, [])
            if not isinstance(value, list) or len(value) > 500:
                raise ValueError('Lista de metadatos inválida: ' + key)
            if any(not isinstance(v, str) or not v.strip() or len(v) > 200 or any(ord(c) < 32 for c in v) for v in value):
                raise ValueError('Nombre de metadatos inválido: ' + key)
            return list(dict.fromkeys(value))
        meta = {key: string(key, limit) for key, limit in [('title', 1000), ('description', 20000), ('appleId', 200)]}
        meta.update(albums=names('albums'), keywords=names('keywords'), appleFavorite=data.get('appleFavorite') is True,
                    metadataSource='apple-photos' if meta['appleId'] else 'sidecar')
        taken = data.get('takenAt')
        if taken is not None:
            if not isinstance(taken, str) or len(taken) > 60: raise ValueError('Fecha de captura inválida.')
            datetime.fromisoformat(taken.replace('Z', '+00:00'))
            meta['takenAt'] = taken
        if data.get('locationKnown') is True:
            lat, lon = data.get('latitude'), data.get('longitude')
            if not (lat is None and lon is None):
                if any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in (lat, lon)):
                    raise ValueError('Coordenadas inválidas.')
                if not -90 <= lat <= 90 or not -180 <= lon <= 180: raise ValueError('Coordenadas inválidas.')
            meta.update(latitude=lat, longitude=lon)
        people = data.get('people', [])
        if not isinstance(people, list) or len(people) > 200: raise ValueError('Personas inválidas.')
        for person in people:
            if not isinstance(person, dict) or not isinstance(person.get('name'), str) or not person['name'].strip() or len(person['name']) > 200:
                raise ValueError('Nombre de persona inválido.')
            if not isinstance(person.get('id', ''), str) or len(person.get('id', '')) > 200:
                raise ValueError('Identificador de persona inválido.')
        result.append((meta, source_json, people))
    return result
