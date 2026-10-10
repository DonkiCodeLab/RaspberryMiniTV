"""Assemble the reviewed catalog and reversible, minimal API payloads. No network or credentials."""
import copy
import html
import json
from pathlib import Path
import re
import unicodedata

ROOT = Path(__file__).resolve().parent
LANGS = ('es', 'ca', 'en')
before = json.loads((ROOT / 'catalog-before.json').read_text())
fresh = json.loads(Path('/tmp/minitv-books-fresh.json').read_text())
books = before['books']
current = {b['relativePath']: b for b in fresh['books']}
assert len(books) == len(current) == 394
assert {b['relativePath'] for b in books} == set(current)
profiles = fresh['mediaLibrary']['books']
snapshot = {'books': fresh['books'], 'bookCollections': fresh.get('bookCollections', []), 'profiles': profiles}
(ROOT / 'catalog-preapply.json').write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + '\n')

def read_rows(pattern):
    return [json.loads(line) for path in sorted(ROOT.glob(pattern)) for line in path.read_text().splitlines() if line.strip()]

rows = read_rows('review-*.jsonl')
assert len(rows) == 246
reviews = {r['i']: r for r in rows}
assert len(reviews) == len(rows)
publisher = {r['file']: r for r in json.loads((ROOT / 'comic-publisher-metadata.json').read_text())}
boys = {r['n']: r for r in read_rows('the-boys-synopses-*.jsonl')}
walking = {r['n']: r for r in read_rows('walking-dead-synopses-*.jsonl')}
assert len(boys) == 69 and len(walking) == 79

for i, book in enumerate(books):
    if book.get('collection') == 'the-boys-comics':
        n = int(re.search(r'the-boys-(\d+)\.pdf$', book['file']).group(1))
        year = next(y for last, y in [(4, 2006), (13, 2007), (25, 2008), (37, 2009), (49, 2010), (61, 2011), (72, 2012)] if n <= last)
        reviews[i] = {**boys[n], 'i': i, 'year': str(year), 'title': f'The Boys {n:02}', 'author': 'Garth Ennis',
            'note': f'Año de publicación original del número {n}.',
            'sources': [f'https://dynamite.com/the-boys-{n}/' if n > 1 else 'https://www.comics.org/series/19531/',
                'https://www.comics.org/series/19531/' if n < 7 else 'https://www.comics.org/series/25058/details/']}
    elif book.get('collection') == 'walking-dead-comic-de-luxe':
        n = int(re.search(r'twd-(\d+)-deluxe\.pdf$', book['file']).group(1))
        date = publisher[f'wd-original-{n:03}']['date']
        year = re.search(r'\b(19|20)\d{2}\b', date).group()
        artist = 'Tony Moore' if n <= 6 else 'Charlie Adlard'
        reviews[i] = {**walking[n], 'i': i, 'year': year, 'title': f'The Walking Dead Deluxe {n:03}',
            'author': f'Robert Kirkman, {artist}',
            'note': f'Número {n}: primera publicación original el {date}. La edición Deluxe a color es posterior y no cambia el año de ordenación.',
            'sources': [f'https://imagecomics.com/comics/releases/the-walking-dead-{n}',
                f'https://imagecomics.com/comics/releases/the-walking-dead-deluxe-{n}']}
        if n in (56, 57, 58, 59):
            reviews[i]['sources'].append(f'https://walkingdead.fandom.com/wiki/Issue_{n}')

