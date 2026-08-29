#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNTIME_DIR="/tmp/minitv-xdg-runtime"
WAYLAND_SOCKET="minitv-wayland"

mkdir -p "${RUNTIME_DIR}"
chmod 700 "${RUNTIME_DIR}"
export XDG_RUNTIME_DIR="${RUNTIME_DIR}"

weston --backend=drm-backend.so --config="${SCRIPT_DIR}/weston.ini" \
  --socket="${WAYLAND_SOCKET}" --log=/tmp/minitv-weston.log &
WESTON_PID=$!

cleanup() {
  kill "${MENU_PID:-}" "${CLOCK_PID:-}" "${WESTON_PID}" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for _ in $(seq 1 50); do
  [[ -S "${RUNTIME_DIR}/${WAYLAND_SOCKET}" ]] && break
  sleep 0.1
done

export WAYLAND_DISPLAY="${WAYLAND_SOCKET}"
export SDL_VIDEODRIVER=wayland
export SDL_RENDER_DRIVER=software
export SDL_MOUSE_TOUCH_EVENTS=1
export SDL_AUDIODRIVER="${SDL_AUDIODRIVER:-alsa}"
export AUDIODEV="${AUDIODEV:-plughw:0,0}"
export MINITV_ALSA_DEVICE="${MINITV_ALSA_DEVICE:-plughw:0,0}"

/usr/bin/python3 "${SCRIPT_DIR}/external_clock.py" >>/tmp/minitv-external-clock.log 2>&1 &
CLOCK_PID=$!
/usr/bin/python3 "${SCRIPT_DIR}/menu_app.py" &
MENU_PID=$!
wait "${MENU_PID}"
