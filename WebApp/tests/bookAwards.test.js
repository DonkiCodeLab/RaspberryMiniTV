import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
async function bundle(file) {
  const result = await build({ entryPoints: [new URL(file, import.meta.url).pathname], bundle: true, write: false, format: 'cjs', platform: 'node', external: ['react'], loader: { '.css': 'empty', '.png': 'dataurl' }, define: { 'import.meta.env': '{"VITE_WEB_DEV_MODE":"mock"}' } });
  const module = { exports: {} };
  new Function('require', 'module', 'exports', result.outputFiles[0].text)(require, module, module.exports);
  return module.exports;
}
const { bookAwardCatalogs, matchesAwardBook, matchAwardBooks, bookAwardSelectionIndex } = await bundle('../src/bookAwardCatalog.js');
const { default: Library } = await bundle('../src/BookAwardLibrary.jsx');
const { default: Controls } = await bundle('../src/BookLibraryControls.jsx');

test('official catalogs cover every year and preserve shared prizes and no-award years', () => {
  for (const [award, catalog] of Object.entries(bookAwardCatalogs)) {
    assert.equal(catalog.winners.length, award === 'pulitzer' ? 73 : 74);
    assert.equal(new Set(catalog.winners.map(winner => winner.key)).size, catalog.winners.length);
    for (let year = catalog.firstYear; year <= catalog.lastYear; year++) {
      assert.equal(catalog.winners.some(winner => winner.awardYear === year), !catalog.noAwardYears.includes(year), `${award} ${year}`);
    }
    assert.ok(catalog.winners.every(winner => winner.title && winner.author));
    assert.deepEqual(catalog.winners.map(winner => winner.awardYear), catalog.winners.map(winner => winner.awardYear).sort((a, b) => a - b));
  }
  assert.deepEqual(bookAwardCatalogs.pulitzer.winners.filter(winner => winner.awardYear === 2023).map(winner => winner.title).sort(), ['Demon Copperhead', 'Trust']);
  assert.equal(bookAwardCatalogs.planeta.winners.at(-1).title, 'Vera, una historia de amor');
});

test('book matching rejects authors alone, namesakes, metadata-only entries, and graphic adaptations', () => {
  const winner = bookAwardCatalogs.planeta.winners.find(winner => winner.awardYear === 2024);
  const book = { name: 'VICTORIA', author: 'Paloma Sanchez-Garnica', relativePath: 'Books/Victoria.epub', format: 'epub' };
  assert.ok(matchesAwardBook(winner, book));
  assert.equal(matchesAwardBook(winner, { ...book, name: 'Another book' }), false);
  assert.equal(matchesAwardBook(winner, { ...book, author: 'Another author' }), false);
  assert.equal(matchesAwardBook(winner, { ...book, isGraphicNovel: true }), false);
  assert.equal(matchAwardBooks([winner], [{ ...book, relativePath: '' }])[0].book, null);
  assert.equal(matchAwardBooks([winner], [book])[0].book, book);
});

test('translated editions match by work identity and original titles, never conflicting identities', () => {
  const winner = { title: 'The Road', author: 'Cormac McCarthy', openLibraryKey: '/works/OL1W' };
  assert.ok(matchesAwardBook(winner, { title: 'La carretera', author: winner.author, openLibraryKey: '/works/OL1W' }));
  assert.ok(matchesAwardBook(winner, { title: 'La carretera', originalTitle: 'The Road', author: winner.author }));
  assert.equal(matchesAwardBook(winner, { ...winner, openLibraryKey: '/works/OL2W' }), false);
});

test('selection defaults to latest and can reach both 2023 winners separately', () => {
  const winners = bookAwardCatalogs.pulitzer.winners;
  assert.equal(bookAwardSelectionIndex(winners), winners.length - 1);
  const shared = winners.filter(winner => winner.awardYear === 2023);
  assert.notEqual(bookAwardSelectionIndex(winners, shared[0].key), bookAwardSelectionIndex(winners, shared[1].key));
});

test('each award renders upload for missing books and reading only for installed winners', () => {
  for (const award of Object.keys(bookAwardCatalogs)) {
    const winner = bookAwardCatalogs[award].winners.at(-1);
    const render = books => renderToStaticMarkup(React.createElement(Library, { award, books, language: 'es', onEditionChange() {}, onRead() {}, onUpload() {} }));
    const missing = render([]);
    assert.match(missing, />Cargar libro<\/button>/);
    assert.doesNotMatch(missing, />Leer libro<\/button>/);
    assert.match(missing, new RegExp(winner.title));
    const installed = render([{ ...winner, relativePath: 'Books/winner.epub', format: 'epub', coverUrl: '/cover.jpg' }]);
    assert.match(installed, />Leer libro<\/button>/);
    assert.doesNotMatch(installed, />Cargar libro<\/button>/);
    assert.match(installed, /src="\/cover.jpg"/);
  }
});

test('book award controls remain reachable in an empty library and hide irrelevant sorting', () => {
  for (const [language, label] of [['es', 'Libros premiados'], ['ca', 'Llibres premiats'], ['en', 'Award-winning books']]) {
    const html = renderToStaticMarkup(React.createElement(Controls, { language, view: 'awards', viewLabels: { grid: 'Grid', list: 'List' }, onViewChange() {}, onSortChange() {}, onTypeChange() {} }));
    assert.ok(html.includes(label));
    assert.doesNotMatch(html, /<select/);
  }
});