# Bibliographic dates for original works, with serialization and collection cases
# explained explicitly. Informal bundles are ordered by their earliest included work.
reviews[1]['year'] = '1999'
reviews[1]['note'] = 'Primera recopilación en libro en 1999; la miniserie original de cinco números se publicó en 1998.'
reviews[18]['clearWorkLink'] = True
reviews[18]['note'] = 'Novela de Asimov y Silverberg publicada en 1990, distinta del relato de 1941 y de la colección de 1969. Se conserva la edición española identificada por su ISBN y se elimina el enlace a la obra mezclada en Open Library.'
reviews[26]['clearWorkLink'] = True
reviews[26]['title'] = 'Bearn o la sala de las muñecas'
reviews[26]['titles'] = {'es': 'Bearn o la sala de las muñecas', 'ca': 'Bearn o la sala de les nines', 'en': "The Dolls' Room"}
reviews[26]['note'] = 'Primera publicación en castellano en 1956; versión catalana en 1961. Se elimina el enlace de Open Library que mezcla esta obra con Las afueras de Luis Goytisolo; se conserva el ISBN válido de la edición de Bearn.'
reviews[16]['note'] = 'Año bibliográfico de la primera edición completa en libro, 1878; la publicación por entregas había comenzado en 1875.'
reviews[46]['note'] = 'Primera publicación íntegra por entregas durante 1866; la edición separada en libro apareció en 1867.'
reviews[71]['note'] = 'Publicada por entregas entre 1844 y 1846; se usa el año de inicio, 1844, habitual en las bibliografías de la obra.'
reviews[83]['note'] = 'Primera parte publicada en 1605 y segunda parte en 1615; se usa el año de la primera.'

SOURCE_OVERRIDES = {
 1: ['https://www.comics.org/issue/710324/?display=grid', 'https://en.wikipedia.org/wiki/300_(comics)'],
 2: ['https://www.goodreads.com/es/book/show/25223418-4-relatos'],
 5: ['https://vicentetrigo.com/wp-content/uploads/2016/09/asimov.pdf'],
 9: ['https://www.santiagoposteguillo.es/wp-content/uploads/Nota-de-prensa-AFRICANUS-Sept.18.pdf'],
 11: ['https://books.google.com/books?id=oaReEAAAQBAJ'],
 15: ['https://files.eric.ed.gov/fulltext/ED274531.pdf'],
 16: ['https://www.pearson.com/en-au/media/1099072/Anna_karenina.pdf'],
 18: ['https://openlibrary.org/books/OL13364307M/Anochecer', 'https://www.teranlibros.com/anochecer-id-itv000140'],
 20: ['https://www.editorialkolima.com/revista/30-dias-con-kolima-noviembre-2020.pdf'],
 22: ['https://www.comics.org/issue/1487242/'],
 26: ['https://www.goodreads.com/work/editions/2432136-bearn-o-la-sala-de-les-nines', 'https://www.uniliber.com/ficha/bearn-o-la-sala-de-las-munecas_111315730/'],
 34: ['https://www.nature.com/articles/44716'],
 42: ['https://www.grup62.cat/llibre-confeti/390424'],
 44: ['https://www.perezreverte.com/catalogo/files/folleto-reverte.pdf'],
 45: ['https://www.penguinlibros.com/es/uso-de-la-lengua-y-diccionarios/285383-ebook-crimenes-diez-casos-reales-9788418052798', 'https://penguinclubdelectura.com/wp-content/uploads/2022/03/Crimenes_Carles-Porta.pdf'],
 47: ['https://www.perezreverte.com/upload/ficheros/libros/201001/cuando_ramos_honrados_mercenarios.pdf'],
 48: ['https://www.uraniaaste.com/wp-content/uploads/2016/10/Catalogo-Urania_DEF2.pdf', 'https://www.comicsbox.it/albo/GIGANTCUBA_001'],
 57: ['https://search.worldcat.org/title/Bram-Stoker%27s-Dracula/oclc/317377562', 'https://sf-encyclopedia.com/entry/saberhagen_fred'],
 60: ['https://www.grup62.cat/llibre-larqueoleg/96132?soporte=109247'],
 62: ['https://blogs.cpnl.cat/lecturescompartides/2016/06/27/latles-furtiu/'],
 64: ['https://georgerrmartin.com/notablog/2014/04/15/dunk-and-egg/'],
 72: ['https://fr.wikipedia.org/wiki/Les_Thibault'],
 81: ['https://www.maimes.cat/lhorror-de-requiem/', 'https://www.alianzaeditorial.es/primer_capitulo/el-horror-de-requiem.pdf'],
 95: ['https://en.wikipedia.org/wiki/Freida_McFadden'],
 108: ['https://www.comics.org/issue/42231/?display=grid'],
 110: ['https://www.rowohlt.de/buch/nicolas-barreau-die-zeit-der-kirschen-9783644007185'],
 121: ['https://www.planetadelibros.com/libro-frankenstein-esta-vivo-novela-grafica/171790?soporte=299949', 'https://storage.googleapis.com/warehouse-europe-west3-prod-assets/b4140915-9fc5-4952-818d-ec3335c9ed56/9788491740711/9840d0d7d109ad345ffb5e95f629c1bf.pdf'],
 134: ['https://oscarnavas.com/publicaciones/hijos-de-la-fundacion/', 'https://tercerafundacion.net/biblioteca/ver/libro/68279'],
 141: ['https://www.uniliber.com/ficha/cienfuegos-iii-azabache_31262600/'],
 172: ['https://www.dupuis.com/les-soeurs-gremillet/bd/les-soeurs-gremillet-tome-1-le-reve-de-sarah/83081'],
 176: ['https://www.antena3.com/documents/2026/02/18/DD7651F5-03D7-4427-AB9D-302DB6BB5100/llevara_tu_nombre1_capsin.pdf'],
 184: ['https://anikaentrelibros.com/mala-estrella-barbara-baldi'],
 185: ['https://books.google.com.ec/books/about/Manaos.html?id=8H5AAAAAYAAJ'],
 189: ['https://www.tha.de/homes/harsch/graeca/Chronologia/S_post02/MarcAurel/mar_f.html', 'https://dinter.de/buch/de-seipso-zurich-1559/'],
 194: ['https://www.comics.org/issue/888467/?display=grid'],
 210: ['https://www.grup62.cat/llibre-se-sabra-tot/93974', 'https://proapi.grup62.cat/descargas/sala-prensa-libro/sinopsis-y-biografia/109556/se-sabra-tot.pdf?_locale=ca'],
 221: ['https://opac.biblio.iteso.mx/vufind/Record/000051376', 'https://elpais.com/diario/1996/09/18/cultura/842997606_850215.html'],
 222: ['https://www.todocoleccion.net/libros-segunda-mano-literatura/alberto-vazquez-figueroa-tuareg-1-edicion-1981-dedicado-por-alberto-vazquez-figueroa~x53420364'],
}
for i in (300, 301, 302, 303):
    SOURCE_OVERRIDES[i] = ['https://www.lassociation.fr/en/infos/', 'https://www.normandieimages.fr/images/collegeaucinema/dossierpedagogiquepersepolis.pdf']
