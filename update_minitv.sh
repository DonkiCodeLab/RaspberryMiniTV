#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="${MINITV_UPDATE_ROOT:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"
WEB_DIR="${SCRIPT_DIR}/WebApp"
NEOCD_CORE_DIR="/usr/lib/arm-linux-gnueabihf/libretro"
NEOCD_CORE_PATH="${NEOCD_CORE_DIR}/neocd_libretro.so"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

# The systemd job owns privileged installation/restarts. Keep Git credentials,
# repository files and npm lifecycle scripts under the repository owner's user.
repo_command() {
  if [[ "${EUID}" -eq 0 ]]; then
    local update_user="${MINITV_UPDATE_USER:-$(stat -c %U "${SCRIPT_DIR}/.git")}"
    local update_home
    update_home="$(getent passwd "${update_user}" | cut -d: -f6)"
    [[ -n "${update_home}" ]] || fail "No se encuentra el usuario del repositorio."
    runuser -u "${update_user}" -- env HOME="${update_home}" "$@"
  else
    command "$@"
  fi
}
git() { repo_command git "$@"; }
npm() { repo_command npm "$@"; }

type -P git >/dev/null 2>&1 || fail "git no está instalado."
[[ -d "${SCRIPT_DIR}/.git" ]] || fail "El script debe estar dentro del repositorio RaspberryMiniTV."
repo_command touch "${SCRIPT_DIR}/.git/minitv-update.lock"
exec 9>"${SCRIPT_DIR}/.git/minitv-update.lock"
flock -n 9 || fail "Ya hay una actualización en curso."

# MuPDF distributed by Raspberry Pi OS uses an X11/OpenGL window and exits
# immediately in MiniTV's dedicated Wayland session. Evince has a native GTK
# Wayland backend and can display PDFs without leaving a black screen.
if ! command -v evince >/dev/null 2>&1; then
  log "Instalando el visor PDF compatible con Wayland"
  sudo apt-get update
  sudo apt-get install -y evince
fi

cd "${SCRIPT_DIR}"

# Exclude runtime credentials even when upgrading a checkout whose .gitignore
# predates these files. They belong to the device and must never enter a stash.
UPDATE_PATHS=(. ':(exclude)DeviceApp/user_settings.json' ':(exclude)DeviceApp/subtitle_settings.json' ':(exclude)DeviceApp/game_settings.json')
LOCAL_CHANGES="$(git status --porcelain -- "${UPDATE_PATHS[@]}")"
if [[ -n "${LOCAL_CHANGES}" ]]; then
  STASH_NAME="minitv-local-backup-$(date +%Y%m%d-%H%M%S)"
  log "Guardando temporalmente los cambios locales (${STASH_NAME})"
  git stash push --include-untracked -m "${STASH_NAME}" -- "${UPDATE_PATHS[@]}"
fi

if [[ ! -f "${NEOCD_CORE_PATH}" ]]; then
  command -v curl >/dev/null 2>&1 || fail "curl no está instalado y no se puede instalar el núcleo NeoCD."
  command -v unzip >/dev/null 2>&1 || fail "unzip no está instalado y no se puede instalar el núcleo NeoCD."
  NEOCD_TEMP_DIR="$(mktemp -d)"
  log "Instalando el núcleo oficial NeoCD para RetroArch"
  curl --fail --location --output "${NEOCD_TEMP_DIR}/neocd.zip" \
    "https://buildbot.libretro.com/nightly/linux/armv7-neon-hf/latest/neocd_libretro.so.zip"
  unzip -q "${NEOCD_TEMP_DIR}/neocd.zip" -d "${NEOCD_TEMP_DIR}"
  sudo install -m 0644 "${NEOCD_TEMP_DIR}/neocd_libretro.so" "${NEOCD_CORE_PATH}"
  rm -rf "${NEOCD_TEMP_DIR}"
fi

mkdir -p "${HOME}/.config/retroarch/system/neocd"

log "Descargando la última versión de main"
git fetch origin main
git switch main
git pull --ff-only origin main

# Shared CBR/CBZ rendering for browser previews, covers and the Wayland reader.
if ! command -v unrar >/dev/null 2>&1 || ! command -v bsdtar >/dev/null 2>&1 || ! command -v chromium >/dev/null 2>&1 || ! /usr/bin/python3 -c 'import fitz; import PIL' >/dev/null 2>&1; then
  log "Instalando el soporte de cómics CBR y CBZ"
  bash "${SCRIPT_DIR}/DeviceApp/install_comic_support.sh"
fi

if ! command -v ffprobe >/dev/null 2>&1; then
  log "Instalando la detección de pistas de subtítulos"
  sudo apt-get update
  sudo apt-get install -y ffmpeg
fi

log "Preparando el motor de descargas torrent"
bash "${SCRIPT_DIR}/DeviceApp/install_torrent_support.sh"

if [[ -f "${WEB_DIR}/package.json" ]]; then
  type -P npm >/dev/null 2>&1 || fail "npm no está instalado y no se puede compilar la web."

  log "Preparando y compilando la web"
  cd "${WEB_DIR}"
  # package-lock.json no forma parte del repositorio; sincronizar siempre las
  # dependencias declaradas para que las actualizaciones puedan añadir paquetes.
  npm install
  npm run build
  cd "${SCRIPT_DIR}"
fi

log "Reiniciando los servicios existentes de la web y el menú"
sudo bash "${SCRIPT_DIR}/DeviceApp/install_update_service.sh"
sudo systemctl restart minitv-api.service minitv-menu.service

sleep 3
systemctl is-active --quiet minitv-api.service || fail "La API no ha arrancado correctamente."
systemctl is-active --quiet minitv-menu.service || fail "El menú no ha arrancado correctamente."

log "Estado de los servicios"
sudo systemctl --no-pager --full status minitv-api.service minitv-menu.service || true

printf '\nMiniTV actualizado correctamente al commit %s.\n' "$(git rev-parse --short HEAD)"
