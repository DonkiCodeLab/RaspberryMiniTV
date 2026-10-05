#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${MINITV_REPO_DIR:-$(dirname "${SCRIPT_DIR}")}"
if [[ "${EUID}" -ne 0 ]]; then
  exec sudo env MINITV_REPO_DIR="${REPO_DIR}" bash "$0" "$@"
fi

if ! command -v transmission-daemon >/dev/null 2>&1; then
  apt-get update
  apt-get install -y transmission-daemon
  # The package starts its default instance. A fresh installation only needs ours.
  systemctl disable --now transmission-daemon.service
fi

# Dedicated instance: never edit another Transmission user's settings or queue.
systemctl stop minitv-torrents.service 2>/dev/null || true
mkdir -p "${REPO_DIR}/MultimediaContent/Torrents/downloads"
python3 - "${REPO_DIR}" <<'PY'
import json
import pathlib
import sys

root = pathlib.Path(sys.argv[1]) / "MultimediaContent" / "Torrents"
config = root / "transmission" / "settings.json"
config.parent.mkdir(parents=True, exist_ok=True)
settings = json.loads(config.read_text()) if config.exists() else {}
settings.update({
    "rpc-enabled": True, "rpc-bind-address": "127.0.0.1", "rpc-port": 9092,
    "rpc-authentication-required": False, "rpc-whitelist-enabled": True,
    "rpc-whitelist": "127.0.0.1", "rpc-host-whitelist-enabled": True,
    "download-dir": str(root / "downloads"), "incomplete-dir-enabled": False,
    "watch-dir-enabled": False, "rename-partial-files": True,
    "download-queue-enabled": True, "download-queue-size": 2,
    "peer-port": 51414, "peer-port-random-on-start": False,
    "dht-enabled": True, "pex-enabled": True, "umask": 18,
    "script-torrent-done-enabled": False,
})
config.write_text(json.dumps(settings, indent=2) + "\n")
template = pathlib.Path(sys.argv[1]) / "DeviceApp/services/minitv-torrents.service"
path = pathlib.Path("/etc/systemd/system/minitv-torrents.service")
path.write_text(template.read_text().replace("__REPO_DIR__", sys.argv[1]))
PY
systemctl daemon-reload
systemctl enable minitv-torrents.service
systemctl restart minitv-torrents.service
echo "Motor de torrents MiniTV instalado (RPC solo en 127.0.0.1:9092)."
