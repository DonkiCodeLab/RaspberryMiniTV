#!/usr/bin/env bash
# Installs the official native package. On armhf + aarch64 kernel, adds a
# read-only ARM64 tool environment so seccomp never has to execute ARM32 tools.
set -euo pipefail
[[ "${EUID}" -eq 0 ]] || { echo "Ejecuta con sudo." >&2; exit 1; }
CODEX_PREFIX=/opt/minitv-codex
case "$(uname -m)" in
  aarch64) CODEX_ARCH=arm64; CODEX_TARGET=aarch64-unknown-linux-musl ;;
  x86_64) CODEX_ARCH=x64; CODEX_TARGET=x86_64-unknown-linux-musl ;;
  *) echo "Se necesita un kernel Linux de 64 bits." >&2; exit 1 ;;
esac
install -d -m 0755 "${CODEX_PREFIX}" "${CODEX_PREFIX}/bin"
echo "Consultando la versión de Codex en npm…"
CODEX_VERSION="$(npm view "@openai/codex@${MINITV_CODEX_VERSION:-latest}" version)"
[[ "${CODEX_VERSION}" =~ ^[0-9]+\.[0-9]+\.[0-9]+([-+][a-zA-Z0-9.-]+)?$ ]] || { echo "Versión inválida." >&2; exit 1; }
CODEX_STAGE="$(mktemp -d "${CODEX_PREFIX}/.install-XXXXXX")"
trap 'rm -rf -- "${CODEX_STAGE}"' EXIT
# Keep versioned directories: a running process may still need its sibling helpers.
install -d -m 0755 "${CODEX_PREFIX}/versions"
CODEX_RUNTIME="${CODEX_PREFIX}/versions/${CODEX_VERSION}-linux-${CODEX_ARCH}"
if [[ ! -d "${CODEX_RUNTIME}" ]]; then
  echo "Descargando Codex ${CODEX_VERSION} para ${CODEX_ARCH}…"
  npm pack "@openai/codex@${CODEX_VERSION}-linux-${CODEX_ARCH}" --pack-destination "${CODEX_STAGE}" --silent
  tar -xzf "${CODEX_STAGE}/openai-codex-${CODEX_VERSION}-linux-${CODEX_ARCH}.tgz" -C "${CODEX_STAGE}" --no-same-owner
  "${CODEX_STAGE}/package/vendor/${CODEX_TARGET}/bin/codex" --version
  mv "${CODEX_STAGE}/package" "${CODEX_RUNTIME}"
fi
chmod -R a+rX "${CODEX_RUNTIME}"
ln -sfn "${CODEX_RUNTIME}" "${CODEX_PREFIX}/native"

if [[ "$(getconf LONG_BIT)" == 32 ]]; then
  [[ "${CODEX_ARCH}" == arm64 ]] || { echo "Sistema mixto no compatible." >&2; exit 1; }
  for dependency in debootstrap curl gpg bwrap; do
    if ! command -v "${dependency}" >/dev/null; then
      case "${dependency}" in bwrap) package=bubblewrap ;; gpg) package=gnupg ;; *) package="${dependency}" ;; esac
      apt-get install -y --no-install-recommends "${package}"
    fi
  done
  CODEX_ROOTFS="${CODEX_PREFIX}/rootfs"
  if [[ ! -f "${CODEX_ROOTFS}/.minitv-ready" ]]; then
    if [[ ! -f "${CODEX_ROOTFS}/.minitv-stage2" && ! -f "${CODEX_ROOTFS}/debootstrap/debootstrap" ]]; then
      # Raspbian does not ship the Debian archive keyring. Fetch the Debian 13
      # public signing key from its official HTTPS endpoint; never skip GPG checks.
      curl -fsSL https://ftp-master.debian.org/keys/archive-key-13.asc -o "${CODEX_STAGE}/debian-key.asc"
      gpg --batch --yes --dearmor --output "${CODEX_STAGE}/debian-key.gpg" "${CODEX_STAGE}/debian-key.asc"
      debootstrap --arch=arm64 --foreign --variant=minbase \
        --include=ca-certificates \
        --keyring="${CODEX_STAGE}/debian-key.gpg" trixie "${CODEX_ROOTFS}" https://deb.debian.org/debian
    fi
    install -d "${CODEX_ROOTFS}/usr/sbin"
    printf '#!/bin/sh\nexit 101\n' > "${CODEX_ROOTFS}/usr/sbin/policy-rc.d"
    chmod 0755 "${CODEX_ROOTFS}/usr/sbin/policy-rc.d"
    if [[ ! -f "${CODEX_ROOTFS}/.minitv-stage2" ]]; then
      chroot "${CODEX_ROOTFS}" /debootstrap/debootstrap --second-stage
      touch "${CODEX_ROOTFS}/.minitv-stage2"
    fi
    cp -L /etc/resolv.conf "${CODEX_ROOTFS}/etc/resolv.conf"
    chroot "${CODEX_ROOTFS}" apt-get update
    chroot "${CODEX_ROOTFS}" apt-get install -y --no-install-recommends \
      git python3 python3-venv python3-flask nodejs npm bubblewrap procps
    chroot "${CODEX_ROOTFS}" apt-get clean
    touch "${CODEX_ROOTFS}/.minitv-ready"
  fi
  install -d "${CODEX_ROOTFS}/opt/minitv-codex/native" "${CODEX_ROOTFS}/var/lib/minitv-codex"
  if ! grep -q '^minitv-codex:' "${CODEX_ROOTFS}/etc/passwd"; then
    getent passwd minitv-codex >> "${CODEX_ROOTFS}/etc/passwd"
    getent group minitv-codex >> "${CODEX_ROOTFS}/etc/group"
  fi
  cat > "${CODEX_STAGE}/codex-launcher" <<'SH'
#!/bin/sh
set -eu
exec /usr/bin/bwrap --unshare-user --unshare-pid --die-with-parent --new-session \
  --ro-bind /opt/minitv-codex/rootfs / \
  --ro-bind /opt/minitv-codex/native /opt/minitv-codex/native \
  --bind /var/lib/minitv-codex /var/lib/minitv-codex \
  --ro-bind /etc/resolv.conf /etc/resolv.conf \
  --ro-bind /etc/hosts /etc/hosts \
  --proc /proc --dev /dev --tmpfs /tmp \
  --chdir /var/lib/minitv-codex/workspace \
  --setenv PATH /opt/minitv-codex/native/vendor/aarch64-unknown-linux-musl/bin:/usr/local/bin:/usr/bin:/bin \
  -- /opt/minitv-codex/native/vendor/aarch64-unknown-linux-musl/bin/codex "$@"
SH
  chmod 0755 "${CODEX_STAGE}/codex-launcher"
  mv -f "${CODEX_STAGE}/codex-launcher" "${CODEX_PREFIX}/bin/codex"
else
  ln -sfn "${CODEX_PREFIX}/native/vendor/${CODEX_TARGET}/bin/codex" "${CODEX_PREFIX}/bin/codex"
fi
