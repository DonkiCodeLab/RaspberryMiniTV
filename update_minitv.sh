#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="${SCRIPT_DIR}/WebApp"
DEVICE_DIR="${SCRIPT_DIR}/DeviceApp"

log() {
  printf '\n==> %s\n' "$1"
}

fail() {
  printf '\nERROR: %s\n' "$1" >&2
  exit 1
}

command -v git >/dev/null 2>&1 || fail "git no está instalado."
[[ -d "${SCRIPT_DIR}/.git" ]] || fail "El script debe estar dentro del repositorio RaspberryMiniTV."

cd "${SCRIPT_DIR}"

LOCAL_CHANGES="$(git status --porcelain)"
if [[ -n "${LOCAL_CHANGES}" ]]; then
  STASH_NAME="minitv-local-backup-$(date +%Y%m%d-%H%M%S)"
  log "Guardando temporalmente los cambios locales (${STASH_NAME})"
  git stash push --include-untracked -m "${STASH_NAME}"
fi

log "Descargando la última versión de main"
git fetch origin main
git switch main
git pull --ff-only origin main

if [[ -f "${WEB_DIR}/package.json" ]]; then
  command -v npm >/dev/null 2>&1 || fail "npm no está instalado y no se puede compilar la web."

  log "Preparando y compilando la web"
  cd "${WEB_DIR}"
  if [[ ! -d node_modules ]]; then
    npm ci
  fi
  npm run build
  cd "${SCRIPT_DIR}"
fi

log "Instalando y reiniciando la web y el menú"
sudo /usr/bin/env MINITV_REPO_DIR="${SCRIPT_DIR}" /bin/bash "${DEVICE_DIR}/install_services.sh"

log "Estado de los servicios"
sudo systemctl --no-pager --full status minitv-api.service minitv-menu.service || true

printf '\nMiniTV actualizado correctamente al commit %s.\n' "$(git rev-parse --short HEAD)"
