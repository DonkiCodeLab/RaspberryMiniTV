#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_DIR="$(dirname "${SCRIPT_DIR}")"
RASPBERRY_REPO_DIR="/home/donkicodelab/RaspberryMiniTV"
REPO_DIR="${MINITV_REPO_DIR:-}"
if [[ -z "${REPO_DIR}" ]]; then
  if [[ -d "${RASPBERRY_REPO_DIR}" ]]; then
    REPO_DIR="${RASPBERRY_REPO_DIR}"
  else
    REPO_DIR="${DEFAULT_REPO_DIR}"
  fi
fi
SYSTEMD_DIR="/etc/systemd/system"
VIDEOS_DIR="${REPO_DIR}/MultimediaContent/Videos"
GAMES_DIR="${REPO_DIR}/MultimediaContent/Games"
BOOKS_DIR="${REPO_DIR}/MultimediaContent/Books"
KODI_USER="${MINITV_KODI_USER:-donkicodelab}"
KODI_HOME="$(getent passwd "${KODI_USER}" | cut -d: -f6)"
KODI_ADDON_SOURCE="${SCRIPT_DIR}/kodi/service.minitv.player"
KODI_ADDON_DIR="${KODI_HOME}/.kodi/addons/service.minitv.player"
KODI_ASOUNDRC_SOURCE="${SCRIPT_DIR}/kodi/asoundrc.minitv"

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
  sed \
    -e "s#__DEVICE_APP_DIR__#${SCRIPT_DIR}#g" \
    -e "s#__REPO_DIR__#${REPO_DIR}#g" \
    "${SCRIPT_DIR}/services/${service_name}" >"${SYSTEMD_DIR}/${service_name}"
  chmod 0644 "${SYSTEMD_DIR}/${service_name}"
}

require_root

if [[ -z "${KODI_HOME}" ]]; then
  echo "No se encuentra el usuario de Kodi: ${KODI_USER}" >&2
  exit 1
fi

mkdir -p "${VIDEOS_DIR}/Movies" "${VIDEOS_DIR}/TVShows" "${GAMES_DIR}" "${BOOKS_DIR}"

mkdir -p "${KODI_ADDON_DIR}"
cp "${KODI_ADDON_SOURCE}/addon.xml" "${KODI_ADDON_SOURCE}/service.py" "${KODI_ADDON_DIR}/"
chown -R "${KODI_USER}:${KODI_USER}" "${KODI_HOME}/.kodi"

if [[ ! -f "${KODI_HOME}/.asoundrc" ]]; then
  cp "${KODI_ASOUNDRC_SOURCE}" "${KODI_HOME}/.asoundrc"
  chown "${KODI_USER}:${KODI_USER}" "${KODI_HOME}/.asoundrc"
elif ! grep -q '^pcm\.minitv_kodi ' "${KODI_HOME}/.asoundrc"; then
  printf '\n' >>"${KODI_HOME}/.asoundrc"
  cat "${KODI_ASOUNDRC_SOURCE}" >>"${KODI_HOME}/.asoundrc"
fi

systemctl stop "${NEW_SERVICES[@]}" 2>/dev/null || true

install_service "minitv-api.service"
install_service "minitv-menu.service"

systemctl daemon-reload
systemctl enable "${NEW_SERVICES[@]}"
systemctl restart minitv-api.service
systemctl restart minitv-menu.service

echo "Servicios API y menu instalados y reiniciados correctamente."
echo "Puedes revisar su estado con:"
echo "  sudo systemctl status minitv-api.service"
echo "  sudo systemctl status minitv-menu.service"
