"""Durable update history, kept outside Git and systemd's volatile runtime state."""
from datetime import datetime, timezone
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import uuid
from urllib.parse import urlsplit

HISTORY_PATH = Path("/var/lib/minitv-update/history.jsonl")


def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def git_output(repo, *args):
    try:
        # The updater runs as root in a checkout owned by the device user.
        return subprocess.run(
            ["git", "-c", f"safe.directory={repo}", "-C", str(repo), *args],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=30, check=True,
        ).stdout.strip()
    except (OSError, subprocess.SubprocessError):
        return None


def current_commit(repo):
    return git_output(repo, "rev-parse", "--verify", "HEAD") or ""


def github_repository_url(repo):
    """Return a browser URL for the updater's origin, without Git credentials."""
    remote = git_output(repo, "remote", "get-url", "origin")
    if not remote:
        return None
    if "://" in remote:
        try:
            parsed = urlsplit(remote)
            host, path = parsed.hostname or "", parsed.path.lstrip("/")
        except ValueError:
            return None
        if parsed.scheme not in {"https", "http", "ssh", "git"} or parsed.query or parsed.fragment:
            return None
        ssh = parsed.scheme == "ssh"
    else:
        match = re.fullmatch(r"(?:[^@\s/:]+@)?([^:/\s]+):/?([^?#\s]+)", remote)
        if not match:
            return None
        host, path = match.groups()
        ssh = True
    # Also support the per-account SSH aliases used by this project.
    if host.lower() != "github.com" and not (ssh and re.fullmatch(r"github\.com-[A-Za-z0-9_.-]+", host, re.I)):
        return None
    path = path.rstrip("/")
    if path.endswith(".git"):
        path = path[:-4]
    if not re.fullmatch(r"[A-Za-z0-9_-]+/[A-Za-z0-9_.-]+", path) or path.split("/")[1] in {".", ".."}:
        return None
    return f"https://github.com/{path}"


def update_commits(repo, previous_commit, commit):
    if not previous_commit or not commit:
        return None
    if previous_commit == commit:
        return []
    output = git_output(repo, "log", "-z", "--format=%H%x00%s%x00%b",
                        f"{previous_commit}..{commit}", "--")
    if output is None:
        return None
    fields = output.rstrip("\0").split("\0")
    # Git terminates each record with NUL, including an empty commit body.
    commits = []
    for index in range(0, len(fields) - 1, 3):
        commits.append({"hash": fields[index], "subject": fields[index + 1],
                        "body": fields[index + 2].strip() if index + 2 < len(fields) else ""})
    return commits


def record_update(repo, *, started_at, previous_commit, exit_code):
    commit = current_commit(repo)
    entry = {
        "runId": os.environ.get("INVOCATION_ID") or uuid.uuid4().hex,
        "startedAt": started_at,
        "completedAt": timestamp(),
        "state": "succeeded" if exit_code == 0 else "failed",
        "exitCode": exit_code,
        "previousCommit": previous_commit,
        "commit": commit,
        "repositoryUrl": github_repository_url(repo),
        "commits": update_commits(repo, previous_commit, commit),
    }
    HISTORY_PATH.parent.mkdir(parents=True, exist_ok=True, mode=0o755)
    with HISTORY_PATH.open("a", encoding="utf-8") as history:
        fcntl.flock(history, fcntl.LOCK_EX)
        os.fchmod(history.fileno(), 0o644)
        # A separate line survives an interrupted previous append.
        history.write("\n" + json.dumps(entry, ensure_ascii=False) + "\n")
        history.flush()
        os.fsync(history.fileno())
    return entry


def read_history():
    entries = []
    try:
        with HISTORY_PATH.open(encoding="utf-8", errors="replace") as history:
            for line in history:
                try:
                    entry = json.loads(line)
                    if not isinstance(entry, dict) or entry.get("state") not in {"succeeded", "failed"}:
                        continue
                    completed_at = entry.get("completedAt")
                    if not isinstance(completed_at, str) or not datetime.fromisoformat(completed_at).tzinfo:
                        continue
                    entries.append(entry)
                except (ValueError, TypeError):
                    continue
    except FileNotFoundError:
        pass
    return list(reversed(entries))
