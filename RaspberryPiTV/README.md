# RaspberryPiTV

Scripts para ejecutar la TV en la Raspberry Pi.

## Archivos

- `control_api.py`: API Flask para listar y reproducir vídeos con `omxplayer`.
- `buttons.py`: control del botón físico y encendido/apagado de pantalla.
- `install_services.sh`: instala y activa los servicios `systemd`.

## Carpeta de vídeos

Cuando te bajes este repositorio en la Raspberry, crea manualmente:

```bash
mkdir -p RaspberryPiTV/videos
```

Y copia ahí tus vídeos `.mp4`, `.m4v`, `.mov` o `.mkv`.

`control_api.py` usa esa carpeta local `RaspberryPiTV/videos`, así que no depende de una ruta fija como `/home/...`.

## Clonar solo RaspberryPiTV con sparse-checkout

Si no quieres traerte visible todo el repositorio en la Raspberry, puedes clonarlo así:

```bash
git clone --filter=blob:none --sparse <URL_DEL_REPO>
cd TvSimpsonsApp
git sparse-checkout set RaspberryPiTV
```

Después crea la carpeta de vídeos:

```bash
mkdir -p RaspberryPiTV/videos
```

Con eso, en la Raspberry trabajarás solo con `RaspberryPiTV` dentro del checkout.

## Instalar servicios systemd

Si quieres dejar la API y el botón físico arrancando automáticamente al reiniciar:

```bash
cd ~/TvSimpsonsApp/RaspberryPiTV
chmod +x install_services.sh
sudo ./install_services.sh
```

El script:

- crea `RaspberryPiTV/videos` si no existe.
- reemplaza los servicios antiguos por los nuevos.
- hace `daemon-reload`.
- habilita y reinicia `simpsonstv-api.service` y `tvbutton.service`.

Para revisar estado y logs:

```bash
sudo systemctl status simpsonstv-api.service
sudo systemctl status tvbutton.service
journalctl -u simpsonstv-api.service -n 50 --no-pager
journalctl -u tvbutton.service -n 50 --no-pager
```