for i in range(383, 389):
    SOURCE_OVERRIDES[i] = [f'https://imagecomics.com/comics/releases/paper-girls-vol-{i - 382}-tp']
for i, word in zip(range(389, 394), ('one', 'two', 'three', 'four', 'five')):
    SOURCE_OVERRIDES[i] = [f'https://aliceoseman.com/graphic-novel/heartstopper-volume-{word}/', 'https://aliceoseman.com/heartstopper/the-history/', 'https://en.wikipedia.org/wiki/Heartstopper_(graphic_novel)']
SOURCE_OVERRIDES.update({int(i): links for i, links in json.loads((ROOT / 'source-additions.json').read_text()).items()})

assert set(reviews) == set(range(394))
patch_dir = ROOT / 'patches'
rollback_dir = ROOT / 'rollback'
for directory in (patch_dir, rollback_dir, ROOT / 'responses'):
    directory.mkdir(exist_ok=True)
audit = []
concurrent = []
for i in range(394):
    old = books[i]
    book = current[old['relativePath']]
    r = reviews[i]
    assert re.fullmatch(r'\d{4}', r['year']) and 1000 <= int(r['year']) <= 2026, i
    for lang in LANGS:
        assert 70 <= len(r[lang]) <= 2000, (i, lang)
        assert not any(c in r[lang] for c in ('\ufffd', '<script', 'http://', 'https://')), (i, lang)
    assert len({r[lang] for lang in LANGS}) == 3, i
    for key in ('title', 'description', 'year', 'author', 'localizedMetadata'):
        if old.get(key) != book.get(key):
            concurrent.append({'i': i, 'field': key, 'before': old.get(key), 'current': book.get(key)})
    title = unicodedata.normalize('NFC', r.get('title') or book.get('title') or book['name'])
    localized = copy.deepcopy(book.get('localizedMetadata') or {})
    if r.get('resetIdentity'):
        localized = {}
    for lang in LANGS:
        localized.setdefault(lang, {})['description'] = r[lang]
        if r.get('titles', {}).get(lang):
            localized[lang]['title'] = r['titles'][lang]
        elif r.get('title'):
            localized[lang]['title'] = title
        else:
            localized[lang].setdefault('title', title)
    patch = {'relativePath': book['relativePath'], 'title': title, 'year': r['year'], 'description': r['es'], 'localizedMetadata': localized}
    if r.get('author'):
        patch['author'] = r['author']
    if r.get('resetIdentity'):
        for key in ('openLibraryKey', 'editionKey', 'isbn', 'publisher', 'publishDate', 'pageCount', 'pageCountSource', 'subjects', 'subtitle'):
            patch[key] = ''
        patch['language'] = 'spa'
    if r.get('clearWorkLink'):
        patch['openLibraryKey'] = ''
    previous = profiles.get(book['relativePath'], {})
    rollback = {'relativePath': book['relativePath']}
    for key in patch:
        if key != 'relativePath':
            rollback[key] = previous.get(key, {} if key == 'localizedMetadata' else '')
    rollback['title'] = previous.get('title') or book.get('title') or book['name']
    (patch_dir / f'{i:03}.json').write_text(json.dumps(patch, ensure_ascii=False, indent=2) + '\n')
    (rollback_dir / f'{i:03}.json').write_text(json.dumps(rollback, ensure_ascii=False, indent=2) + '\n')
    sources = list(r.get('sources', [])) + SOURCE_OVERRIDES.get(i, [])
    author = patch.get('author', book.get('author', ''))
    if i not in SOURCE_OVERRIDES and not r.get('resetIdentity') and not r.get('clearWorkLink') and book.get('openLibraryKey'):
        sources.append('https://openlibrary.org' + book['openLibraryKey'])
    if 'Vázquez-Figueroa' in author:
        sources.append('https://www.albertovazquez-figueroa.com/libros')
    if 'Crichton' in author:
        sources.append('https://michaelcrichton.com/work/writer/books/')
    if 'George R.' in author:
        sources.append('https://georgerrmartin.com/bibliography/')
    if 'Stephen King' in author:
        sources.append('https://stephenking.com/bibliography/')
    if 'Freida McFadden' in author:
        sources.append('https://www.freidamcfadden.com/printable-booklist/')
    local_evidence = f'embedded-{i}.json' if (ROOT / f'embedded-{i}.json').exists() else None
    audit.append({'i': i, 'relativePath': book['relativePath'], 'title': title, 'author': author,
        'oldTitle': book.get('title') or book['name'], 'oldYear': book.get('year', ''), 'year': r['year'],
        'yearChanged': book.get('year', '') != r['year'], 'synopses': {lang: r[lang] for lang in LANGS},
        'note': r.get('note', ''), 'sources': list(dict.fromkeys(sources)), 'embeddedEvidence': local_evidence,
        'identityCorrected': bool(r.get('resetIdentity') or r.get('clearWorkLink'))})

