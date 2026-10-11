#!/usr/bin/env bash
# Run on the Raspberry: sudo bash DeviceApp/install_codex_support.sh [--reset-password]
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Ejecuta este instalador con sudo." >&2
  exit 1
fi
if [[ "$(uname -s)" != Linux ]]; then
  echo "Codex requiere Linux. Comprueba el sistema de la Raspberry." >&2
  exit 1
fi
case "$(uname -m)" in aarch64|x86_64) ;; *) echo "Arquitectura no compatible con este instalador." >&2; exit 1 ;; esac
if ! command -v node >/dev/null || ! command -v npm >/dev/null || ! node -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 20 ? 0 : 1)'; then
  echo "Instala Node.js 20 o superior y npm para todos los usuarios y vuelve a ejecutar este instalador." >&2
  exit 1
fi
for dependency in git python3 runuser useradd; do
  command -v "${dependency}" >/dev/null || { echo "Falta ${dependency}." >&2; exit 1; }
done
if [[ "${1:-}" != "" && "${1}" != --reset-password ]]; then
  echo "Uso: sudo bash DeviceApp/install_codex_support.sh [--reset-password]" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(dirname "${SCRIPT_DIR}")"
CODEX_USER=minitv-codex
CODEX_DATA=/var/lib/minitv-codex
CODEX_WORKSPACE="${CODEX_DATA}/workspace"
CODEX_PREFIX=/opt/minitv-codex

if ! id "${CODEX_USER}" >/dev/null 2>&1; then
  useradd --system --user-group --create-home --home-dir "${CODEX_DATA}" --shell /usr/sbin/nologin "${CODEX_USER}"
fi
if [[ "$(id -u "${CODEX_USER}")" == 0 ]]; then
  echo "El usuario de Codex no puede ser root." >&2
  exit 1
fi
install -d -m 0700 -o "${CODEX_USER}" -g "${CODEX_USER}" "${CODEX_DATA}" "${CODEX_DATA}/.codex"
if [[ ! -e "${CODEX_WORKSPACE}" ]]; then
  # A standalone clone: no shared objects/worktree metadata with the live repository.
  git -c safe.directory="${REPO_DIR}" clone --no-hardlinks -- "${REPO_DIR}" "${CODEX_WORKSPACE}"
  chown -R "${CODEX_USER}:${CODEX_USER}" "${CODEX_WORKSPACE}"
  runuser -u "${CODEX_USER}" -- git -C "${CODEX_WORKSPACE}" remote remove origin
  runuser -u "${CODEX_USER}" -- git -C "${CODEX_WORKSPACE}" switch -c codex/dashboard
fi
bash "${SCRIPT_DIR}/prepare_codex_runtime.sh"
runuser -u "${CODEX_USER}" -- env HOME="${CODEX_DATA}" CODEX_HOME="${CODEX_DATA}/.codex" \
  "${CODEX_PREFIX}/bin/codex" --version

python3 - "${1:-}" <<'PY'
import hashlib
import json
import os
from pathlib import Path
import secrets
import sys

path = Path('/etc/minitv-codex.json')
reset = sys.argv[1] == '--reset-password'
config = json.loads(path.read_text()) if path.exists() else {}
password = None
if reset or not config.get('passwordHash'):
    password = secrets.token_urlsafe(24)
    salt = secrets.token_hex(16)
    config.update(salt=salt, passwordHash=hashlib.scrypt(password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1).hex())
config.update(user='minitv-codex', home='/var/lib/minitv-codex', workspace='/var/lib/minitv-codex/workspace',
              binary='/opt/minitv-codex/bin/codex')
temporary = path.with_suffix('.tmp')
fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
with os.fdopen(fd, 'w') as out:
    json.dump(config, out, indent=2)
os.chmod(temporary, 0o600)
os.replace(temporary, path)
if password:
    print('\nGuarda esta clave de administrador de Codex; no es el PIN de la MiniTV:\n')
    print(password)
    print('\nSolo se guarda su hash. Puedes generar otra con --reset-password.\n')
else:
    print('Se conserva la clave de administrador de Codex existente.')
PY

if systemctl is-active --quiet minitv-api.service; then
  systemctl restart minitv-api.service
fi
echo "Abre Dashboard → Codex, desbloquea el panel y pulsa Conectar ChatGPT."
echo "Copia de desarrollo: ${CODEX_WORKSPACE} (se conserva al reinstalar)."
