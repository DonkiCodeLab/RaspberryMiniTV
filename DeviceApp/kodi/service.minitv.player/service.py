import os
import time

import xbmc


MEDIA_ENV = "MINITV_KODI_MEDIA_PATH"
START_TIMEOUT_SECONDS = 20.0


def quit_kodi():
    xbmc.executebuiltin("Quit")


def run():
    media_path = os.environ.get(MEDIA_ENV, "").strip()
    if not media_path:
        return
    if not os.path.isfile(media_path):
        xbmc.log(f"MiniTV media file does not exist: {media_path}", xbmc.LOGERROR)
        quit_kodi()
        return

    monitor = xbmc.Monitor()
    player = xbmc.Player()
    xbmc.log(f"MiniTV starting playback: {media_path}", xbmc.LOGINFO)
    player.play(media_path)

    deadline = time.monotonic() + START_TIMEOUT_SECONDS
    while not monitor.abortRequested() and time.monotonic() < deadline:
        if player.isPlayingVideo():
            break
        monitor.waitForAbort(0.1)
    else:
        xbmc.log("MiniTV playback did not start before timeout", xbmc.LOGERROR)
        quit_kodi()
        return

    while not monitor.abortRequested() and player.isPlayingVideo():
        monitor.waitForAbort(0.2)

    if not monitor.abortRequested():
        xbmc.log("MiniTV playback stopped; closing Kodi", xbmc.LOGINFO)
        quit_kodi()


if __name__ == "__main__":
    run()
