#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${MINITV_REPO_DIR:-$(dirname "${SCRIPT_DIR}")}"
if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este instalador con sudo." >&2
  exit 1
fi
UPDATE_USER="${MINITV_UPDATE_USER:-$(stat -c %U "${REPO_DIR}/.git")}"
UPDATE_HOME="$(getent passwd "${UPDATE_USER}" | cut -d: -f6)"
[[ -n "${UPDATE_HOME}" ]] || exit 1
sed -e "s#__REPO_DIR__#${REPO_DIR}#g" \
    -e "s#__DEVICE_APP_DIR__#${SCRIPT_DIR}#g" \
    -e "s#__UPDATE_USER__#${UPDATE_USER}#g" \
    -e "s#__UPDATE_HOME__#${UPDATE_HOME}#g" \
    "${SCRIPT_DIR}/services/minitv-update.service" > /etc/systemd/system/minitv-update.service
chmod 0644 /etc/systemd/system/minitv-update.service
systemctl daemon-reload
