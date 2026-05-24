#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"
SYSTEMD_DIR="/etc/systemd/system"
POLKIT_RULES_DIR="/etc/polkit-1/rules.d"
VIDEOS_DIR="${REPO_DIR}/MultimediaContent/Videos"
GAMES_DIR="${REPO_DIR}/MultimediaContent/Games"

NEW_SERVICES=(
  minitv-api.service
  minitv-menu.service
)

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    echo "Ejecuta este script con sudo."
    exit 1
  fi
}

install_service() {
  local service_name="$1"
  sed "s#__DEVICE_APP_DIR__#${SCRIPT_DIR}#g" \
    "${SCRIPT_DIR}/services/${service_name}" >"${SYSTEMD_DIR}/${service_name}"
  chmod 0644 "${SYSTEMD_DIR}/${service_name}"
}

install_networkmanager_policy() {
  local menu_user="${SUDO_USER:-donkicodelab}"
  mkdir -p "${POLKIT_RULES_DIR}"
  cat >"${POLKIT_RULES_DIR}/49-minitv-networkmanager.rules" <<EOF
polkit.addRule(function(action, subject) {
  var allowedActions = [
    "org.freedesktop.NetworkManager.enable-disable-wifi",
    "org.freedesktop.NetworkManager.network-control",
    "org.freedesktop.NetworkManager.settings.modify.system",
    "org.freedesktop.NetworkManager.wifi.scan"
  ];

  if (subject.user == "${menu_user}" && allowedActions.indexOf(action.id) >= 0) {
    return polkit.Result.YES;
  }
});
EOF
  chmod 0644 "${POLKIT_RULES_DIR}/49-minitv-networkmanager.rules"
}

require_root

mkdir -p "${VIDEOS_DIR}/Movies" "${VIDEOS_DIR}/TVShows" "${GAMES_DIR}"

systemctl stop "${NEW_SERVICES[@]}" 2>/dev/null || true
systemctl disable "${NEW_SERVICES[@]}" 2>/dev/null || true

install_service "minitv-api.service"
install_service "minitv-menu.service"
install_networkmanager_policy

rm -f "${SYSTEMD_DIR}/minitv-button.service"

systemctl daemon-reload
systemctl enable "${NEW_SERVICES[@]}"
systemctl restart "${NEW_SERVICES[@]}"

echo "Servicios instalados y reiniciados correctamente."
echo "Puedes revisar su estado con:"
echo "  sudo systemctl status minitv-api.service"
echo "  sudo systemctl status minitv-menu.service"
