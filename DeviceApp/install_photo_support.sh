#!/usr/bin/env bash
# Run on the Raspberry: sudo bash DeviceApp/install_photo_support.sh [--faces]
set -Eeuo pipefail
PHOTO_SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PHOTO_RUNTIME="/opt/minitv-photo-python"
PHOTO_REQUIREMENTS="${PHOTO_SCRIPT_DIR}/requirements-photos.txt"
if [[ "${EUID}" -ne 0 ]]; then
  echo 'Ejecuta este instalador con sudo en la Raspberry.' >&2
  exit 1
fi
if [[ "${1:-}" != '' && "${1:-}" != '--faces' ]]; then
  echo 'Uso: install_photo_support.sh [--faces]' >&2
  exit 1
fi
apt-get update
apt-get install -y python3-venv python3-dev libheif-dev libjpeg-dev zlib1g-dev
if [[ "${1:-}" == '--faces' ]]; then
  apt-get install -y build-essential cmake libopenblas-dev
  PHOTO_REQUIREMENTS="${PHOTO_SCRIPT_DIR}/requirements-photo-faces.txt"
fi
# Keep the API's distribution packages (Flask, etc.) and isolate extra photo packages.
/usr/bin/python3 -m venv --system-site-packages "${PHOTO_RUNTIME}"
"${PHOTO_RUNTIME}/bin/python" -m pip install -r "${PHOTO_REQUIREMENTS}"
"${PHOTO_RUNTIME}/bin/python" -c 'import PIL, pillow_heif, flask'
if [[ "${1:-}" == '--faces' ]]; then
  "${PHOTO_RUNTIME}/bin/python" -c 'import face_recognition'
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
systemctl restart minitv-api.service
echo 'Soporte de fotos instalado. Abre Fotos → Personas y pulsa Analizar; puedes pausar y continuar el análisis.'
