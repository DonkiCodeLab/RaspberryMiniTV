#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
WEB_DIR="${REPO_DIR}/WebApp"
LOG_FILE="/tmp/minitv-menu.log"

cd "${REPO_DIR}"
git pull

if command -v npm >/dev/null 2>&1 && [ -f "${WEB_DIR}/package.json" ]; then
  cd "${WEB_DIR}"
  npm run build
  cd "${REPO_DIR}"
fi

sudo systemctl restart minitv-api.service
sudo systemctl restart minitv-menu.service

touch "${LOG_FILE}"
tail -f "${LOG_FILE}"
