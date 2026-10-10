"""Verify saved profiles against a fresh /videos response and finalize the audit."""
from datetime import datetime, timezone
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
before = json.loads((ROOT / 'catalog-preapply.json').read_text())
after = json.loads(Path('/tmp/minitv-books-after.json').read_text())
old = {book['relativePath']: book for book in before['books']}
current = {book['relativePath']: book for book in after['books']}
patches = sorted((ROOT / 'patches').glob('*.json'))
assert len(patches) == len(current) == 394
assert set(current) == set(old)
for path in patches:
    expected = json.loads(path.read_text())
    response = json.loads((ROOT / 'responses' / path.name).read_text())
    relative = expected['relativePath']
    assert response.get('ok'), path.name
    for key, value in expected.items():
        assert response['item'].get(key) == value, (path.name, 'response', key)
        assert current[relative].get(key) == value, (path.name, 'persisted', key)
    for language in ('es', 'ca', 'en'):
        assert current[relative]['localizedMetadata'][language]['description'].strip()
    for key in ('file', 'format', 'collection', 'sizeBytes', 'coverUrl', 'isGraphicNovel'):
        assert current[relative].get(key) == old[relative].get(key), (path.name, 'preserved', key)
    for key, value in before['profiles'].get(relative, {}).items():
        if key not in expected:
            assert after['mediaLibrary']['books'][relative].get(key) == value, (path.name, 'unmodified', key)

verification = {
    'verifiedAtUtc': datetime.now(timezone.utc).isoformat(),
    'status': 'saved_and_verified',
    'booksVerified': 394,
    'localizedSynopsesVerified': 1182,
    'firstPublicationYearsVerified': 394,
    'checks': ['All 394 save responses match their intended payloads.',
        'A fresh catalog read matches every saved field.',
        'Every record contains Spanish, Catalan and English synopses.',
        'Book files, sizes, formats, collection assignments, covers and classifications are unchanged.',
        'Previously saved fields outside the edits remain unchanged.'],
    'codeValidation': {'backendTestsPassed': 19, 'frontendTestsPassed': 21},
    'codeDeployment': 'Source changes are local; no application deployment was performed.',
}
(ROOT / 'verification.json').write_text(json.dumps(verification, ensure_ascii=False, indent=2) + '\n')
(ROOT / 'catalog-after.json').write_text(json.dumps({
    'books': after['books'], 'bookCollections': after['bookCollections'],
    'profiles': after['mediaLibrary']['books']}, ensure_ascii=False, indent=2) + '\n')
report_path = ROOT / 'review.json'
report = json.loads(report_path.read_text())
assert all(book['sources'] for book in report['books'])
report.update(status='saved_and_verified', verification=verification)
report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
html_path = ROOT / 'revision-biblioteca.html'
page = html_path.read_text().replace('Revisión preparada. Pendiente de comprobación del guardado.',
    'Guardado y verificado en MiniTV: 394 fichas, 1.182 sinopsis y 358 años corregidos o completados. Se conserva una copia anterior a los cambios.')
html_path.write_text(page)
print(json.dumps({'status': verification['status'], **report['stats']}, ensure_ascii=False))
