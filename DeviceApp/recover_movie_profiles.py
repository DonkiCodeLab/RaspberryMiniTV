"""Restore an exported browser catalog by exact file path, preserving all other files."""
import copy

FIELDS = ('heroImage', 'heroImageCrop', 'imdbUrl', 'rottenTomatoesUrl')


def recover_profiles(library, backup, existing_paths):
    result = copy.deepcopy(library)
    movies = result.setdefault('movies', {})
    restored, skipped = [], []
    for row in backup.get('library', []):
        path = row.get('fileRelativePath') or ''
        tmdb_id = int(row.get('id') or 0)
        current = movies.get(path, {})
        if not path or path not in existing_paths or not tmdb_id:
            skipped.append(path)
            continue
        if current.get('tmdbId') and int(current['tmdbId']) != tmdb_id:
            skipped.append(path)
            continue
        # Original profiles used TMDB IDs. Path-keyed scan placeholders must
        # never hide those original custom names, images, crops and links.
        profile = backup.get('profiles', {}).get(str(tmdb_id), {})
        item = {**current, 'relativePath': path, 'tmdbId': tmdb_id,
                'file': row.get('fileName') or path.rsplit('/', 1)[-1],
                'name': profile.get('name') or row.get('name') or current.get('name', '')}
        for field in FIELDS:
            if field in profile:
                item[field] = profile[field]
        movies[path] = item
        restored.append(path)
    return result, restored, skipped
