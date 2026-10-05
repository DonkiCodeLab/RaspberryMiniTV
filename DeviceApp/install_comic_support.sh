#!/usr/bin/env bash
set -Eeuo pipefail

sudo apt-get update
sudo apt-get install -y libarchive-tools python3-fitz evince
if ! command -v unrar >/dev/null 2>&1; then
  # Raspberry Pi OS armhf may not provide the non-free UnRAR package.
  # Build the official decoder: libarchive cannot decode all RAR filters.
  sudo apt-get install -y build-essential curl ca-certificates
  comic_build_dir="$(mktemp -d)"
  trap 'rm -rf "$comic_build_dir"' EXIT
  curl --fail --location --output "$comic_build_dir/source.tar.gz" \
    https://www.rarlab.com/rar/unrarsrc-7.3.1.tar.gz
  printf '%s  %s\n' \
    634900842a3737d9cc15bbcc71d4c74cc713437e0bca296a573424fe5f2660ab \
    "$comic_build_dir/source.tar.gz" | sha256sum --check -
  tar -xzf "$comic_build_dir/source.tar.gz" -C "$comic_build_dir"
  make -C "$comic_build_dir/unrar" -j2
  sudo install -m 0755 "$comic_build_dir/unrar/unrar" /usr/local/bin/unrar
fi
