import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getRaspberryMovieLibraryItems as catalog, loadMovieDetails } from '../src/movieCatalog.js';

const file = (path, tmdbId = 0) => ({ relativePath: path, file: path.split('/').pop(), tmdbId });

test('fresh browsers receive all 127 files, including missing and shared TMDB identifiers', () => {
  const files = Array.from({ length: 127 }, (_, i) => file(`Movies/Film ${i}.mp4`, i < 16 ? (i % 15) + 1 : 0));
  const movies = catalog({ movieRootFiles: files });
  assert.equal(movies.length, 127);
  assert.equal(new Set(movies.map(movie => movie.id)).size, 127);
  assert.equal(movies[126].name, 'Film 126');
  assert.equal(movies[126].fileRelativePath, 'Movies/Film 126.mp4');
});

test('root and nested files appear once by path, even with identical filenames or TMDB IDs', () => {
  const root = file('Movies/Film.mp4', 10);
  const nested = file('Movies/Other/Film.mp4', 10);
  assert.deepEqual(catalog({ movieRootFiles: [root], movieDirectories: [{ videos: [nested, root] }] }).map(m => m.id), [root.relativePath, nested.relativePath]);
});

test('server metadata applies to films without TMDB and metadata-only ghosts are excluded', () => {
  const movies = catalog({ movieRootFiles: [file('Movies/a.mp4')], mediaLibrary: { movies: {
    'Movies/a.mp4': { name: 'My movie' }, 'Movies/deleted.mp4': { name: 'Deleted', tmdbId: 99 },
  } } });
  assert.equal(movies.length, 1);
  assert.equal(movies[0].name, 'My movie');
});

test('deletion and empty server snapshots cannot retain browser catalog entries', () => {
  const initial = { movieRootFiles: [file('Movies/a.mp4'), file('Movies/b.mp4')] };
  assert.equal(catalog(initial).length, 2);
  assert.deepEqual(catalog({ movieRootFiles: [initial.movieRootFiles[1]] }).map(m => m.id), ['Movies/b.mp4']);
  assert.deepEqual(catalog({ movieRootFiles: [] }), []);
});

test('attaching or changing TMDB metadata keeps a file identity stable', () => {
  assert.equal(catalog({ movieRootFiles: [file('Movies/a.mp4')] })[0].id,
    catalog({ movieRootFiles: [file('Movies/a.mp4', 100)] })[0].id);
});

test('TMDB failures do not discard other metadata or request missing IDs', async () => {
  const movies = catalog({ movieRootFiles: [file('Movies/a.mp4'), file('Movies/b.mp4', 2), file('Movies/c.mp4', 3)] });
  const calls = [];
  const result = await loadMovieDetails(movies, async (id) => {
    calls.push(id);
    if (id === 2) throw new Error('Unavailable');
    return { name: 'Movie C' };
  }, 'es');
  assert.deepEqual(calls, [2, 3]);
  assert.equal(result['Movies/a.mp4'], null);
  assert.equal(result['Movies/b.mp4'], null);
  assert.equal(result['Movies/c.mp4'].name, 'Movie C');
});
