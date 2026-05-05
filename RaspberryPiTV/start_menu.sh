#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/raspberrypitv-menu.log"

cd "${SCRIPT_DIR}"

raspi-gpio set 19 op a5 >/dev/null 2>&1 || true
raspi-gpio set 18 op dh >/dev/null 2>&1 || true

export SDL_VIDEODRIVER=fbcon
export SDL_FBDEV=/dev/fb0
export SDL_MOUSE_TOUCH_EVENTS=1

pkill -f "python3 ${SCRIPT_DIR}/menu_app.py" >/dev/null 2>&1 || true

echo "[$(date '+%Y-%m-%d %H:%M:%S')] launching menu_app.py" >>"${LOG_FILE}"
exec /usr/bin/python3 "${SCRIPT_DIR}/menu_app.py" >>"${LOG_FILE}" 2>&1
