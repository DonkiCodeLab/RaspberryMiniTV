#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VIDEOS_DIR="${SCRIPT_DIR}/videos"
LOG_DIR="/tmp/simpsonstv-player-tests"
mkdir -p "${LOG_DIR}"

usage() {
  cat <<'EOF'
Uso:
  ./test_players.sh <omxplayer|mpv|vlc|all> [ruta_al_video]

Ejemplos:
  ./test_players.sh mpv
  ./test_players.sh vlc RaspberryPiTV/videos/demo.mp4
  ./test_players.sh all

Notas:
  - Si no pasas un video, se usa el primer archivo compatible dentro de RaspberryPiTV/videos.
  - En Raspberry Pi Zero 2, `mpv` suele ser mejor candidato que `vlc` para seguir jugueteando con UI.
  - `vlc` y `mpv` no encajan igual de bien que `omxplayer` con el flujo actual por framebuffer/tty.
EOF
}

pick_video() {
  local explicit_path="${1:-}"
  if [[ -n "${explicit_path}" ]]; then
    if [[ ! -f "${explicit_path}" ]]; then
      echo "No existe el video: ${explicit_path}" >&2
      exit 1
    fi
    printf '%s\n' "${explicit_path}"
    return
  fi

  local found
  found="$(find "${VIDEOS_DIR}" -type f \( -iname '*.mp4' -o -iname '*.m4v' -o -iname '*.mov' -o -iname '*.mkv' \) | sort | head -n 1 || true)"
  if [[ -z "${found}" ]]; then
    echo "No he encontrado ningun video en ${VIDEOS_DIR}" >&2
    echo "Copia ahi un .mp4/.m4v/.mov/.mkv o pasa la ruta manualmente." >&2
    exit 1
  fi
  printf '%s\n' "${found}"
}

require_command() {
  local cmd="$1"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Falta el comando '${cmd}'." >&2
    return 1
  fi
}

print_header() {
  local title="$1"
  printf '\n===== %s =====\n' "${title}"
}

run_logged() {
  local name="$1"
  shift

  local log_file="${LOG_DIR}/${name}.log"
  print_header "${name}"
  echo "Log: ${log_file}"
  echo "Comando: $*"

  set +e
  /usr/bin/time -f 'elapsed=%E cpu=%P maxrss=%MKB exit=%x' "$@" >"${log_file}" 2>&1
  local status=$?
  set -e

  tail -n 20 "${log_file}" || true
  echo "Estado final: ${status}"
  return "${status}"
}

run_omxplayer() {
  local video="$1"
  require_command omxplayer || return 1
  run_logged "omxplayer" omxplayer --no-osd --aspect-mode fill "${video}"
}

run_mpv() {
  local video="$1"
  require_command mpv || return 1

  local -a cmd=(
    mpv
    --fullscreen
    --hwdec=auto-safe
    --no-osd-bar
    --keep-open=no
    --audio-display=no
  )

  if [[ -z "${DISPLAY:-}" && -z "${WAYLAND_DISPLAY:-}" ]]; then
    cmd+=(--vo=gpu --gpu-context=drm)
  fi

  cmd+=("${video}")
  run_logged "mpv" "${cmd[@]}"
}

run_vlc() {
  local video="$1"
  require_command cvlc || return 1

  local -a cmd=(
    cvlc
    --fullscreen
    --play-and-exit
    --no-video-title-show
    --quiet
  )

  cmd+=("${video}")
  run_logged "vlc" "${cmd[@]}"
}

main() {
  if [[ "${1:-}" == "" || "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
    usage
    exit 0
  fi

  local player="$1"
  shift || true
  local video
  video="$(pick_video "${1:-}")"

  echo "Video seleccionado: ${video}"
  echo "Logs en: ${LOG_DIR}"

  case "${player}" in
    omxplayer)
      run_omxplayer "${video}"
      ;;
    mpv)
      run_mpv "${video}"
      ;;
    vlc)
      run_vlc "${video}"
      ;;
    all)
      run_omxplayer "${video}" || true
      run_mpv "${video}" || true
      run_vlc "${video}" || true
      ;;
    *)
      usage
      exit 1
      ;;
  esac
}

main "$@"
