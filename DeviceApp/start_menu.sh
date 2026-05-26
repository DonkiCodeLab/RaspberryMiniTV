#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_FILE="/tmp/minitv-menu.log"

cd "${SCRIPT_DIR}"

raspi-gpio set 19 op a5 >/dev/null 2>&1 || true
raspi-gpio set 18 op dh >/dev/null 2>&1 || true

if [ -z "${SDL_VIDEODRIVER:-}" ]; then
  if [ -e /dev/dri/card0 ]; then
    export SDL_VIDEODRIVER=kmsdrm
    export SDL_RENDER_DRIVER=software
  else
    export SDL_VIDEODRIVER=fbcon
    export SDL_FBDEV=/dev/fb0
  fi
fi
export SDL_MOUSE_TOUCH_EVENTS=1
export SDL_AUDIODRIVER="${SDL_AUDIODRIVER:-alsa}"
export AUDIODEV="${AUDIODEV:-plughw:0,0}"
export MINITV_ALSA_DEVICE="${MINITV_ALSA_DEVICE:-plughw:0,0}"
export XDG_RUNTIME_DIR=/tmp/minitv-xdg-runtime
mkdir -p "${XDG_RUNTIME_DIR}"
chmod 700 "${XDG_RUNTIME_DIR}" >/dev/null 2>&1 || true

pkill -f "python3 ${SCRIPT_DIR}/menu_app.py" >/dev/null 2>&1 || true

nohup /usr/bin/python3 "${SCRIPT_DIR}/menu_app.py" >>"${LOG_FILE}" 2>&1 &
