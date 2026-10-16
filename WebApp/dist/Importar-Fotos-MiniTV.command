#!/bin/zsh
# Run with /bin/zsh. Exports copies; never modifies or uploads your Photos library.
# OSXPhotos docs: https://rhettbull.github.io/osxphotos/cli.html
set -eu
print 'MiniTV · Exportar fotos del Mac'
print 'Se copiarán imágenes y metadatos a una carpeta que elijas.'
print 'Vídeos, RAW y el vídeo de las Live Photos quedan fuera de esta importación.'

photo_python=''
for candidate in /opt/homebrew/bin/python3 /usr/local/bin/python3 /usr/bin/python3; do
  if [[ -x "$candidate" ]] && "$candidate" -c 'import sys; sys.exit(sys.version_info < (3, 10))' 2>/dev/null; then
    photo_python="$candidate"
    break
  fi
done
if [[ -z "$photo_python" ]]; then
  print 'Necesitas Python 3.10 o posterior. Instálalo desde https://www.python.org/downloads/macos/ y vuelve a ejecutar el asistente.'
  exit 1
fi

photo_destination=$(/usr/bin/osascript <<'APPLESCRIPT'
set destination to choose folder with prompt "MiniTV: ¿dónde quieres guardar la exportación de Fotos?"
return POSIX path of destination
APPLESCRIPT
)
photo_scope=$(/usr/bin/osascript <<'APPLESCRIPT'
set answer to display dialog "Abre Fotos y espera a que termine la sincronización de iCloud. Puedes exportar las fotos seleccionadas o toda tu fototeca. Las imágenes se copiarán; sus originales no se modificarán." buttons {"Cancelar", "Seleccionadas", "Toda la fototeca"} default button "Seleccionadas" cancel button "Cancelar" with title "MiniTV · Fotos"
return button returned of answer
APPLESCRIPT
)

photo_runtime="$HOME/Library/Application Support/MiniTV/PhotosExporter"
if [[ ! -x "$photo_runtime/bin/osxphotos" ]]; then
  print 'Preparando OSXPhotos en un entorno propio de MiniTV…'
  "$photo_python" -m venv "$photo_runtime"
  "$photo_runtime/bin/python" -m pip install 'osxphotos==0.77.2'
fi
photo_export=$(mktemp -d "${photo_destination%/}/MiniTV-Fotos-XXXXXX")
photo_template="$photo_export/.minitv-metadata.mako"
cat > "$photo_template" <<'MAKO'
${photo.json(shallow=False, indent=2)}
MAKO
photo_options=()
if [[ "$photo_scope" == 'Seleccionadas' ]]; then photo_options+=(--selected); fi
print "Exportando a: $photo_export"
print 'Si macOS lo solicita, permite que Terminal acceda a Fotos. La descarga de originales de iCloud puede tardar.'
if ! "$photo_runtime/bin/osxphotos" export "$photo_export" \
  --only-photos --skip-live --skip-raw --download-missing \
  --directory '{created.year}/{created.mm}' \
  --sidecar-template "$photo_template" '{filepath}.minitv.json' none \
  --report "$photo_export/export-report.csv" "${photo_options[@]}"; then
  print 'La exportación no ha terminado correctamente. Revisa el mensaje anterior y export-report.csv. Las copias que se hayan creado siguen en la carpeta.'
  exit 1
fi
print ''
print "Exportación terminada: $photo_export"
print 'Revisa export-report.csv por si hay originales de iCloud pendientes.'
print 'En MiniTV → Fotos → Subir fotos → Desde Fotos del Mac, elige esta carpeta.'
/usr/bin/open "$photo_export"
