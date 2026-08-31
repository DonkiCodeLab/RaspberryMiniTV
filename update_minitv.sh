#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
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

command -v git >/dev/null 2>&1 || fail "git no está instalado."
[[ -d "${SCRIPT_DIR}/.git" ]] || fail "El script debe estar dentro del repositorio RaspberryMiniTV."

# MuPDF distributed by Raspberry Pi OS uses an X11/OpenGL window and exits
# immediately in MiniTV's dedicated Wayland session. Evince has a native GTK
# Wayland backend and can display PDFs without leaving a black screen.
if ! command -v evince >/dev/null 2>&1; then
  log "Instalando el visor PDF compatible con Wayland"
  sudo apt-get update
  sudo apt-get install -y evince
fi

cd "${SCRIPT_DIR}"

LOCAL_CHANGES="$(git status --porcelain)"
if [[ -n "${LOCAL_CHANGES}" ]]; then
  STASH_NAME="minitv-local-backup-$(date +%Y%m%d-%H%M%S)"
  log "Guardando temporalmente los cambios locales (${STASH_NAME})"
  git stash push --include-untracked -m "${STASH_NAME}"
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

if [[ -f "${WEB_DIR}/package.json" ]]; then
  command -v npm >/dev/null 2>&1 || fail "npm no está instalado y no se puede compilar la web."

  log "Preparando y compilando la web"
  cd "${WEB_DIR}"
  # package-lock.json no forma parte del repositorio; sincronizar siempre las
  # dependencias declaradas para que las actualizaciones puedan añadir paquetes.
  npm install
  npm run build
  cd "${SCRIPT_DIR}"
fi

log "Reiniciando los servicios existentes de la web y el menú"
sudo systemctl restart minitv-api.service minitv-menu.service

log "Estado de los servicios"
sudo systemctl --no-pager --full status minitv-api.service minitv-menu.service || true

printf '\nMiniTV actualizado correctamente al commit %s.\n' "$(git rev-parse --short HEAD)"
