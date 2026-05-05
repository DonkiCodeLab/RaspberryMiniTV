#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SYSTEMD_DIR="/etc/systemd/system"
VIDEOS_DIR="${SCRIPT_DIR}/videos"

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Ejecuta este script con sudo."
    exit 1
  fi
}

install_service() {
  local service_name="$1"
  install -m 0644 "${SCRIPT_DIR}/services/${service_name}" "${SYSTEMD_DIR}/${service_name}"
}

require_root

mkdir -p "${VIDEOS_DIR}"

systemctl stop simpsonstv-api.service tvbutton.service 2>/dev/null || true
systemctl stop simpsonstv-menu.service 2>/dev/null || true
systemctl stop simpsonstv-startup-guard.service 2>/dev/null || true
systemctl disable simpsonstv-api.service tvbutton.service simpsonstv-menu.service simpsonstv-startup-guard.service 2>/dev/null || true

install_service "simpsonstv-api.service"
install_service "simpsonstv-menu.service"

rm -f "${SYSTEMD_DIR}/simpsonstv-startup-guard.service"

systemctl daemon-reload
systemctl enable simpsonstv-api.service simpsonstv-menu.service
systemctl mask tvbutton.service 2>/dev/null || true
systemctl restart simpsonstv-api.service simpsonstv-menu.service

echo "Servicios instalados y reiniciados correctamente."
echo "Puedes revisar su estado con:"
echo "  sudo systemctl status simpsonstv-api.service"
echo "  sudo systemctl status simpsonstv-menu.service"
echo "  sudo systemctl status tvbutton.service"
