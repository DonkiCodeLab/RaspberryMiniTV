#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${REPO_DIR}/RaspberryPiWEB"
LOG_FILE="/tmp/raspberrypitv-menu.log"

cd "${REPO_DIR}"
git pull

if command -v npm >/dev/null 2>&1 && [ -f "${WEB_DIR}/package.json" ]; then
  cd "${WEB_DIR}"
  npm run build
  cd "${REPO_DIR}"
fi

sudo systemctl restart simpsonstv-api.service
sudo systemctl restart simpsonstv-menu.service

touch "${LOG_FILE}"
tail -f "${LOG_FILE}"
