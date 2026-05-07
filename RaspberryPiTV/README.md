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
mkdir -p MultimediaContent/Videos/Movies MultimediaContent/Videos/TVShows
```

Y copia ahí tus vídeos `.mp4`, `.m4v`, `.mov` o `.mkv`.

`control_api.py` usa `MultimediaContent/Videos`, con `Movies` para películas y `TVShows` para series, así que no depende de una ruta fija como `/home/...`.

## Menú táctil

La arquitectura queda separada en dos partes:

- `control_api.py`: backend de reproducción y API HTTP.
- `menu_app.py`: frontend a pantalla completa hecho con `pygame`.
- `RaspberryPiWEB/dist`: frontend web compilado que la API sirve en `http://IP_DE_LA_RASPBERRY:5050/`.
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

## Web remota al arrancar

Cuando arrancan los servicios de la Raspberry:

- `simpsonstv-api.service` levanta `control_api.py`.
- esa API sirve tambien la web compilada si existe `RaspberryPiWEB/dist/`.
- `simpsonstv-menu.service` arranca el menu y el QR apunta a `http://IP_DE_LA_RASPBERRY:5050/`.

Eso significa que al encender la Raspberry, el movil puede abrir directamente la web desde la misma URL de la API, sin un puerto extra.

Si haces cambios en `RaspberryPiWEB/`, recompila antes o despues de actualizar:

```bash
cd ~/TvSimpsonsApp/RaspberryPiWEB
npm install
npm run build
```

Si `dist/` no existe todavia, la API respondera indicando que falta compilar la web.

## Clonar solo RaspberryPiTV con sparse-checkout

Si no quieres traerte visible todo el repositorio en la Raspberry, puedes clonarlo así:

```bash
git clone --filter=blob:none --sparse <URL_DEL_REPO>
cd TvSimpsonsApp
git sparse-checkout set RaspberryPiTV
```

Después crea la carpeta de vídeos:

```bash
mkdir -p MultimediaContent/Videos/Movies MultimediaContent/Videos/TVShows
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

- crea `MultimediaContent/Videos/Movies` y `MultimediaContent/Videos/TVShows` si no existen.
- instala un guardia de arranque que espera 5 segundos en consola por si pulsas `y` para cancelar menu y web en ese inicio.
- reemplaza los servicios antiguos por los nuevos.
- hace `daemon-reload`.
- habilita y reinicia `simpsonstv-startup-guard.service`, `simpsonstv-api.service`, `simpsonstv-menu.service` y `tvbutton.service`.
- deja la web disponible en la misma URL de la API siempre que `RaspberryPiWEB/dist/` este compilado.

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
journalctl -u simpsonstv-startup-guard.service -n 50 --no-pager
journalctl -u simpsonstv-api.service -n 50 --no-pager
journalctl -u simpsonstv-menu.service -n 50 --no-pager
journalctl -u tvbutton.service -n 50 --no-pager
tail -n 50 /tmp/raspberrypitv-menu.log
tail -n 100 /tmp/raspberrypitv-mpv.log
```

Si al tocar `Play` aparece el icono de pensar y vuelve al menu, normalmente significa que `mpv` ha arrancado y ha salido enseguida.
Ahora `menu_app.py` deja tambien trazas en:

```bash
/tmp/raspberrypitv-mpv.log
```

Flujo rapido de diagnostico para ese caso:

```bash
tail -n 100 /tmp/raspberrypitv-menu.log
tail -n 100 /tmp/raspberrypitv-mpv.log
journalctl -u simpsonstv-menu.service -b -n 100 --no-pager
cd ~/TvSimpsonsApp/RaspberryPiTV
./test_players.sh mpv
```

Con eso puedes ver:

- el comando exacto de `mpv` que lanzó el menu.
- si el socket IPC de `mpv` no llegó a crearse.
- si `mpv` salió inmediatamente y con qué código.
- el error real de `mpv` en consola/log.

## Cancelar autostart en el arranque

Al arrancar la Raspberry, antes de iniciar la web y el menu, el sistema anuncia en `tty1` que va a ejecutar:

```bash
git -C /home/donkikochan/TvSimpsonsApp pull
```

Despues aparece un mensaje durante 5 segundos.
Si en ese tiempo pulsas `y`, se cancela el arranque automatico de ambos solo para ese inicio.

Eso te deja la consola libre para diagnosticar sin tocar la SD ni deshabilitar servicios permanentemente.

## Modo diagnostico de arranque

Si la Raspberry arranca en negro o el menu se queda colgado, no hace falta borrar la SD.
Lo mas util es desactivar temporalmente el menu para que el sistema arranque mostrando la consola:

```bash
sudo systemctl disable --now simpsonstv-menu.service
sudo reboot
```

Despues del reinicio ya deberias volver a ver la TTY con los mensajes normales del sistema.
Desde ahi puedes revisar que ha pasado:

```bash
sudo systemctl status simpsonstv-menu.service
journalctl -u simpsonstv-menu.service -b --no-pager
tail -n 100 /tmp/raspberrypitv-menu.log
```

Cuando quieras volver al arranque normal del menu:

```bash
sudo systemctl enable --now simpsonstv-menu.service
```

Si ademas quieres que el menu no se lance automaticamente hasta que tu lo arranques a mano, dejalo deshabilitado y usa:

```bash
sudo systemctl start simpsonstv-api.service
sudo systemctl start simpsonstv-menu.service
```

Nota importante:

- `simpsonstv-menu.service` ahora queda gestionado como un proceso normal de `systemd`, asi que `stop`, `start`, `restart` y `status` son bastante mas fiables para depurar bloqueos.
- Si alguna vez usas `start_with_splash.sh`, ese script pinta una imagen encima de la consola con `fbi`. Para depurar, no lo uses o mata `fbi` con `sudo pkill fbi`.
