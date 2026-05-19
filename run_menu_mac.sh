#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_BIN=""
PROJECT_VENV="${SCRIPT_DIR}/.venv-mac-preview"
LOG_FILE="/tmp/minitvapp-menu-mac.log"

cd "${SCRIPT_DIR}"

echo "MiniTV: preparando preview del menu pygame para macOS..."

for candidate in python3.12 python3.11 python3; do
  if command -v "${candidate}" >/dev/null 2>&1; then
    PYTHON_BIN="$(command -v "${candidate}")"
    break
  fi
done

if [ -z "${PYTHON_BIN}" ]; then
  echo "No se ha encontrado un Python compatible en el sistema."
  echo "Instala Python 3.12 o 3.11 y vuelve a intentarlo."
  read -r -p "Pulsa Enter para cerrar..."
  exit 1
fi

echo "Usando Python: ${PYTHON_BIN}"

if [ -x "${PROJECT_VENV}/bin/python" ]; then
  VENV_VERSION="$("${PROJECT_VENV}/bin/python" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  PYTHON_VERSION="$("${PYTHON_BIN}" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')"
  if [ "${VENV_VERSION}" != "${PYTHON_VERSION}" ]; then
    echo "Recreando entorno preview para usar Python ${PYTHON_VERSION}..."
    rm -rf "${PROJECT_VENV}"
  fi
fi

if [ ! -d "${PROJECT_VENV}" ]; then
  echo "Creando entorno virtual en ${PROJECT_VENV}..."
  "${PYTHON_BIN}" -m venv "${PROJECT_VENV}"
fi

# shellcheck disable=SC1091
source "${PROJECT_VENV}/bin/activate"

if ! python -c "import pygame" >/dev/null 2>&1; then
  echo "Instalando pygame en el entorno virtual..."
  python -m pip install --upgrade pip
  python -m pip install pygame
fi

export MINITV_DESKTOP_PREVIEW=1
export MINITV_DESKTOP_PREVIEW_WIDTH="${MINITV_DESKTOP_PREVIEW_WIDTH:-800}"
export MINITV_DESKTOP_PREVIEW_HEIGHT="${MINITV_DESKTOP_PREVIEW_HEIGHT:-480}"

echo "Lanzando menu en ventana ${MINITV_DESKTOP_PREVIEW_WIDTH}x${MINITV_DESKTOP_PREVIEW_HEIGHT}..."
echo "Log: ${LOG_FILE}"

python DeviceApp/menu_app.py >>"${LOG_FILE}" 2>&1 || {
  status=$?
  echo
  echo "El menu se ha cerrado con error (${status})."
  echo "Consulta el log en ${LOG_FILE}"
  read -r -p "Pulsa Enter para cerrar..."
  exit "${status}"
}
