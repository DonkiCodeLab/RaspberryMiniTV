#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
LOG_FILE="/tmp/raspberrypitv-menu.log"

cd "${REPO_DIR}"
git pull

sudo systemctl restart simpsonstv-menu.service

touch "${LOG_FILE}"
tail -f "${LOG_FILE}"
