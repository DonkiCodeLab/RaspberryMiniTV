#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "${SCRIPT_DIR}"

export MINITV_DESKTOP_PREVIEW=1
export MINITV_DESKTOP_PREVIEW_WIDTH="${MINITV_DESKTOP_PREVIEW_WIDTH:-800}"
export MINITV_DESKTOP_PREVIEW_HEIGHT="${MINITV_DESKTOP_PREVIEW_HEIGHT:-480}"

python3 menu_app.py
