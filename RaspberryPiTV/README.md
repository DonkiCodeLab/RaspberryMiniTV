# RaspberryPiTV

Scripts para ejecutar la TV en la Raspberry Pi.

## Archivos

- `control_api.py`: API Flask para listar y reproducir vídeos con `omxplayer`.
- `menu_app.py`: menú principal en `pygame`, pensado para touch, animaciones y futuros minijuegos.
- `start_menu.sh`: lanzador del menú en segundo plano para Raspberry Pi.
- `buttons.py`: control del botón físico y encendido/apagado de pantalla.
- `install_services.sh`: instala y activa los servicios `systemd`.
- `menu/`: recursos visuales del menú principal, opciones y vídeo de introducción.

## Carpeta de vídeos

Cuando te bajes este repositorio en la Raspberry, crea manualmente:

```bash
mkdir -p RaspberryPiTV/videos
```

Y copia ahí tus vídeos `.mp4`, `.m4v`, `.mov` o `.mkv`.

`control_api.py` usa esa carpeta local `RaspberryPiTV/videos`, así que no depende de una ruta fija como `/home/...`.

## Menú táctil

La arquitectura queda separada en dos partes:

- `control_api.py`: backend de reproducción y API HTTP.
- `menu_app.py`: frontend a pantalla completa hecho con `pygame`.
- `buttons.py`: deja la pantalla encendida al arrancar y permite alternarla con el botón físico.

Al arrancar `menu_app.py`:

1. reproduce `menu/video_intro.mp4`.
2. al terminar, muestra `menu/Screen_Main.png`.

Comportamiento actual del touch:

- menú principal, arriba derecha: muestra el QR de la API.
- menú principal, abajo derecha: muestra `Screen_MoreOptions.png`.
- menú de opciones, abajo derecha: vuelve al menú principal.
- pantalla QR, abajo derecha: vuelve al menú principal.

El menú ya usa `pygame`, así que es una base mejor para añadir:

- animaciones de iconos.
- transiciones entre pantallas.
- elementos interactivos.
- minijuegos como `Snake`.

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
- habilita y reinicia `simpsonstv-api.service`, `simpsonstv-menu.service` y `tvbutton.service`.

## Dependencias recomendadas en Raspberry Pi

Para esta nueva arquitectura, instala al menos:

```bash
sudo apt update
sudo apt install -y python3-flask python3-pygame python3-rpi.gpio python3-evdev qrencode network-manager wireless-tools wpasupplicant
```

Si quieres comparar reproductores en la Raspberry Pi Zero 2:

```bash
sudo apt install -y mpv vlc
chmod +x RaspberryPiTV/test_players.sh
```

Pruebas rapidas:

```bash
cd ~/TvSimpsonsApp/RaspberryPiTV
./test_players.sh omxplayer
./test_players.sh mpv
./test_players.sh vlc
./test_players.sh all
```

Notas practicas para Zero 2:

- hoy el proyecto usa `omxplayer` de forma hardcoded en `control_api.py` y `menu_app.py`.
- `mpv` es el candidato mas realista si luego quieres seguir jugando con una UI propia.
- `vlc` suele consumir mas y en Raspberry sin escritorio grafico puede dar mas guerra.
- si arrancas en consola/TTY, el script intenta usar `mpv` sobre DRM/KMS; con `vlc` puede que necesites sesion grafica segun la imagen de Raspberry Pi OS.
- los logs de cada prueba quedan en `/tmp/simpsonstv-player-tests/`.

Para revisar estado y logs:

```bash
sudo systemctl status simpsonstv-api.service
sudo systemctl status simpsonstv-menu.service
sudo systemctl status tvbutton.service
journalctl -u simpsonstv-api.service -n 50 --no-pager
journalctl -u simpsonstv-menu.service -n 50 --no-pager
journalctl -u tvbutton.service -n 50 --no-pager
tail -n 50 /tmp/raspberrypitv-menu.log
```
