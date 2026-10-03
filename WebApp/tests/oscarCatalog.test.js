import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchOscarMovies, oscarSelectionIndex } from '../src/oscarCatalog.js';

const winners = [
  { edition: 2, ceremonyYear: 1930, tmdbId: 65203, title: 'The Broadway Melody' },
  { edition: 3, ceremonyYear: 1930, tmdbId: 143, title: 'All Quiet on the Western Front' },
];

test('availability uses exact TMDB identity and a downloaded file, never names or remakes', () => {
  const items = matchOscarMovies(winners, [
    { id: 'wrong', tmdbId: 49046, name: winners[1].title, fileRelativePath: 'Movies/remake.mp4' },
    { id: 'metadata-only', tmdbId: 65203 },
    { id: 'original', tmdbId: 143, name: 'Sin novedad en el frente', fileRelativePath: 'Movies/original.mp4' },
  ]);
  assert.equal(items[0].movie, null);
  assert.equal(items[1].movie.id, 'original');
});

test('deletion disables a winner without removing it; another copy keeps it available', () => {
  const copies = [1, 2].map(id => ({ id, tmdbId: 143, fileRelativePath: `Movies/copy${id}.mp4` }));
  assert.equal(matchOscarMovies(winners, copies)[1].movie.id, 1);
  assert.equal(matchOscarMovies(winners, copies.slice(1))[1].movie.id, 2);
  const empty = matchOscarMovies(winners, []);
  assert.equal(empty.length, 2);
  assert.ok(empty.every(winner => winner.movie === null));
  assert.equal(winners[1].movie, undefined);
});

test('selection preserves both 1930 ceremonies and defaults to the newest edition', () => {
  assert.equal(oscarSelectionIndex(winners, 2), 0);
  assert.equal(oscarSelectionIndex(winners, 3), 1);
  assert.equal(oscarSelectionIndex(winners, null), 1);
  assert.equal(oscarSelectionIndex(winners, 999), 1);
});
