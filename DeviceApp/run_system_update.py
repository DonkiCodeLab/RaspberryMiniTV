"""Snapshot the updater so git pull cannot change a running shell script."""
import os
from pathlib import Path
import subprocess
import tempfile


def main():
    repo = Path(os.environ["MINITV_REPO_DIR"])
    with tempfile.TemporaryDirectory(prefix="minitv-update-") as temporary:
        script = Path(temporary) / "update_minitv.sh"
        script.write_bytes((repo / "update_minitv.sh").read_bytes())
        return subprocess.run(["/bin/bash", str(script)], cwd=repo,
                              env={**os.environ, "MINITV_UPDATE_ROOT": str(repo),
                                   "GIT_TERMINAL_PROMPT": "0", "DEBIAN_FRONTEND": "noninteractive"},
                              stdin=subprocess.DEVNULL).returncode


if __name__ == "__main__":
    raise SystemExit(main())
