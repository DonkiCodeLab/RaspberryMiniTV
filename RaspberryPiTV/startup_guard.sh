#!/usr/bin/env bash

set -euo pipefail

SKIP_FLAG="/run/tvsimpsons/skip_autostart"
TTY_PATH="${TTY_PATH:-/dev/tty1}"
WAIT_SECONDS="${WAIT_SECONDS:-5}"
REPO_DIR="${REPO_DIR:-/home/donkikochan/TvSimpsonsApp}"

mkdir -p "$(dirname "${SKIP_FLAG}")"
rm -f "${SKIP_FLAG}"

if [ ! -e "${TTY_PATH}" ]; then
  exit 0
fi

{
  echo
  echo "SimpsonsTV: actualizando repositorio con git pull en ${REPO_DIR}..."
} >"${TTY_PATH}"

if [ -d "${REPO_DIR}/.git" ]; then
  if git -C "${REPO_DIR}" pull >"${TTY_PATH}" 2>&1; then
    echo "SimpsonsTV: git pull completado." >"${TTY_PATH}"
  else
    echo "SimpsonsTV: git pull ha fallado; se continua con el arranque." >"${TTY_PATH}"
  fi
else
  echo "SimpsonsTV: no se encontro un repositorio git en ${REPO_DIR}; se continua con el arranque." >"${TTY_PATH}"
fi

{
  echo
  echo "SimpsonsTV: pulsa 'y' en los proximos ${WAIT_SECONDS} segundos para cancelar el arranque automatico del menu y la web."
  printf "Esperando tecla... "
} >"${TTY_PATH}"

if IFS= read -r -n 1 -t "${WAIT_SECONDS}" answer <"${TTY_PATH}"; then
  printf "\n" >"${TTY_PATH}"
  if [ "${answer}" = "y" ] || [ "${answer}" = "Y" ]; then
    touch "${SKIP_FLAG}"
    echo "SimpsonsTV: arranque automatico cancelado para este inicio." >"${TTY_PATH}"
    exit 0
  fi
fi

printf "\nSimpsonsTV: continuando con el arranque automatico.\n" >"${TTY_PATH}"
