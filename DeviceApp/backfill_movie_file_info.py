"""Resumable movie measurements; also run once in the background on API startup."""
import argparse
import json
import os
from pathlib import Path

import catalog_store
import media_file_info
from video_formats import is_video_file


def backfill(multimedia_dir, retry_failed=False, progress=None, batch_size=20):
    root = Path(multimedia_dir).resolve()
    videos = root / 'Videos'
    movies = videos / 'Movies'
    catalog_path = root / 'media_library.json'
    legacy = root / 'movie_library.json'
    snapshot = catalog_store.read(catalog_path, legacy)
    counts = dict(total=0, updated=0, unchanged=0, failed=0, skipped=0)
    pending = []

    def report(relative, status):
        counts['total'] += 1
        counts[status] += 1
        if progress:
            progress({'path': relative, 'status': status, **counts})

    def flush():
        if not pending:
            return
        results = []
        # Batch catalog snapshots, never hold the database lock during FFprobe.
        with catalog_store.transaction(catalog_path, legacy):
            latest = catalog_store.read(catalog_path, legacy)
            for path, relative, before, info in pending:
                current = latest['movies'].get(relative, {})
                status = 'skipped'
                if (media_file_info.is_current(info, path, current.get('originalFileName') or None)
                        and (not before or relative in latest['movies'])):
                    latest['movies'][relative] = {
                        'relativePath': relative, 'file': path.name, 'name': path.stem, 'tmdbId': 0,
                        **current, 'fileInfo': info,
                    }
                    status = 'updated' if info['probeStatus'] == 'known' else 'failed'
                results.append((relative, status))
            catalog_store.save(catalog_path, latest)
        pending.clear()
        for relative, status in results:
            report(relative, status)

    for directory, folders, files in os.walk(movies):
        folders[:] = sorted(folder for folder in folders if not folder.startswith('.')
                            and not (Path(directory) / folder).is_symlink())
        for name in sorted(files):
            path = Path(directory) / name
            if name.startswith('.') or not is_video_file(name) or path.is_symlink():
                continue
            relative = path.relative_to(videos).as_posix()
            before = snapshot['movies'].get(relative, {})
            original = before.get('originalFileName') or None
            saved = before.get('fileInfo')
            try:
                if (media_file_info.is_current(saved, path, original)
                        and not (retry_failed and saved.get('probeStatus') != 'known')):
                    report(relative, 'unchanged' if saved.get('probeStatus') == 'known' else 'failed')
                else:
                    pending.append((path, relative, before, media_file_info.inspect_file(path, original)))
            except OSError:
                report(relative, 'skipped')
            if len(pending) >= max(1, batch_size):
                flush()
    flush()
    return counts


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--multimedia-dir', type=Path,
                        default=Path(__file__).resolve().parent.parent / 'MultimediaContent')
    parser.add_argument('--retry-failed', action='store_true')
    args = parser.parse_args()
    report = backfill(args.multimedia_dir, args.retry_failed,
                      lambda row: print(json.dumps(row, ensure_ascii=False), flush=True))
    print(json.dumps({'summary': report}), flush=True)
    return 1 if report['failed'] or report['skipped'] else 0


if __name__ == '__main__':
    raise SystemExit(main())
