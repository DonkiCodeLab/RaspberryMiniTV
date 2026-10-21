"""Read local video metadata on demand; cache successful probes until the file changes."""
from functools import lru_cache
import math
from pathlib import Path
from browser_playback import probe, selected_stream, PlaybackError


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


def inspect_file(path):
    path = Path(path).resolve()
    stat = path.stat()
    result = {'fileName': path.name, 'sizeBytes': stat.st_size, 'probeStatus': 'unknown'}
    try:
        result.update(_inspect(str(path), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns))
    except PlaybackError:
        # Keep file information useful when ffprobe is unavailable or the video is damaged.
        pass
    return result
