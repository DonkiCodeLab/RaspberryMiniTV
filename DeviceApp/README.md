# DeviceApp

Scripts para ejecutar la TV en la Raspberry Pi.

## Descargas de películas por torrent

En Uploads → Películas → TMDB, abre una ficha para buscar en The Pirate Bay
(apibay.org). Los resultados muestran MB decimales y seeds de mayor a menor;
puedes ajustar la búsqueda por título/año. «Descargar» inicia una tarea en la
Raspberry y el dashboard permite ver progreso, velocidad, pausar, reanudar,
cancelar o reintentar errores. La descarga continúa con el navegador cerrado.
La lista del dashboard tiene scroll y separa las tareas en curso del historial.
Las finalizadas y canceladas se conservan tras reiniciar hasta que pulses
«Quitar del historial» en cada entrada; esto no borra el vídeo ni su ficha TMDB.

`update_minitv.sh` e `install_services.sh` instalan automáticamente la instancia
dedicada `minitv-torrents.service` de Transmission. Para instalar solo ese soporte:

```bash
bash DeviceApp/install_torrent_support.sh
sudo systemctl restart minitv-api.service
```

Transmission usa RPC en `127.0.0.1:9092` y el puerto de peers `51414`, con dos
descargas simultáneas. No modifica la configuración de otras instancias.
La API usa el protocolo RPC de Transmission 3.x/4.x
([especificación oficial](https://github.com/transmission/transmission/blob/4.0.6/docs/rpc-spec.md)).
Si ya tienes un motor local con acceso a las mismas rutas, puedes definir
`MINITV_TRANSMISSION_URL`, `MINITV_TRANSMISSION_USER` y
`MINITV_TRANSMISSION_PASSWORD` en el entorno de la API.

La cola persistente, los datos temporales y la configuración están en
`MultimediaContent/Torrents/`. Tras obtener los metadatos del magnet, se selecciona
el vídeo compatible de mayor tamaño, excluyendo samples; no se importan archivos
comprimidos ni todas las películas de un pack. El vídeo completo se publica con
un enlace duro en Movies (ambas carpetas deben estar en el mismo sistema de
archivos), se guarda su ficha y **solo entonces** se preparan imágenes y recursos
TMDB. La copia temporal se elimina sin duplicar espacio. Una película existente
no se sobrescribe. Los reinicios conservan descargas y pausas; los errores de
TMDB se pueden reintentar sin descargar de nuevo el vídeo.

La búsqueda depende de la disponibilidad de apibay.org. Los resultados se
asocian a la ficha que has abierto; comprueba el nombre del torrent antes de
seleccionarlo. La previsualización de la ficha consulta TMDB, pero no encola la
preparación completa del título hasta que el vídeo está guardado.

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
- `WebApp/dist`: frontend web compilado que la API sirve en `http://IP_DE_LA_RASPBERRY:5050/`.
- `buttons.py`: deja la pantalla encendida al arrancar y permite alternarla con el botón físico.

Al arrancar `menu_app.py`:

1. reproduce `menu/video_intro.mp4`.
2. al terminar, muestra `menu/Screen_Main.png`.

Comportamiento actual del touch:

- menú principal, botón Cámara: abre la vista en directo de la Camera Module con autofoco continuo; un doble toque vuelve al menú.
- menú principal, botón Book reader: muestra la biblioteca y, al seleccionar un libro, abre un visor a pantalla completa; al cerrar el visor vuelve a la biblioteca.
- menú principal, botón Configuración: abre Idioma, Password y Red en la fila superior, con Apagar centrado debajo.
- configuración, botón Red: muestra los estados de Ethernet y Wi-Fi, con un QR para cada IP disponible.
- cada QR de red apunta al servicio web en `http://IP_DE_LA_RASPBERRY:5050/`.
- configuración, botón Volver: vuelve al menú principal.
- pantalla QR, botón Volver: vuelve a la pantalla de red.

El menú ya usa `pygame`, así que es una base mejor para añadir:

- animaciones de iconos.
- transiciones entre pantallas.
- elementos interactivos.
- minijuegos como `Snake`.

## Web remota al arrancar

Cuando arrancan los servicios de la Raspberry:

- `minitv-api.service` levanta `control_api.py`.
- esa API sirve tambien la web compilada si existe `WebApp/dist/`.
- `minitv-menu.service` arranca el menu y el QR apunta a `http://IP_DE_LA_RASPBERRY:5050/`.

Eso significa que al encender la Raspberry, el movil puede abrir directamente la web desde la misma URL de la API, sin un puerto extra.

## Actualizar todo desde la Raspberry

Desde la raíz de `RaspberryMiniTV`, ejecuta:

```bash
./update_minitv.sh
```

El script descarga la última versión de `main`, instala las dependencias web si faltan,
compila la web y reinicia los servicios ya instalados `minitv-api.service` y
`minitv-menu.service`, sin modificar sus archivos de configuración de `systemd`.
Los cambios locales de código se guardan automáticamente en un `stash` recuperable
antes de actualizar. La biblioteca multimedia y los sonidos de alarma locales se
conservan en su sitio y no bloquean las actualizaciones.

## Reproductor Kodi sin escritorio

En Raspberry Pi, el menú utiliza Kodi en modo standalone para reproducir vídeo con
controles táctiles sin instalar un escritorio. Instala Kodi y su cliente de control:

```bash
sudo apt update
sudo apt install kodi libgl1-mesa-dri kodi-eventclients-kodi-send
```

En las imágenes de Raspberry Pi OS que ofrecen Kodi 21 como paquete separado, usa
`kodi21` y `kodi21-eventclients-kodi-send`. Después ejecuta de nuevo el instalador:

```bash
cd /home/donkicodelab/RaspberryMiniTV/DeviceApp
sudo ./install_services.sh
```

El instalador copia el servicio `service.minitv.player` al perfil Kodi del usuario
`donkicodelab` y registra la salida ALSA `minitv_kodi` para la WM8960. En Kodi, la
salida de audio debe seleccionarse una vez como `ALSA: MiniTV WM8960 S16`.

Si haces cambios en `WebApp/`, recompila antes o despues de actualizar:

```bash
cd /home/donkicodelab/WebApp
npm install
npm run build
```

Si `dist/` no existe todavia, la API respondera indicando que falta compilar la web.

## Clonar solo DeviceApp con sparse-checkout

Si no quieres traerte visible todo el repositorio en la Raspberry, puedes clonarlo así:

```bash
git clone --filter=blob:none --sparse <URL_DEL_REPO>
cd /home/donkicodelab
git sparse-checkout set DeviceApp
```

Después crea la carpeta de vídeos:

```bash
mkdir -p MultimediaContent/Videos/Movies MultimediaContent/Videos/TVShows
```

Con eso, en la Raspberry trabajarás solo con `DeviceApp` dentro del checkout.

## Instalar servicios systemd

Si quieres dejar la API y el menú arrancando automáticamente al reiniciar:

```bash
cd /home/donkicodelab/DeviceApp
chmod +x install_services.sh
sudo ./install_services.sh
```

El script:

- crea `MultimediaContent/Videos/Movies` y `MultimediaContent/Videos/TVShows` si no existen.
- reemplaza los servicios antiguos por los nuevos.
- hace `daemon-reload`.
- habilita y reinicia `minitv-api.service` y `minitv-menu.service`.
- deja la web disponible en la misma URL de la API siempre que `WebApp/dist/` este compilado.

## Dependencias recomendadas en Raspberry Pi

Para esta nueva arquitectura, instala al menos:

```bash
sudo apt update
sudo apt install -y python3-flask python3-pygame python3-rpi.gpio python3-evdev qrencode network-manager wireless-tools wpasupplicant
```

Para abrir libros desde el menú instala también los visores. Evince se usa para PDF
porque funciona de forma nativa en la sesión Wayland de MiniTV. Los CBR y CBZ
se convierten a PDF en `MultimediaContent/BookCovers/comics`, sin modificar el
original; la web, la portada y el visor comparten esta caché. UnRAR descomprime
los CBR, incluidos los filtros RAR que libarchive no admite, y `python3-fitz`
convierte las imágenes. El instalador compila UnRAR desde su fuente oficial si
no está instalado. Calibre aporta el lector EPUB:

```bash
sudo apt install -y evince mupdf calibre mcomix libarchive-tools python3-fitz
bash DeviceApp/install_comic_support.sh
```

Si un lector no consigue arrancar, el detalle queda registrado en
`/tmp/minitv-book.log`.

Los PDF se abren con la barra superior de Evince visible para poder cerrar el
lector mediante el botón táctil `×` y regresar automáticamente al menú.

Si quieres comparar reproductores en la Raspberry Pi Zero 2:

```bash
sudo apt install -y mpv vlc weston
chmod +x DeviceApp/test_players.sh
```

Pruebas rapidas:

```bash
cd /home/donkicodelab/DeviceApp
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
- los logs de cada prueba quedan en `/tmp/minitv-player-tests/`.

Para revisar estado y logs:

```bash
sudo systemctl status minitv-api.service
sudo systemctl status minitv-menu.service
journalctl -u minitv-api.service -n 50 --no-pager
journalctl -u minitv-menu.service -n 50 --no-pager
tail -n 50 /tmp/minitv-menu.log
tail -n 100 /tmp/minitv-mpv.log
```

Si al tocar `Play` aparece el icono de pensar y vuelve al menu, normalmente significa que `mpv` ha arrancado y ha salido enseguida.
Ahora `menu_app.py` deja tambien trazas en:

```bash
/tmp/minitv-mpv.log
```

Flujo rapido de diagnostico para ese caso:

```bash
tail -n 100 /tmp/minitv-menu.log
tail -n 100 /tmp/minitv-mpv.log
journalctl -u minitv-menu.service -b -n 100 --no-pager
cd /home/donkicodelab/DeviceApp
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
git -C /home/donkicodelab pull
```

Despues aparece un mensaje durante 5 segundos.
Si en ese tiempo pulsas `y`, se cancela el arranque automatico de ambos solo para ese inicio.

Eso te deja la consola libre para diagnosticar sin tocar la SD ni deshabilitar servicios permanentemente.

## Modo diagnostico de arranque

Si la Raspberry arranca en negro o el menu se queda colgado, no hace falta borrar la SD.
Lo mas util es desactivar temporalmente el menu para que el sistema arranque mostrando la consola:

```bash
sudo systemctl disable --now minitv-menu.service
sudo reboot
```

Despues del reinicio ya deberias volver a ver la TTY con los mensajes normales del sistema.
Desde ahi puedes revisar que ha pasado:

```bash
sudo systemctl status minitv-menu.service
journalctl -u minitv-menu.service -b --no-pager
tail -n 100 /tmp/minitv-menu.log
```

Cuando quieras volver al arranque normal del menu:

```bash
sudo systemctl enable --now minitv-menu.service
```

Si ademas quieres que el menu no se lance automaticamente hasta que tu lo arranques a mano, dejalo deshabilitado y usa:

```bash
sudo systemctl start minitv-api.service
sudo systemctl start minitv-menu.service
```

Nota importante:

- `minitv-menu.service` ahora queda gestionado como un proceso normal de `systemd`, asi que `stop`, `start`, `restart` y `status` son bastante mas fiables para depurar bloqueos.
- Si alguna vez usas `start_with_splash.sh`, ese script pinta una imagen encima de la consola con `fbi`. Para depurar, no lo uses o mata `fbi` con `sudo pkill fbi`.

### TMDB local y migración del catálogo

El catálogo activo es `MultimediaContent/media_library.sqlite3`. Cada película,
serie, juego, libro y colección ocupa una fila; los capítulos se guardan en una
tabla relacionada. Los campos personalizados se conservan completos en el JSON de
cada ficha. Los vídeos, libros e imágenes continúan en sus directorios.

La API y el menú de juegos usan SQLite. El primer acceso importa una sola vez
`media_library.json` (o el antiguo `movie_library.json` si aquel nunca existió).
La importación crea una base temporal, compara **todos** los datos exportados con
el original y verifica integridad y claves externas antes de publicarla mediante
reemplazo atómico. El JSON original no se modifica. El marcador
`media_library.sqlite3.migrated` impide reimportar silenciosamente un JSON antiguo
si desaparece la base. Un error de almacenamiento devuelve
`503 CATALOG_STORAGE_ERROR`; nunca se interpreta como una biblioteca vacía.

Las modificaciones usan `BEGIN IMMEDIATE` durante toda la lectura/modificación,
con transacciones anidadas mediante savepoints, espera de bloqueo de 30 segundos y
`synchronous=EXTRA` con journal de rollback. SQLite coordina los distintos hilos y
procesos; solo se actualizan las filas modificadas. Las lecturas usan una instantánea
coherente. Guardar una instantánea anterior a otra modificación se rechaza.
Consultar o escanear los directorios no modifica las fichas guardadas.

`catalog_changes` conserva los valores anteriores y nuevos de cada ficha modificada,
con revisión y fecha, dentro de la misma transacción. También se conservan exportaciones
JSON completas de recuperación en `Recovery/media-library-<sha256>.json`, deduplicadas
por contenido. Incluyen todos los perfiles y no duplican vídeos ni imágenes. Una
exportación puede corresponder a un cambio que finalmente se canceló; el historial
SQLite solo contiene transacciones confirmadas. No se restaura ninguna copia de forma
automática ni se borran las incorporaciones posteriores.

Para migrar o comprobar manualmente (desde la raíz del proyecto):

```sh
sudo python3 DeviceApp/migrate_catalog.py
sudo python3 DeviceApp/migrate_catalog.py --backup /ruta/nueva/catalogo.sqlite3
sudo python3 DeviceApp/migrate_catalog.py --export /ruta/nueva/catalogo.json
```

La copia SQLite usa la API de backup, se verifica y conserva también el historial.
Las exportaciones y copias exigen un destino nuevo. Para volver a la versión JSON,
detener primero `minitv-api.service` y `minitv-menu.service`, exportar el **estado actual**
a un archivo nuevo, conservar la base y las copias, instalar el código anterior y
colocar esa exportación como `media_library.json` antes de arrancar. No usar el JSON
de la importación inicial si ha habido cambios posteriores. Una vuelta posterior a
SQLite requiere una migración explícita del JSON actualizado en un destino nuevo;
no eliminar el marcador para forzar una reimportación sobre la base existente.

La API guarda los JSON y las imágenes de TMDB en `MultimediaContent/TmdbCache/`
(en el disco de la Raspberry, compartidos por todos los navegadores). La web conectada
consulta esta caché; solo se contacta con TMDB cuando falta un recurso. El modo mock
sigue usando TMDB directamente.

Al crear una serie, subir películas/episodios o asociar una ficha se encola su descarga
sin bloquear la subida del vídeo. Se guardan las fichas en español, catalán e inglés,
los carteles, fondos y logos de todos los idiomas, carteles de temporadas e imágenes
de episodios, incluidos especiales y variantes. Las imágenes se guardan a tamaño
original, una sola vez por nombre de archivo TMDB. Esto puede ocupar bastante espacio
para series largas; está incluido en el uso de disco de MultimediaContent.

Para el catálogo existente:

1. Instalar esta versión en la Raspberry y reiniciar `minitv-api.service` con la web
   compilada (`cd WebApp && npm run build`). No basta con actualizar solo la web.
2. Abrir los ajustes de la Raspberry en la web y comprobar las credenciales de TMDB.
3. En **Contenido TMDB en local**, pulsar **Descargar catálogo / reintentar pendientes**.
4. Consultar completados, pendientes y errores. Puede cerrarse el navegador: la cola
   sigue en la API. Al reiniciar el servicio, los trabajos interrumpidos se retoman.
5. Los títulos sin ID aparecen en una lista; asociarlos a su ficha TMDB desde la web
   y repetir. No se asignan resultados por similitud de nombres automáticamente.

La migración es idempotente: repetirla omite trabajos completos y reintenta fallidos,
reutilizando los archivos ya descargados. Un error parcial nunca se marca completado.
La cola se persiste en `jobs.json`, los archivos se publican mediante reemplazo atómico
y las descargas tienen tiempo límite y reintentos para errores transitorios/429.
No se borran vídeos, perfiles ni imágenes al migrar. Los trabajos se deduplican por
ID TMDB, aunque haya varios archivos de vídeo para una misma película.

Al subir nuevos episodios se actualizan las fichas de esa serie para descubrir nuevas
temporadas e imágenes; los gráficos existentes no se vuelven a descargar. Durante la
navegación normal las fichas no caducan. Las búsquedas nuevas necesitan conexión;
las fichas e imágenes ya almacenadas se sirven sin conexión a TMDB. Enlaces externos
como IMDb, Rotten Tomatoes o su resolución mediante Wikidata conservan su comportamiento.

API autenticada con el PIN habitual:

- `GET /tmdb/cache`: progreso, errores e identificadores pendientes de asignar.
- `POST /tmdb/cache`: encolar catálogo/reintentar fallidos.
- `GET /tmdb/json/<ruta>`: JSON persistente de búsquedas/fichas permitidas.
- `GET /tmdb/images/<archivo>?pin=...`: imagen local (la descarga si falta).

Las credenciales de TMDB las obtiene el servidor de sus ajustes o de las variables de
entorno habituales. Nunca se guardan en los JSON de la caché. Copiar toda la carpeta
`TmdbCache` junto al contenido multimedia para conservarla en las copias de seguridad.
Los endpoints de imágenes siguen la [documentación de TMDB](https://developer.themoviedb.org/docs/image-basics).

Pruebas: `python3 -m unittest discover -s DeviceApp/tests` (requiere Flask).


### Limpieza al eliminar películas y series

Al borrar una película o una serie completa desde la web, se eliminan también sus
JSON e imágenes exclusivas de TMDB y su trabajo en la cola. Si hay otra copia del
mismo título, se conserva la caché hasta eliminar la última. Las imágenes referenciadas
por otras fichas o por portadas personalizadas del catálogo también se conservan.
Borrar una carpeta de películas elimina las entradas de sus archivos descendientes.
Eliminar solo una temporada o episodio mantiene la caché de la serie.

`TmdbCache/index.json` relaciona cada archivo de metadatos con `movie/<id>` o `tv/<id>`
y con las imágenes que ha referenciado. Las cachés anteriores se identifican usando
sus rutas y parámetros originales, sin volver a descargarlas. Los archivos antiguos
que no se pueden identificar se conservan por precaución. Los resultados de búsqueda
no impiden eliminar las imágenes exclusivas de un título.

Las descargas activas se cancelan mediante una generación por título: sus respuestas
pendientes no pueden volver a guardar datos después de la limpieza. Si falla la
limpieza en disco, se conserva la entrada del catálogo para que se pueda reintentar
el borrado, incluso si el vídeo ya se eliminó.


Durante una descarga el botón de inicio queda desactivado y muestra «Descarga en
curso…». «Cancelar descarga» cancela los trabajos pendientes y el activo sin borrar
lo ya guardado. La petición de red en curso puede tardar hasta su tiempo límite en
terminar, pero no se publican sus resultados tras cancelar. El estado `cancelled`
se conserva al reiniciar; «Reanudar descarga» vuelve a encolar los títulos pendientes
aprovechando la caché. Las peticiones repetidas de inicio durante una descarga no
vuelven a encolar el catálogo. `DELETE /tmdb/cache` cancela la descarga y requiere PIN.
Las descargas bajo demanda para navegar por la web siguen funcionando.

El panel TMDB muestra el tamaño de toda la caché (imágenes, JSON, índice y cola) en GB decimales y su porcentaje respecto a la capacidad total del disco que contiene la caché. La medición se renueva cada 10 segundos mientras se consulta el progreso.

### Miniaturas de la biblioteca

La API necesita Pillow (`sudo apt-get install python3-pil`) para generar las versiones
WebP de las portadas. Se guardan en `MultimediaContent/TmdbCache/thumbnails/` y se
reutilizan en las siguientes visitas; los originales se conservan en `images/`.

Al subir una película o serie, la preparación de TMDB genera también las miniaturas
antes de marcar el trabajo como completado: portadas de biblioteca y temporadas a
500 px, pósteres y capturas de capítulos a 780 px, y fondos a 1280 px, en los tres
idiomas disponibles. Se incluyen las variantes de las galerías. Esta preparación
continúa en segundo plano después de recibir el vídeo; su progreso y posibles
fallos aparecen en el panel TMDB. Las versiones ya guardadas se reutilizan.

### Flujo local por niveles

Las rutas de navegación `/tmdb/json/…` y `/tmdb/images/…` leen exclusivamente
ficheros locales; si faltan responden `409 TMDB_LOCAL_MISSING`. No descargan ni
generan miniaturas ni reescriben el índice al navegar. Las búsquedas y las vistas
previas de importación usan las rutas separadas `search/…`, `import/json/…` e `import/images/…`.
La subida encola la preparación del título; `/tmdb/cache` expone por título la
fase (`metadata`, `images`, `thumbnails`), fichero actual y contadores.

El navegador carga primero las portadas. Una serie proporciona sus temporadas;
una temporada devuelve solo las tarjetas de episodios (`level=cards`). La ficha
completa de un episodio se lee al abrirlo, desde los metadatos locales de su
temporada. Los metadatos y las imágenes visitadas se reutilizan durante la sesión;
la finalización de una nueva preparación renueva la caché de navegación en la web.
`python3 DeviceApp/prepare_local_media.py --check` comprueba las variantes de la
biblioteca existente; sin `--check` genera las que faltan desde los originales
locales, sin contactar con TMDB.

El estado periódico `/health` nunca recorre el disco para calcular tamaños. Sirve
una instantánea persistente (`MultimediaContent/library_stats.json`), que un único
hilo actualiza cada 60 segundos. Sin una instantánea previa indica `calculating`
y el dashboard muestra «Calculando…». La consulta de reproducción usa un bloqueo
breve independiente. El navegador evita solapar consultas de estado.

El servidor registra inicio, fin y milisegundos de las consultas locales, sin
incluir el PIN. Para diagnosticar una espera se pueden volcar únicamente las
pilas de los hilos con `sudo systemctl kill -s SIGUSR1 --kill-whom=main minitv-api.service`;
las pilas aparecen en el journal del servicio.


### Colección permanente Óscar

La tercera vista de Películas recorre las 98 ganadoras de **Mejor película**, desde la
ceremonia de 1929 hasta la de 2026. El manifiesto versionado está en
`DeviceApp/data/oscar_best_picture.json`, con IDs contrastados en TMDB. Los años
corresponden a la ceremonia: 1930 tiene dos ediciones y 1933 no tuvo ceremonia.
Fuentes: [Academia](https://www.oscars.org/oscars/ceremonies),
[ceremonia de 2026](https://www.oscars.org/oscars/ceremonies/2026) y
[cronología de ceremonias](https://en.wikipedia.org/wiki/List_of_Academy_Awards_ceremonies).
Para incorporar premios futuros se añade una edición al manifiesto; las ediciones
ya guardadas nunca se eliminan al actualizarlo.

Al entrar en la vista se prepara automáticamente la colección con las credenciales
TMDB existentes. Primero se guardan las fichas en castellano, catalán e inglés y las
portadas/fondos principales de todas las ganadoras; después, los inventarios de
imágenes, originales y miniaturas de las galerías completas. Las transferencias
se limitan a tres en paralelo. El progreso y los fallos aparecen en la vista, con
reintento que reutiliza los archivos guardados. La cola se recupera al reiniciar la API.

Todo queda en `MultimediaContent/TmdbCache/Oscars/`: manifiesto `catalog.json`,
fichas `metadata/`, originales `images/`, miniaturas `thumbnails/` y cola `jobs.json`.
Este directorio es independiente del vídeo y de la limpieza de la caché normal;
borrar una película, incluso su última copia, no borra el archivo Óscar. Los
endpoints de esta colección no ofrecen borrado. La navegación consulta únicamente
el disco y funciona sin Internet una vez preparada.

La ficha solo se habilita cuando el catálogo escaneado contiene un archivo con el
mismo ID de TMDB. Los títulos similares y los remakes no habilitan otra película.
El carrusel admite deslizador, flechas, teclado y arrastre; respeta la preferencia
de movimiento reducido. La selección se conserva al volver desde una ficha.

API protegida por PIN: `GET /oscars?language=es-ES`, `POST /oscars/prepare` y
`GET /oscars/images/<archivo>?width=500`. Las fichas e imágenes habituales pueden
reutilizar el archivo Óscar cuando faltan en la caché normal. Para inspeccionar
el archivo sin descargar: `python3 DeviceApp/prepare_oscars.py --check`. Para
prepararlo desde consola, con las credenciales TMDB configuradas en Ajustes o en
las variables de entorno existentes: `python3 DeviceApp/prepare_oscars.py`. No
ejecutar la preparación por consola a la vez que otra API que escriba en la misma
carpeta de caché.

## Subtítulos durante la reproducción

La ficha y su editor incluyen **Obtener subtítulo**, además de la carga manual de
SRT. Selecciona español (predeterminado), catalán o inglés. La Raspberry busca en
OpenSubtitles.com primero por la huella del vídeo (solo lee sus primeros y últimos
64 KiB); si no hay coincidencia, busca por el ID TMDB de la ficha guardada, o por
el nombre del fichero cuando no hay ID. Prioriza la coincidencia de versión,
fuentes fiables, valoración y descargas. Descarta otros idiomas, otras películas,
subtítulos parciales, traducciones automáticas y entregas divididas en varios CD.
La consulta de respaldo evalúa la primera página ordenada por descargas; es una
selección por compatibilidad estimada, no una garantía de sincronización.

En **Configurar OpenSubtitles**, introduce una clave de API, usuario y contraseña
de OpenSubtitles.com. Consulta su [guía de alta y claves](https://opensubtitles.tawk.help/article/getting-started).
La cuenta queda en `DeviceApp/subtitle_settings.json`, excluido de Git y con
permisos `0600`; la API devuelve solo su estado, nunca la clave o contraseña.
Dejar los campos secretos vacíos al editar conserva los valores anteriores.
Alternativamente se pueden configurar `OPENSUBTITLES_API_KEY`,
`OPENSUBTITLES_USERNAME` y `OPENSUBTITLES_PASSWORD` en el entorno del servicio API.
Los ajustes guardados tienen prioridad y no se necesitan paquetes adicionales.

El botón guarda inmediatamente `<nombre-del-vídeo>.srt`, sustituyendo el anterior
solo después de validar la descarga UTF-8 (máximo 5 MiB). Los errores de conexión,
cuota, credenciales o formato conservan el SRT anterior. Se muestra si hubo
coincidencia por huella o si conviene comprobar la sincronización. No se sube el
vídeo a internet. La descarga usa la cuota de la cuenta de OpenSubtitles.

API protegida por PIN: `GET/POST /settings/subtitles` y
`POST /movies/subtitles/obtain` con `{"relativePath":"Movies/pelicula.mkv","language":"es"}`.
La búsqueda toma los metadatos del catálogo de la Raspberry para ese fichero.
El modo de demostración no simula una descarga guardada.

La web ofrece **Activar/desactivar subtítulos** y **Siguiente pista de subtítulos**
en los controles de la Raspberry y en la ficha de la película que está sonando.
Se aplican al vídeo actual de la MiniTV o del monitor externo. La pista siguiente
permite recorrer los subtítulos integrados y los archivos externos que haya
cargado el reproductor. El SRT debe estar junto al vídeo con el mismo nombre base;
si se ha subido después de iniciar el vídeo, vuelve a iniciar la reproducción.

Con mpv, la web confirma la visibilidad y muestra el idioma o título de la pista
cuando está disponible. Con Kodi se envían las acciones mediante `kodi-send` y
se comprueba el cambio en la pantalla de reproducción. Reinicia los servicios
tras actualizar el código para que el menú registre el reproductor utilizado.
Este control no modifica el reproductor HTML del navegador ni puede ocultar
subtítulos que formen parte de la propia imagen del vídeo.

Referencias de los controles: [mpv](https://mpv.io/manual/stable/) y
[acciones de Kodi](https://kodi.wiki/view/Action_IDs).

### Películas premiadas: Óscar, Palma de Oro y Goya

La vista de premios conserva el archivo Óscar existente y añade dos catálogos independientes:
`data/palme_dor.json` (66 Palmas de Oro a largometrajes, 1955–2026) y
`data/goya_best_picture.json` (41 ganadoras de mejor película, 1987–2026).
Las fuentes oficiales y la fecha de revisión figuran en cada manifiesto. Cannes excluye el antiguo
Grand Prix, las Palmas especiales/honoríficas y los cortometrajes. Los empates tienen una clave
por película, además de su número de edición: ambos ganadores permanecen navegables.

API con PIN: `GET /awards/<oscars|palme|goya>?language=es-ES`,
`POST /awards/<premio>/prepare` y `GET /awards/<premio>/images/<archivo>?width=500`.
Las rutas `/oscars` siguen siendo compatibles. Los nuevos archivos viven en
`MultimediaContent/TmdbCache/Awards/{palme,goya}` y conservan las fichas en tres idiomas,
portadas y fondos aunque se elimine el vídeo de la biblioteca. Se preparan en segundo plano
al abrir la colección y continúan después de reiniciar. La disponibilidad se cruza por ID de TMDB
con un fichero real en la biblioteca, nunca por similitud de títulos.