assert not concurrent, f'Catalog changed during review: {concurrent}'
stats = {'booksReviewed': len(audit), 'synopsesWritten': len(audit) * 3,
    'yearsChanged': sum(r['yearChanged'] for r in audit),
    'yearsAdded': sum(not r['oldYear'] for r in audit),
    'wrongWorkLinksRemoved': sum(r['identityCorrected'] for r in audit),
    'titlesChanged': sum(r['oldTitle'] != r['title'] for r in audit)}
result = {'date': '2026-10-10', 'status': 'prepared', 'policy': 'Primera publicación de la obra, no escritura ni reedición. Se usa el año bibliográfico de la obra original, con notas que distinguen la publicación por entregas, las versiones autónomas y las recopilaciones cuando procede. En cómics individuales, el año del número original. En paquetes de novelas, el de la primera obra incluida.', 'stats': stats, 'books': audit}
(ROOT / 'review.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')

esc = html.escape
items = []
for row in audit:
    links = ' · '.join(f'<a href="{esc(url, quote=True)}" target="_blank" rel="noreferrer">Fuente {j+1}</a>' for j, url in enumerate(row['sources']))
    if row['embeddedEvidence']:
        links += f' · <a href="{row["embeddedEvidence"]}">Metadatos del archivo</a>'
    desc = ''.join(f'<p class="synopsis" lang="{lang}">{esc(row["synopses"][lang])}</p>' for lang in LANGS)
    changes = ' changed' if row['yearChanged'] else ''
    search = esc((row['title'] + ' ' + row['author'] + ' ' + row['year']).casefold(), quote=True)
    items.append(f'<article class="book{changes}" data-search="{search}"><div class="heading"><h2>{esc(row["title"])}</h2><span class="year">{esc(row["oldYear"] or "Sin año")} → <strong>{row["year"]}</strong></span></div><p class="author">{esc(row["author"])}</p>{desc}<p class="note">{esc(row["note"])}</p><details><summary>Fuentes y archivo</summary><p>{links}</p><code>{esc(row["relativePath"])}</code></details></article>')
