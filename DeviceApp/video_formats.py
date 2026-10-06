"""Local video containers accepted by the torrent importer, catalog and players.

Playback uses mpv/Kodi; browser video support is not the format limit here.
Extensions select candidates, not a guarantee that their contents can be decoded.
Archives, disc images and playlists are deliberately excluded.
"""
from pathlib import Path


VIDEO_EXTENSIONS = frozenset({
    ".mp4", ".m4v", ".mov", ".mkv", ".avi", ".divx", ".webm",
    ".mpg", ".mpeg", ".m2v", ".ts", ".mts", ".m2ts", ".vob",
    ".wmv", ".asf", ".flv", ".ogv", ".3gp", ".rm", ".rmvb",
})


def is_video_file(filename):
    return Path(filename).suffix.lower() in VIDEO_EXTENSIONS
