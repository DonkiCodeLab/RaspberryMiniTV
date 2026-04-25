#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SPLASH_IMAGE="${SPLASH_IMAGE:-/opt/tvsimpsons/splash.png}"
MENU_SERVICE="${MENU_SERVICE:-simpsonstv-menu.service}"
MENU_APP="${MENU_APP:-${SCRIPT_DIR}/menu_app.py}"
WAIT_SECONDS="${1:-8}"
FBI_LOG="${FBI_LOG:-/tmp/raspberrypitv-fbi.log}"

if [ ! -f "${SPLASH_IMAGE}" ]; then
  echo "Splash image not found: ${SPLASH_IMAGE}" >&2
  exit 1
fi

sudo systemctl stop "${MENU_SERVICE}" || true
sudo pkill -f "${MENU_APP}" || true
sudo pkill fbi || true

sudo fbi -T 1 -d /dev/fb0 --noverbose -a "${SPLASH_IMAGE}" >"${FBI_LOG}" 2>&1 &

sleep 1

sudo systemctl restart "${MENU_SERVICE}"

sleep "${WAIT_SECONDS}"

sudo pkill fbi || true
