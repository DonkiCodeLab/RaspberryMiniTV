#!/usr/bin/env bash
# Run on the Raspberry. Installs shaping and fonts used by all menu languages.
set -Eeuo pipefail
[[ "$(uname -s)" == Linux ]] || exit 0
language_fonts_ready() {
  /usr/bin/python3 -c 'import cairo, gi; gi.require_version("PangoCairo", "1.0"); from gi.repository import PangoCairo; PangoCairo.create_layout(cairo.Context(cairo.ImageSurface(cairo.FORMAT_ARGB32, 1, 1)))' 2>/dev/null || return 1
  for package in fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji; do
    [[ "$(dpkg-query -W -f='${Status}' "$package" 2>/dev/null)" == 'install ok installed' ]] || return 1
  done
}
if ! language_fonts_ready; then
  apt-get update
  apt-get install -y python3-gi python3-cairo python3-gi-cairo gir1.2-pango-1.0 fonts-noto-core fonts-noto-cjk fonts-noto-color-emoji
fi
