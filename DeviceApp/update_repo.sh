#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
UPDATE_SCRIPT="${REPO_DIR}/update_minitv.sh"

if [[ ! -x "${UPDATE_SCRIPT}" ]]; then
  printf 'ERROR: no se encuentra el actualizador ejecutable: %s\n' "${UPDATE_SCRIPT}" >&2
  exit 1
fi

# Mantener un unico flujo de actualizacion. update_minitv.sh guarda en un stash
# los cambios locales antes del pull, compila la web y reinicia los servicios.
exec "${UPDATE_SCRIPT}"
