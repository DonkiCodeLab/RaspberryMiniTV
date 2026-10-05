"""Identify the exact player process, without treating a stale PID as playback."""
from pathlib import Path


def process_identity(pid):
    try:
        pid = int(pid)
        if pid <= 0:
            return None
        fields = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        if fields[0] in {"Z", "X"}:
            return None
        return fields[19]  # Linux /proc stat field 22: process start time.
    except (OSError, ValueError, TypeError, IndexError):
        return None


def player_is_running(state):
    identity = process_identity(state.get("playerPid"))
    return bool(identity and identity == state.get("playerStart"))
