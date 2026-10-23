"""Historical synthetic probes for commit ab791973069bce2c14a2def9779ec526b78f4b29.

Run with that revision of DeviceApp in the adjacent directory. These assertions
record the old behavior and intentionally do not pass against the improved code.
No real faces, ML inference, or user catalogue are used.
"""
import json
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'DeviceApp'))
from photo_library import PhotoLibrary

BOX = {'x': .2, 'y': .2, 'width': .2, 'height': .3}

def detection(value, box=None):
    return {'encoding': [value] + [0.] * 127, 'box': box or BOX.copy()}

def photo(store, ident):
    with store.db() as db:
        db.execute('INSERT INTO photos VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                   (ident, ident+'.png', 'gallery', ident+'.png', 1., 1., 1, '{}', None, None, 'pending'))

def groups(store):
    with store.db() as db:
        result = {}
        for row in db.execute('SELECT photo, person FROM face_detections ORDER BY photo'):
            result.setdefault(row['person'], []).append(row['photo'])
        return sorted(result.values())

def case_order(root, order):
    store = PhotoLibrary(root / 'Pictures')
    values = {'A': 0., 'B': .35, 'C': .8}
    for ident in order:
        photo(store, ident)
        store.group_faces(ident, [detection(values[ident])])
    return groups(store)

with tempfile.TemporaryDirectory() as folder:
    root = Path(folder)
    result = {'scope': 'synthetic 128D vectors; not a recognition accuracy benchmark',
              'order_ABC': case_order(root/'abc', 'ABC'),
              'order_ACB': case_order(root/'acb', 'ACB')}
    assert len(result['order_ABC']) == 1 and len(result['order_ACB']) == 2

    store = PhotoLibrary(root/'correction'/'Pictures')
    for ident, value in [('A',0.), ('B',.35), ('C',.8)]:
        photo(store, ident)
        store.group_faces(ident, [detection(value)])
    face = store.photo_faces('B')['faces'][0]
    store.assign_face('B', face['id'], {'name': 'Corrected B'})
    result['after_correcting_bridge_B'] = groups(store)
    assert ['A','C'] in result['after_correcting_bridge_B']

    store = PhotoLibrary(root/'manual_redetect'/'Pictures')
    photo(store, 'A')
    store.group_faces('A', [detection(0.)])
    face = store.photo_faces('A')['faces'][0]
    store.assign_face('A', face['id'], {'name': 'Confirmed person'})
    store.group_faces('A', [detection(.8)])
    result['manual_same_box_after_vector_shift'] = [
        {'manual': f['manual'], 'box': f['box']} for f in store.photo_faces('A')['faces']]
    assert len(result['manual_same_box_after_vector_shift']) == 2

    store = PhotoLibrary(root/'remove_redetect'/'Pictures')
    photo(store, 'A')
    store.group_faces('A', [detection(0.)])
    face = store.photo_faces('A')['faces'][0]
    store.remove_face('A', face['id'])
    store.group_faces('A', [detection(0.)])
    result['removed_face_count_after_redetect'] = len(store.photo_faces('A')['faces'])
    assert result['removed_face_count_after_redetect'] == 1

    store = PhotoLibrary(root/'manual_no_vector'/'Pictures')
    photo(store, 'A')
    store.add_face('A', {'box': BOX, 'name': 'Manual identity'})
    photo(store, 'B')
    store.group_faces('B', [detection(0.)])
    result['manual_box_alone_does_not_seed_recognition'] = groups(store)
    assert result['manual_box_alone_does_not_seed_recognition'] == [['A'], ['B']]

    store = PhotoLibrary(root/'incompatible_model'/'Pictures')
    photo(store, 'A')
    store.group_faces('A', [{'encoding': [0.] * 512, 'box': BOX.copy()}])
    details = store.photo_faces('A')
    result['new_512d_vector_is_silently_discarded'] = {'state': details['state'], 'faceCount': len(details['faces'])}
    assert details['state'] == 'done' and not details['faces']

    print(json.dumps(result, indent=2))
