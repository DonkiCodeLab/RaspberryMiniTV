"""Persist a MiniTV player's progress even after the remote browser disconnects."""
import math
import time
from user_profiles import ProfileStore, ProfileError


class ProfilePlayback:
    def __init__(self, database, context):
        self.store = ProfileStore(database)
        self.context = context
        self.last_save = 0
        self.last_progress = None

    def sample(self, command, force=False, ended=False):
        if not force and time.monotonic() - self.last_save < 3:
            return
        self.last_save = time.monotonic()
        position = command("get_property", "time-pos")
        duration = command("get_property", "duration")
        seconds = position.get("data") if isinstance(position, dict) else None
        total = duration.get("data") if isinstance(duration, dict) else None
        if isinstance(seconds, (float, int)) and math.isfinite(seconds):
            total = total if isinstance(total, (float, int)) and math.isfinite(total) else 0
            self.last_progress = {"kind": "video", "seconds": max(0, seconds), "duration": max(0, total), "completed": False}
        elif not ended:
            return
        if not self.last_progress:
            return
        progress = dict(self.last_progress)
        if ended:
            try:
                saved = self.store.state(self.context["userId"])["progress"].get(self.context["key"], {})
                # The API flushes the exact position before stopping mpv.
                if saved.get("seconds", 0) > progress["seconds"]:
                    progress = {**progress, "seconds": saved["seconds"]}
            except ProfileError:
                return
        # A clean exit near the end is completion; a stop midway never is.
        if ended and progress["duration"] > 0 and progress["seconds"] >= progress["duration"] - 5:
            progress.update(seconds=progress["duration"], completed=True)
        marks = {}
        key = self.context.get("markKey")
        if progress["completed"] and key:
            episode = self.context.get("episodeNumber")
            marks[key] = {"episodes": {str(episode): True}} if episode is not None else {"watched": True}
        try:
            self.store.patch(self.context["userId"], {"progress": {self.context["key"]: progress}, "marks": marks})
        except ProfileError as error:
            if error.status != 404:
                raise
