"""Snapshot the updater so git pull cannot change a running shell script."""
import os
from pathlib import Path
import subprocess
import tempfile
from system_update_history import current_commit, record_update, timestamp


def main():
    repo = Path(os.environ["MINITV_REPO_DIR"])
    started_at = timestamp()
    previous_commit = current_commit(repo)
    with tempfile.TemporaryDirectory(prefix="minitv-update-") as temporary:
        script = Path(temporary) / "update_minitv.sh"
        script.write_bytes((repo / "update_minitv.sh").read_bytes())
        result = subprocess.run(["/bin/bash", str(script)], cwd=repo,
                                env={**os.environ, "MINITV_UPDATE_ROOT": str(repo),
                                     "GIT_TERMINAL_PROMPT": "0", "DEBIAN_FRONTEND": "noninteractive"},
                                stdin=subprocess.DEVNULL)
        record_update(repo, started_at=started_at, previous_commit=previous_commit,
                      exit_code=result.returncode)
        return result.returncode


if __name__ == "__main__":
    raise SystemExit(main())