page = '''<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Revisión de la biblioteca · MiniTV</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:1060px;margin:auto;padding:28px;color:#23313c;background:#f3f5f4}h1{font-size:32px;line-height:1.2}h2{font-size:20px;line-height:1.3;margin:0}.intro{max-width:85ch}.toolbar{position:sticky;top:0;display:flex;gap:14px;flex-wrap:wrap;align-items:center;padding:16px 0;background:#f3f5f4;z-index:1}input[type=search]{flex:1;min-width:220px}input,select{font:inherit;padding:9px;border:1px solid #9aa9a5;border-radius:6px}article{background:white;border:1px solid #d6dfdc;border-radius:10px;margin:18px 0;padding:22px}.heading{display:flex;gap:15px;justify-content:space-between}.year{white-space:nowrap;color:#52645c}.changed .year strong{color:#087853}.author{color:#65716c;margin-top:4px}.note{font-size:14px;color:#555}a{color:#086d64}details{font-size:13px}code{overflow-wrap:anywhere}.synopsis[lang=ca],.synopsis[lang=en]{display:none}label{font-size:14px}.status{padding:12px;background:#e4eee9;border-radius:6px}@media(max-width:650px){.heading{display:block}.year{display:block;margin-top:8px}body{padding:16px}}@media print{.toolbar{display:none}article{break-inside:avoid}body{background:white}}</style>
<h1>Revisión de la biblioteca</h1><p class="intro">394 fichas revisadas · 1.182 sinopsis en castellano, catalán e inglés · 10 de octubre de 2026.</p><p class="status" id="status">Revisión preparada. Pendiente de comprobación del guardado.</p>
<p class="intro">El año corresponde a la primera publicación de la obra, no a su escritura ni a una reedición. Las particularidades de las publicaciones por entregas, las recopilaciones y los paquetes de novelas se explican en cada ficha. Los números de cómic usan su año original, aunque el archivo sea una edición posterior.</p>
<div class="toolbar"><input type="search" id="q" placeholder="Buscar título, autor o año" aria-label="Buscar"><select id="lang" aria-label="Idioma de la sinopsis"><option value="es">Castellano</option><option value="ca">Català</option><option value="en">English</option></select><label><input type="checkbox" id="changes"> Solo años modificados</label><span id="count"></span></div>
''' + '\n'.join(items) + '''<script>const books=[...document.querySelectorAll('.book')];function render(){const q=document.querySelector('#q').value.toLocaleLowerCase();const changed=document.querySelector('#changes').checked;const lang=document.querySelector('#lang').value;let n=0;for(const b of books){b.hidden=!b.dataset.search.includes(q)||(changed&&!b.classList.contains('changed'));if(!b.hidden)n++;for(const p of b.querySelectorAll('.synopsis'))p.style.display=p.lang===lang?'block':'none'}document.querySelector('#count').textContent=n+' fichas'}for(const id of ['q','changes','lang'])document.querySelector('#'+id).addEventListener('input',render);render();</script></html>'''
(ROOT / 'revision-biblioteca.html').write_text(page)
print(json.dumps(stats, ensure_ascii=False))
