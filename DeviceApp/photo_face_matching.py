"""Conservative matching policy for the existing dlib embedding space.

Pure computation runs outside the catalogue transaction. This is not DBSCAN:
singletons remain visible, while weak matches need independent supporting photos.
No neural models, BLAS thread pools, or additional dependencies are loaded here.
"""
from array import array
from functools import lru_cache
import json
import math

DIMENSIONS = 128
MAX_DISTANCE = .48
STRONG_DISTANCE = .36
IDENTITY_MARGIN = .05


def valid_vector(vector):
    return (isinstance(vector, (list, tuple, array)) and len(vector) == DIMENSIONS and
            all(isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)
                for value in vector))


def valid_box(box):
    return (isinstance(box, dict) and
            all(isinstance(box.get(key), (int, float)) and not isinstance(box[key], bool) and
                math.isfinite(box[key]) for key in ('x', 'y', 'width', 'height')) and
            0 <= box['x'] < 1 and 0 <= box['y'] < 1 and box['width'] > 0 and box['height'] > 0 and
            box['x'] + box['width'] <= 1.000001 and box['y'] + box['height'] <= 1.000001)


def validate_detections(detections):
    if not isinstance(detections, list):
        raise ValueError('Respuesta del detector inválida.')
    result = []
    for item in detections:
        vector = item.get('encoding') if isinstance(item, dict) else item
        box = item.get('box') if isinstance(item, dict) else None
        if not valid_vector(vector):
            raise ValueError('Vector facial incompatible: se requieren 128 valores finitos del modelo dlib.')
        if box is not None and not valid_box(box):
            raise ValueError('Rectángulo de cara inválido.')
        result.append({'encoding': list(vector), 'box': dict(box) if box else None})
    return result


@lru_cache(maxsize=2048)
def reference_vector(encoded):
    # Bounded cache; arrays avoid retaining 128 Python float objects per sample.
    vector = json.loads(encoded)
    if not valid_vector(vector):
        return None
    return array('d', vector)


def distance(a, b, limit=MAX_DISTANCE):
    if len(a) != DIMENSIONS or len(b) != DIMENSIONS:
        return math.inf
    squared, cutoff = 0., limit * limit
    for left, right in zip(a, b):
        delta = left - right
        squared += delta * delta
        if squared > cutoff:
            return math.inf
    return math.sqrt(squared)


def overlap(a, b):
    if not a or not b:
        return 0.
    intersection = max(0, min(a['x'] + a['width'], b['x'] + b['width']) - max(a['x'], b['x'])) * \
        max(0, min(a['y'] + a['height'], b['y'] + b['height']) - max(a['y'], b['y']))
    return intersection / (a['width'] * a['height'] + b['width'] * b['height'] - intersection)


def rank_candidates(detections, references, check_cancel=lambda: None):
    """Only retain nearby identities; two samples in one collage count once."""
    check_cancel()
    if not detections:
        return []
    scores = [{} for _ in detections]
    for index, reference in enumerate(references):
        if index % 64 == 0:
            check_cancel()
        vector = reference_vector(reference['encoding'])
        if vector is None:
            continue
        for detection, people in zip(detections, scores):
            value = distance(vector, detection['encoding'], MAX_DISTANCE + IDENTITY_MARGIN)
            if not math.isfinite(value):
                continue
            person = reference['person']
            score = people.setdefault(person, {'person': person, 'distance': value, 'photos': set(), 'manual': False})
            score['distance'] = min(score['distance'], value)
            if value < MAX_DISTANCE:
                # Two distinct reference photos suffice; don't grow these sets unboundedly.
                if len(score['photos']) < 2:
                    score['photos'].add(reference['photo'])
                score['manual'] |= bool(reference['manual'])
    check_cancel()
    return [sorted(people.values(), key=lambda score: (score['distance'], score['person'])) for people in scores]


def choose_person(candidates, used):
    eligible = [score for score in candidates if score['person'] not in used]
    if not eligible or eligible[0]['distance'] >= MAX_DISTANCE:
        return None
    best = eligible[0]
    if len(eligible) > 1 and eligible[1]['distance'] - best['distance'] < IDENTITY_MARGIN:
        return None
    if best['distance'] < STRONG_DISTANCE or best['manual'] or len(best['photos']) >= 2:
        return best['person']
    return None


def previous_face(detection, previous, matched):
    candidates = []
    for face in previous:
        if face['id'] in matched:
            continue
        iou = overlap(face['box'], detection['box'])
        # A confirmed rectangle on the same photo identifies the annotation even
        # if a later extraction changes its vector. Resolve geometry before ML.
        if face['manual'] and iou > .65:
            candidates.append((0, -iou, face['id'], face))
        elif iou > .3 or face['box'] is None:
            value = distance(face['encoding'], detection['encoding'])
            if face['manual'] and not face['encoding'] and iou > .5:
                value = 0.
            if value < MAX_DISTANCE:
                candidates.append((1, value, face['id'], face))
    return min(candidates, key=lambda item: item[:3])[3] if candidates else None


def rejected(detection, rejections):
    for rejection in rejections:
        if rejection['box'] is not None:
            if overlap(rejection['box'], detection['box']) > .5:
                return True
        elif distance(rejection['encoding'], detection['encoding'], .1) < .1:
            # Legacy detections lack geometry: only suppress a very close vector
            # in this same photo, never a library-wide identity.
            return True
    return False
