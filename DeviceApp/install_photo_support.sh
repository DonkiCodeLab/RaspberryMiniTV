#!/usr/bin/env bash
# Run on the Raspberry: sudo bash DeviceApp/install_photo_support.sh [--faces] [--no-restart]
set -Eeuo pipefail
PHOTO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTO_RUNTIME="/opt/minitv-photo-python"
PHOTO_REQUIREMENTS="${PHOTO_SCRIPT_DIR}/requirements-photos.txt"
PHOTO_FACES=false
PHOTO_RESTART=true
if [[ "${EUID}" -ne 0 ]]; then
  echo 'Ejecuta este instalador con sudo en la Raspberry.' >&2
  exit 1
fi
for option in "$@"; do
  case "${option}" in
    --faces) PHOTO_FACES=true ;;
    --no-restart) PHOTO_RESTART=false ;;
    *) echo 'Uso: install_photo_support.sh [--faces] [--no-restart]' >&2; exit 1 ;;
  esac
done
[[ "$(uname -s)" == Linux ]] || { echo 'Este instalador se ejecuta en la Raspberry con Linux.' >&2; exit 1; }
exec 8>/run/minitv-photo-install.lock
flock -n 8 || { echo 'Ya hay una instalación de Fotos en curso.' >&2; exit 1; }

photo_ready() {
  [[ -x "${PHOTO_RUNTIME}/bin/python" ]] || return 1
  "${PHOTO_RUNTIME}/bin/python" -c 'import PIL, pillow_heif, flask' || return 1
  if "${PHOTO_FACES}"; then
    "${PHOTO_RUNTIME}/bin/python" "${PHOTO_SCRIPT_DIR}/photo_faces.py" --check || return 1
  fi
}

if ! photo_ready; then
  apt-get update
  apt-get install -y python3-venv python3-dev libheif-dev libjpeg-dev zlib1g-dev
  if "${PHOTO_FACES}"; then
    apt-get install -y build-essential cmake libopenblas-dev
  fi
  # Keep the API's distribution packages (Flask, etc.) and isolate extra photo packages.
  /usr/bin/python3 -m venv --system-site-packages "${PHOTO_RUNTIME}"
  if "${PHOTO_FACES}"; then
    PHOTO_REQUIREMENTS="${PHOTO_SCRIPT_DIR}/requirements-photo-faces.txt"
  fi
  echo 'Instalando el motor local. La primera compilación puede tardar; se usa un solo proceso y prioridad baja.'
  # dlib explicitly reads CMAKE_BUILD_PARALLEL_LEVEL. Do not compile on all cores.
  env CMAKE_BUILD_PARALLEL_LEVEL=1 OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 \
    nice -n 15 "${PHOTO_RUNTIME}/bin/python" -m pip install -r "${PHOTO_REQUIREMENTS}"
  photo_ready
fi
if "${PHOTO_FACES}"; then
  echo 'Motor local y modelos comprobados. No se ha iniciado ningún análisis.'
fi
if [[ ! -f /etc/systemd/system/minitv-api.service ]]; then
  echo 'Soporte instalado. Instala minitv-api.service y vuelve a ejecutar este script.'
  exit 0
fi
install -d /etc/systemd/system/minitv-api.service.d
cat > /etc/systemd/system/minitv-api.service.d/photos.conf <<EOF
[Service]
ExecStart=
ExecStart=${PHOTO_RUNTIME}/bin/python "${PHOTO_SCRIPT_DIR}/control_api.py"
EOF
systemctl daemon-reload
if "${PHOTO_RESTART}"; then
  systemctl restart minitv-api.service
  systemctl is-active --quiet minitv-api.service
fi
echo 'Soporte de fotos preparado. Abre Fotos → Personas y pulsa Analizar; Pausar interrumpe el análisis y conserva el avance.'
