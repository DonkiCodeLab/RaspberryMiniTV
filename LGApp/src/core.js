/* ES5 syntax and Chrome 53 APIs: webOS 4.x is the compatibility baseline. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TVCore = factory();
}(this, function () {
  'use strict';
  function key(type, id) { return JSON.stringify([type, String(id)]); }
  function list(value) { return Array.isArray(value) ? value : []; }
  function cleanName(file) { return String(file || '').split('/').pop().replace(/\.[^.]+$/, '').replace(/_/g, ' '); }
  function serverAddress(input) {
    var value = String(input || '').trim();
    if (!value) throw new Error('Escribe la dirección de tu MiniTV.');
    if (!/^https?:\/\//i.test(value)) value = 'http://' + value;
    var url;
    try { url = new URL(value); } catch (_) { throw new Error('La dirección no es válida. Ejemplo: http://192.168.1.50:5050'); }
    if (!/^https?:$/.test(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || !/^\/*$/.test(url.pathname)) {
      throw new Error('Usa solo la dirección y el puerto de la MiniTV, sin rutas ni contraseñas.');
    }
    return url.origin;
  }
  function query(values) {
    return Object.keys(values).filter(function (k) { return values[k] !== undefined && values[k] !== null; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(String(values[k])); }).join('&');
  }
  function catalog(data, summaries) {
    data = data || {}; summaries = summaries || {};
    var library = data.mediaLibrary || {}, seen = {}, movies = [], series = [];
    var files = list(data.movieRootFiles).slice();
    list(data.movieDirectories).forEach(function (d) { files = files.concat(list(d.videos)); });
    function metadata(entry, type) {
      var path = entry.relativePath;
      var profile = (library[type] || {})[path] || {};
      var tmdb = (summaries[type] || {})[String(profile.tmdbId || entry.tmdbId)] || {};
      return { id: path, path: path, title: profile.name || entry.name || tmdb.name || cleanName(entry.file || path),
        type: type === 'movies' ? 'movie' : 'series', poster: tmdb.posterPath || '',
        year: String(tmdb.releaseDate || tmdb.firstAirDate || '').slice(0, 4),
        genres: list(tmdb.genres).join(' · '), rating: Number(tmdb.voteAverage) || 0,
        description: profile.overview || tmdb.overview || '', seriesId: Number(profile.tmdbId || entry.tmdbId) || path,
        markKey: key(type === 'movies' ? 'movie' : 'series', type === 'movies' ? path : Number(profile.tmdbId || entry.tmdbId) || path) };
    }
    files.forEach(function (file) {
      if (!file.relativePath || seen[file.relativePath]) return;
      seen[file.relativePath] = true; movies.push(metadata(file, 'movies'));
    });
    list(data.directories).forEach(function (directory) {
      if (!directory.relativePath) return;
      var item = metadata(directory, 'series');
      item.episodes = list(directory.videos).filter(function (v) { return v.relativePath; }).map(function (v) {
        var parsed = /(?:S(\d+)E(\d+)|(\d+)x(\d+))/i.exec(v.id || v.file || '');
        var season = Number(v.seasonNumber || (parsed && (parsed[1] || parsed[3]))) || 1;
        var episode = Number(v.episodeNumber || (parsed && (parsed[2] || parsed[4]))) || 0;
        return { id: v.relativePath, path: v.relativePath, title: v.name || cleanName(v.file || v.relativePath),
          seriesTitle: item.title, type: 'episode', season: season, episode: episode, poster: item.poster,
          markKey: key('season', JSON.stringify([String(item.seriesId), season])) };
      }).sort(function (a, b) { return a.season - b.season || a.episode - b.episode || a.title.localeCompare(b.title); });
      if (item.episodes.length) series.push(item);
    });
    // Loose TV files must remain playable even without a series folder.
    if (list(data.rootFiles).length) {
      var loose = catalog({ directories: [{ relativePath: 'TVShows', name: 'Otros episodios', videos: data.rootFiles }] }, {});
      series = series.concat(loose.series);
    }
    return { movies: movies, series: series };
  }
  function progressPatch(item, seconds, duration, completed) {
    var patch = { progress: {} };
    patch.progress[key('video', item.path)] = { kind: 'video', seconds: Math.max(0, Number(seconds) || 0),
      duration: Math.max(0, Number(duration) || 0), completed: !!completed };
    if (completed && item.markKey) {
      patch.marks = {}; patch.marks[item.markKey] = item.type === 'episode' ? { episodes: {} } : { watched: true };
      if (item.type === 'episode') patch.marks[item.markKey].episodes[String(item.episode)] = true;
    }
    return patch;
  }
  function time(seconds) {
    seconds = Math.max(0, Math.floor(Number(seconds) || 0));
    return (seconds >= 3600 ? Math.floor(seconds / 3600) + ':' : '') +
      (seconds >= 3600 && Math.floor(seconds / 60) % 60 < 10 ? '0' : '') + Math.floor(seconds / 60) % 60 + ':' +
      (seconds % 60 < 10 ? '0' : '') + seconds % 60;
  }
  function neighbor(from, candidates, direction) {
    var horizontal = direction === 'left' || direction === 'right', forward = direction === 'right' || direction === 'down';
    var axis = horizontal ? 'x' : 'y', cross = horizontal ? 'y' : 'x', best = null, score = Infinity;
    candidates.forEach(function (candidate) {
      var delta = (candidate[axis] - from[axis]) * (forward ? 1 : -1);
      if (delta < 2) return;
      var distance = Math.abs(candidate[cross] - from[cross]);
      var overlap = distance < ((horizontal ? from.height + candidate.height : from.width + candidate.width) / 2) - 3;
      var next = delta + distance * 2 + (overlap ? 0 : 10000);
      if (next < score) { best = candidate; score = next; }
    });
    return best;
  }
  function audioSupport(video) {
    var codecs = { aac: 'mp4a.40.2', mp3: 'mp3', opus: 'opus', vorbis: 'vorbis', flac: 'flac', ac3: 'ac-3', eac3: 'ec-3' }, result = {};
    ['mp4', 'webm'].forEach(function (container) {
      result[container] = Object.keys(codecs).filter(function (codec) { return !!video.canPlayType('audio/' + container + '; codecs="' + codecs[codec] + '"'); });
    });
    return result;
  }
  return { key: key, query: query, serverAddress: serverAddress, catalog: catalog, progressPatch: progressPatch,
    time: time, neighbor: neighbor, audioSupport: audioSupport };
}));
