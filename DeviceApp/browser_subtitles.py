"""Discover sidecars and expose text subtitle streams as WebVTT for the browser."""
from functools import lru_cache
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
from movie_subtitles import inspect_subtitles, srt_to_vtt, MAX_SUBTITLE_BYTES

TEXT_CODECS = frozenset({'subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text', 'text',
                         'microdvd', 'mpl2', 'jacosub', 'sami', 'realtext', 'subviewer',
                         'subviewer1', 'vplayer', 'pjs', 'stl'})


class BrowserSubtitleError(Exception):
    def __init__(self, code, status=422):
        self.code, self.status = code, status
        super().__init__(code)


def contained(path, root):
    return os.path.commonpath([str(Path(root).resolve()), str(Path(path).resolve())]) == str(Path(root).resolve())


def inventory(video, root, subtitle_info=None):
    video = Path(video)
    result = subtitle_info if subtitle_info is not None else inspect_subtitles(str(video), str(root))
    tracks = []
    converter = bool(shutil.which('ffmpeg'))
    # Enumerate rather than glob: movie names may themselves contain glob characters.
    for path in sorted(video.parent.iterdir(), key=lambda p: (p.stem != video.stem, p.name.casefold())):
        if (path.suffix.lower() not in {'.srt', '.vtt', '.ass', '.ssa'}
                or not (path.stem == video.stem or path.stem.startswith(video.stem + '.'))
                or not path.is_file() or not contained(path, root)):
            continue
        suffix = path.stem[len(video.stem):].strip('.')
        tracks.append({'id': 'external:' + path.name, 'kind': 'external', 'title': suffix or path.name,
                       'language': suffix.split('.')[0] if suffix else '',
                       'available': path.suffix.lower() in {'.srt', '.vtt'} or converter})
    for track in result['embedded']:
        tracks.append({'id': 'embedded:' + str(track['index']), 'kind': 'embedded',
                       'title': track.get('title') or '', 'language': track.get('language') or '',
                       'codec': track.get('codec') or '',
                       'available': track.get('codec') in TEXT_CODECS and converter})
    return {'tracks': tracks, 'embeddedStatus': result['embeddedStatus']}


def _signature(path):
    stat = path.stat()
    return (str(path.resolve()), stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)


@lru_cache(maxsize=16)
def _extract(signature, index):
    executable = shutil.which('ffmpeg')
    if not executable:
        raise BrowserSubtitleError('SUBTITLE_TOOLS_MISSING', 503)
    try:
        with tempfile.TemporaryFile() as output:
            subprocess.run([executable, '-nostdin', '-v', 'error', '-i', signature[0],
                            '-map', '0:' + str(index), '-c:s', 'webvtt', '-f', 'webvtt', 'pipe:1'],
                           stdout=output, stderr=subprocess.PIPE, timeout=30, check=True)
            output.seek(0)
            content = output.read(MAX_SUBTITLE_BYTES + 1)
    except (OSError, subprocess.SubprocessError) as error:
        raise BrowserSubtitleError('SUBTITLE_EXTRACTION_FAILED') from error
    if len(content) > MAX_SUBTITLE_BYTES or not content.startswith(b'WEBVTT'):
        raise BrowserSubtitleError('SUBTITLE_INVALID_DOWNLOAD')
    return content.decode('utf-8-sig')


def read_track(video, root, track_id):
    # IDs must come from discovery; no user-controlled path or stream is passed to FFmpeg.
    tracks = inventory(video, root)['tracks']
    track = next((entry for entry in tracks if entry['id'] == track_id), None)
    if not track:
        raise BrowserSubtitleError('SUBTITLE_NOT_FOUND', 404)
    if not track['available']:
        raise BrowserSubtitleError('SUBTITLE_FORMAT_UNSUPPORTED')
    video = Path(video)
    if track['kind'] == 'embedded':
        return _extract(_signature(video), int(track_id.split(':', 1)[1]))
    path = video.parent / track_id.split(':', 1)[1]
    if not contained(path, root):
        raise BrowserSubtitleError('SUBTITLE_NOT_FOUND', 404)
    if path.suffix.lower() in {'.ass', '.ssa'}:
        return _extract(_signature(path), 0)
    with path.open('rb') as source:
        content = source.read(MAX_SUBTITLE_BYTES + 1)
    if path.suffix.lower() == '.srt':
        return srt_to_vtt(content)
    if len(content) > MAX_SUBTITLE_BYTES or not content.lstrip(b'\xef\xbb\xbf').startswith(b'WEBVTT'):
        raise BrowserSubtitleError('SUBTITLE_INVALID_DOWNLOAD')
    return content.decode('utf-8-sig')
