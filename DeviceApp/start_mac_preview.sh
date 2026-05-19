#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

export MINITV_DESKTOP_PREVIEW=1
export MINITV_DESKTOP_PREVIEW_WIDTH="${MINITV_DESKTOP_PREVIEW_WIDTH:-800}"
export MINITV_DESKTOP_PREVIEW_HEIGHT="${MINITV_DESKTOP_PREVIEW_HEIGHT:-480}"

exec "${REPO_DIR}/run_menu_mac.sh"
