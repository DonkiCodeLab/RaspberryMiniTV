import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaMarkKey, seasonMarkKey, episodeWatched, markEpisode, markSeason, markSeries, seriesWatched } from '../src/mediaMarks.js';
import { marksPatch, mergeProfileState } from '../src/profileState.js';

test('whole-series marks include unloaded seasons and every episode', () => {
  for (const watched of [true, false]) {
    const marks = markSeries({}, 123, watched);
    for (const season of [0, 1, 8, 35]) {
      assert.equal(episodeWatched(marks, seasonMarkKey(123, season), 99), watched);
    }
  }
});

test('bulk changes reset previous exceptions and preserve favorites and other series after persistence', () => {
  const key = seasonMarkKey(123, 1);
  const other = seasonMarkKey(456, 1);
  let marks = { [mediaMarkKey('series', 123)]: { favorite: true }, [other]: { watched: true } };
  for (const watched of [true, false, true]) {
    marks = markEpisode(marks, key, 2, !watched);
    const next = markSeries(marks, 123, watched);
    marks = mergeProfileState({ marks }, { marks: marksPatch(marks, next) }).marks;
    assert.equal(episodeWatched(marks, key, 2), watched);
    assert.equal(episodeWatched(marks, key, 3), watched);
    assert.equal(marks[mediaMarkKey('series', 123)].favorite, true);
    assert.equal(episodeWatched(marks, other, 2), true);
    assert.equal(seriesWatched(marks, 123), watched);
  }
});

test('individual episodes and seasons can override the series mark', () => {
  const key = seasonMarkKey('my-series', 2);
  let marks = markSeries({}, 'my-series', true);
  marks = markEpisode(marks, key, 1, false);
  assert.equal(seriesWatched(marks, 'my-series'), false);
  assert.equal(episodeWatched(marks, key, 1), false);
  assert.equal(episodeWatched(marks, key, 2), true);
  marks = markSeason(marks, key, false);
  assert.equal(episodeWatched(marks, key, 2), false);
  marks = markSeries(marks, 'my-series', true);
  assert.equal(seriesWatched(marks, 'my-series'), true);
  assert.equal(episodeWatched(marks, key, 1), true);
});
