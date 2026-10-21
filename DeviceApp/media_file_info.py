"""Video measurements captured on ingestion and persisted in the movie catalog."""
from datetime import datetime, timezone
from functools import lru_cache
import math
from pathlib import Path
import re
from browser_playback import probe, selected_stream, PlaybackError

VERSION = 1
_UNSET = object()


def fingerprint(path):
    return _stat_fingerprint(Path(path).stat())


def _stat_fingerprint(stat):
    # ctime changes when Transmission removes its hard link, without changing the video.
    return {'size': stat.st_size, 'mtimeNs': stat.st_mtime_ns,
            'inode': stat.st_ino, 'device': stat.st_dev}


def quality(info, name=''):
    sources = [
        (r'(?:^|[^A-Z0-9])(?:HD)?(?:CAM|TS|TELESYNC|HDCAM)(?:[^A-Z0-9]|$)', 'CAM / TS'),
        (r'(?:^|[^A-Z0-9])(?:DVD)?SCR(?:EENER)?(?:[^A-Z0-9]|$)', 'Screener'),
        (r'REMUX', 'Remux'), (r'BLU[ ._-]?RAY|BDRIP|BRRIP', 'Blu-ray'),
        (r'WEB[ ._-]?DL', 'WEB-DL'), (r'WEB[ ._-]?RIP', 'WEBRip'),
        (r'HDTV', 'HDTV'), (r'DVD[ ._-]?RIP|DVDR', 'DVD'),
    ]
    source = next((label for pattern, label in sources if re.search(pattern, name.upper())), None)
    width, height = positive(info.get('width')) or 0, positive(info.get('height')) or 0
    if width >= 3800 or height >= 2100:
        resolution, level = '4K UHD', 5
    elif width >= 2500 or height >= 1400:
        resolution, level = '1440p', 4
    elif width >= 1800 or height >= 1000:
        resolution, level = '1080p Full HD', 4
    elif width >= 1200 or height >= 700:
        resolution, level = '720p HD', 3
    else:
        resolution, level = ('SD', 2) if width and height else (None, 0)
    if source == 'CAM / TS':
        level = 1
    elif source == 'Screener':
        level = min(level, 2) if level else 2
    return {'source': source, 'resolution': resolution, 'level': level}


def is_current(info, path, original_filename=_UNSET):
    try:
        return (isinstance(info, dict) and info.get('version') == VERSION
                and info.get('fingerprint') == fingerprint(path)
                and (original_filename is _UNSET or info.get('originalFileName') == original_filename))
    except OSError:
        return False


def stored_file_info(path, metadata):
    """Read-only: opening a movie must never launch FFprobe."""
    original = metadata.get('originalFileName') or None
    saved = metadata.get('fileInfo')
    if is_current(saved, path, original):
        return saved
    return {'fileName': Path(path).name, 'originalFileName': original,
            'sizeBytes': Path(path).stat().st_size, 'probeStatus': 'pending',
            'quality': {'source': None, 'resolution': None, 'level': 0}}


def for_published_file(info, path):
    """Bind precomputed measurements to the final path after atomic publication."""
    return {**info, 'fileName': Path(path).name, 'fingerprint': fingerprint(path)}


def positive(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (ValueError, TypeError):
        return None


@lru_cache(maxsize=64)
def _inspect(path, size, mtime, ctime):
    info = probe(path)
    video = selected_stream(info.get('streams', []), 'video')
    if not video:
        raise PlaybackError('NO_VIDEO')
    container = info.get('format', {})
    return {
        'probeStatus': 'known',
        'width': positive(video.get('width')), 'height': positive(video.get('height')),
        'codec': video.get('codec_name') or None,
        'videoBitrate': positive(video.get('bit_rate')),
        'totalBitrate': positive(container.get('bit_rate')),
        'durationSeconds': positive(video.get('duration')) or positive(container.get('duration')),
    }


def inspect_file(path, original_filename=None):
    path = Path(path).resolve()
    stat = path.stat()
    identity = _stat_fingerprint(stat)
    result = {'fileName': path.name, 'sizeBytes': stat.st_size, 'probeStatus': 'unknown',
              'version': VERSION, 'fingerprint': identity,
              'originalFileName': original_filename or None}
    try:
        result.update(_inspect(str(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
    except PlaybackError as error:
        # Keep file information useful when ffprobe is unavailable or the video is damaged.
        result['probeError'] = error.code
    if fingerprint(path) != identity:
        raise OSError('Video changed during analysis')
    result['quality'] = quality(result, original_filename or path.name)
    result['analyzedAt'] = datetime.now(timezone.utc).isoformat()
    return result
