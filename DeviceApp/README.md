# DeviceApp

## Información de los archivos de películas

La resolución, códec, duración, tamaño, bitrates y calidad orientativa se calculan
con FFprobe al incorporar una película (subida normal/raw, torrent o registro de
un archivo existente). Se guardan en `fileInfo` en `media_library.sqlite3`.
Reemplazar un vídeo renueva esos datos y el nombre original; si el análisis falla,
se guarda el error sin conservar la calidad de la copia anterior. La fuente se
identifica únicamente por el nombre original cuando está disponible.

Las fichas y el listado leen los valores guardados. `GET /media/file-info` no
ejecuta FFprobe. La huella del archivo detecta sustituciones; una ficha sin datos
vigentes queda pendiente, sin presentar la medición anterior como actual.
Al arrancar la API se completa en segundo plano el catálogo antiguo y los archivos
nuevos o modificados fuera de la aplicación. El repaso se puede ejecutar también
de forma manual y retoma lo que falte sin repetir los análisis ya guardados:

```bash
python3 DeviceApp/backfill_movie_file_info.py --multimedia-dir MultimediaContent
# Reintentar los vídeos cuyo análisis falló:
python3 DeviceApp/backfill_movie_file_info.py --multimedia-dir MultimediaContent --retry-failed
```

El repaso guarda lotes de 20 películas por transacción, conservando sus fichas.
El comando informa de archivos actualizados, sin cambios, fallidos u omitidos
por modificaciones concurrentes. No modifica los vídeos.

Pruebas: `python -m unittest discover -s DeviceApp/tests -p 'test_media_file_info.py'`,
`test_torrent_downloads.py` y `test_upload_conflicts.py` con el mismo comando.

## Audio compatible al reproducir desde la web

Al pulsar **Reproducir en navegador**, `POST /media/playback` comprueba las pistas
con FFprobe y las capacidades de audio declaradas por el navegador. Los vídeos
compatibles se reproducen directamente. Si hace falta adaptar el audio, FFmpeg
crea un MP4 con la pista predeterminada en AAC estéreo a 192 kb/s y copia el vídeo
sin recodificar. Conserva los subtítulos `mov_text`; los SRT externos se siguen
leyendo junto al original. No convierte códecs de vídeo incompatibles con MP4.

`GET /media/playback?id=…` devuelve el estado, porcentaje real, tiempo transcurrido,
estimación restante y posición en cola. Ambas rutas requieren `X-Web-Pin`.
Solo hay una conversión simultánea; las comprobaciones de archivos compatibles
se atienden por separado. Se admiten hasta 16 preparaciones pendientes. Cerrar
el navegador no detiene la tarea; volver a abrir el mismo vídeo recupera su estado.
Los errores admiten reintento explícito y nunca reproducen silenciosamente el
original como alternativa. Un reinicio de la API permite reintentar las tareas
interrumpidas y conserva las copias terminadas.

Las copias se guardan en `MultimediaContent/BrowserPlayback`, fuera del catálogo.
El límite es de 20 GiB: se eliminan las menos recientes cuando hace falta espacio,
respetando las utilizadas en las últimas 12 horas. También se reserva un margen
de 256 MiB de disco libre. Si no se puede liberar espacio, se muestra el error.
Los archivos parciales nunca se sirven; se publican tras comprobar el resultado.
La huella del original invalida las copias cuando cambia o se reemplaza el vídeo.
`/media/stream?relativePath=…&browserCopy=…` admite peticiones Range y exige el PIN;
las descargas siguen entregando el original. Se puede vaciar esta carpeta con
las reproducciones cerradas para recuperar espacio: se regenerará bajo demanda.

Actualiza web y API juntas. `update_minitv.sh` e `install_services.sh` instalan
FFmpeg y FFprobe si faltan. Pruebas: `python -m unittest discover -s DeviceApp/tests
-p 'test_browser*.py'` y `node --test WebApp/tests/browserPlayback.test.js`.
La prueba de conversión real necesita FFmpeg/FFprobe y comprueba audio, subtítulos,
identidad de los paquetes de vídeo y reutilización de la caché tras reiniciar.

## Perfiles de usuario y reanudación

Los perfiles y sus estados viven en `MultimediaContent/user_profiles.sqlite3`.
La API aplica el PIN de la web a `GET/POST /users`, `PATCH/DELETE /users/<id>` y
`GET/PATCH /users/<id>/state`. Los parches modifican solo los campos enviados;
dos navegadores pueden editar favoritos o episodios distintos sin sobrescribir
el resto. Borrar un perfil elimina también sus marcas y progreso. Incluye este
SQLite en las copias de seguridad de MultimediaContent.

Los comandos de vídeo enviados desde la web incluyen el perfil que los inició y
los segundos de reanudación. El menú utiliza mpv para estas sesiones y guarda
la posición cada tres segundos, al detener y al terminar; continúa guardando
aunque se cierre la web. El vídeo sigue perteneciendo al usuario que lo abrió.

La lectura con perfil en la MiniTV abre el lector web incluido en Chromium para
compartir páginas PDF/CBZ/CBR y posiciones EPUB con el móvil u ordenador. Requiere
`chromium` y `python3-pil` (ambos incluidos en `install_comic_support.sh`). Si no
hay Chromium, la web indica cómo instalarlo y permite usar **Leer en navegador**.
Los comandos antiguos sin perfil mantienen el lector externo configurado.

La subida de avatares valida la imagen y guarda una copia JPEG de 256×256. Los
25 avatares precargados se distribuyen con la web y funcionan sin conexión.

Scripts para ejecutar la TV en la Raspberry Pi.

## Descargas de películas y series por torrent

En Uploads → TMDB, el selector **Series / Películas** determina las fuentes:
las películas consultan The Pirate Bay (apibay.org) y Knaben; las series consultan
esas mismas fuentes en sus categorías de TV y añaden EZTV. No requieren cuenta, claves ni servicios
adicionales. Los resultados muestran la **fuente**, MB decimales y seeds de mayor a menor;
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

Las **Descargas libres** usan `mediaType: "generic"` sin ficha TMDB/Open Library.
Buscan todas las categorías de The Pirate Bay, Knaben y las fuentes Torznab
configuradas. Se guardan en `MultimediaContent/Torrents/free/<infoHash>` y se
descargan todos sus archivos. Al terminar se retira el torrent de Transmission
sin borrar los datos. El estado persiste en `Torrents/jobs.json`; la pausa,
cancelación y reintentos usan el mismo gestor que películas, series y libros.
Los intentos cancelados o finalizados de una ficha no bloquean una nueva descarga
libre del mismo torrent; el intento anterior queda en el historial. Esto también
se aplica a registros ocultos pendientes de limpieza, una vez que Transmission
confirma su retirada. Un intento de ficha fallido y todavía no importado puede
continuar con **Descargar como libre**: conserva sus archivos parciales en
`Torrents/downloads/<infoHash>`, reanuda la transferencia y selecciona todos los
archivos. Las descargas activas siguen mostrándose con **Ver descargas**.

`GET /torrents/<id>/contents?path=…` lista el directorio de una descarga libre
terminada e incluye su ruta absoluta en `fullPath`. `POST` con `action: "rename"`,
`path` y `name` renombra un archivo o carpeta dentro de su directorio actual,
sin sobrescribir destinos existentes ni admitir rutas o enlaces simbólicos.
Requiere que la descarga esté terminada, retirada de Transmission y sin una
descompresión en curso. `POST` también admite `action: "extract"` y `path` para descomprimir,
o `action: "import"`, `path`, `mediaType: "movies" | "series"` y
`media: {id, name}` para mover vídeos a la biblioteca. Se publica primero la copia
de biblioteca y sus metadatos, y después se retiran los originales verificados.
Los capítulos existentes y los archivos no importados permanecen en origen.
Una película existente devuelve `MOVIE_ALREADY_DOWNLOADED` (409) y requiere
`overwriteExisting: true`. `POST /torrents/<id>` con `action: "delete"` borra toda
la descarga libre y su registro; `remove` solo quita las libres canceladas.
Todas estas rutas requieren el PIN web y rechazan rutas externas/enlaces.

La descompresión se ejecuta en segundo plano con libarchive (ZIP, TAR y variantes,
RAR y 7z compatibles, GZ/BZ2/XZ). El instalador de torrents añade
`libarchive-tools`; vuelve a ejecutarlo en instalaciones previas si falta.
Se conserva el comprimido y se publica una carpeta nueva solo al terminar,
sin sobrescribir archivos. No se admiten contraseñas, enlaces ni archivos
especiales; se limita a 50.000 entradas, 100 GiB y el espacio libre disponible
menos 64 MiB. El lector sigue el [API de libarchive](https://github.com/libarchive/libarchive/wiki/Examples),
pero la aplicación valida y escribe cada archivo regular por separado.
Tras un reinicio, la descompresión interrumpida puede reintentarse.

Pruebas: `python -m unittest discover -s DeviceApp/tests -p 'test_*torrent*.py'`
(incluye descargas libres, importaciones y comprimidos locales).
La API usa el protocolo RPC de Transmission 3.x/4.x
([especificación oficial](https://github.com/transmission/transmission/blob/4.0.6/docs/rpc-spec.md)).
Si ya tienes un motor local con acceso a las mismas rutas, puedes definir
`MINITV_TRANSMISSION_URL`, `MINITV_TRANSMISSION_USER` y
`MINITV_TRANSMISSION_PASSWORD` en el entorno de la API.

El dashboard registra el tráfico de Transmission cada 30 segundos, incluso sin
el navegador abierto, en `MultimediaContent/Torrents/traffic.sqlite3`. Conserva
365 días y ofrece vistas de 3 horas, 24 horas, 7 días, último mes (30 días) y
último año (365 días) mediante `GET /torrents/traffic?period=3h` (requiere el PIN web;
periodos admitidos: `3h`, `24h`, `7d`, `30d` y `365d`). Las velocidades del gráfico
son medias por intervalo (1 minuto, 10 minutos, 1 hora, 6 horas y 1 día, respectivamente), calculadas
con los contadores de bytes; las tarjetas muestran la última velocidad medida.
Los totales corresponden al tiempo observado: los reinicios, fallos y pausas de
monitorización dejan huecos, sin atribuirles tráfico ni inventar ceros. No mide
el resto del tráfico de red de la Raspberry. El historial comienza al instalar
esta versión y requiere que el servicio de la API esté funcionando. La ampliación
a un año conserva los datos existentes, pero no recupera mediciones ya eliminadas.

La cola persistente, los datos temporales y la configuración están en
`MultimediaContent/Torrents/`. En películas, tras obtener los metadatos del magnet, se selecciona
el vídeo compatible de mayor tamaño, excluyendo samples; no se importan archivos
comprimidos ni todas las películas de un pack. El vídeo completo se publica con
un enlace duro en Movies (ambas carpetas deben estar en el mismo sistema de
archivos), se guarda su ficha y **solo entonces** se preparan imágenes y recursos
TMDB. La copia temporal se elimina sin duplicar espacio. Una película existente
solo se sobrescribe tras confirmarlo. Los reinicios conservan descargas y pausas; los errores de
TMDB posteriores a la importación se muestran como avisos en el historial y no
mantienen la descarga en curso. Al actualizar, las descargas ya importadas que
quedaron en error pasan automáticamente al historial, conservando el vídeo.

El selector de torrents, el catálogo y el menú comparten los formatos de
`video_formats.py`: además de MP4/M4V/MOV/MKV, aceptan AVI/DivX, WebM,
MPEG/MPG/M2V, TS/MTS/M2TS, VOB, WMV/ASF, FLV, OGV, 3GP y RM/RMVB.
Se reproducen directamente con mpv/Kodi, sin cambiar la extensión ni convertir
el vídeo. La extensión identifica un candidato; la decodificación depende del
códec y del reproductor instalado. Si no hay candidatos, el error muestra las
extensiones encontradas en los metadatos del torrent, incluso antes de descargar
datos. Los comprimidos y las imágenes de disco no se importan. Tras actualizar,
pulsa «Reintentar» en una descarga rechazada por el filtro anterior.

En series, el buscador aparece en la ficha general, la temporada y el capítulo.
Los filtros **Temporada / Capítulo** se rellenan con la selección actual y se
aplican al pulsar «Buscar torrents». Sin filtros se pueden elegir packs completos.
Se usa el título original para The Pirate Bay/Knaben y el ID IMDb de la ficha TMDB
para la [API pública de EZTV](https://eztvx.to/api/), que filtra la serie exacta.
EZTV aplica los filtros de temporada/capítulo y devuelve páginas de 100 entradas;
«Más resultados de EZTV» permite consultar las siguientes, hasta su límite de
100 páginas. La falta de ID IMDb se muestra sin impedir las otras fuentes.

El motor de series selecciona todos los vídeos compatibles identificados como
`S01E01` o `1x01` (también en subcarpetas), dentro de los filtros elegidos. Excluye
samples y extras sin numeración. Las versiones duplicadas de un mismo capítulo
se rechazan para evitar asignaciones incorrectas. Si el nombre de un vídeo indica
varios capítulos unidos (`S01E01E02`, `S01E01-03` o `1x01-02`), aparece un aviso con
**Descargar igualmente** en lugar de **Reintentar**. La opción también está disponible
para las descargas bloqueadas por el mensaje antiguo, y se recuerda tras reiniciar.
Al aceptarla, se descarga cada vídeo una sola vez y cada capítulo seleccionado
enlaza al vídeo completo, sin cortarlo ni duplicar su espacio en disco. El filtro de
capítulo también encuentra los capítulos posteriores de un archivo compartido.
Al completarse todos los vídeos seleccionados, se publican enlaces
duros en la carpeta de la serie bajo `TVShows`, se actualiza el catálogo y se
preparan los recursos TMDB de TV. Se reutiliza la serie que tenga el mismo ID TMDB,
conservando su ficha y los capítulos existentes; el dashboard indica añadidos y
omitidos. Los fallos de publicación revierten los nuevos enlaces y permiten reintentar.

La columna **Fuente** identifica la API y, cuando Knaben lo proporciona, el sitio
de origen: por ejemplo, `1337x (Knaben)`. Un mismo hash encontrado en varios sitios
aparece una sola vez con todas sus fuentes y el mayor número de seeds observado
(no se suman). La procedencia se conserva también en las descargas y su historial.

Las consultas tienen un límite global de 15 segundos. Si una fuente falla, se
muestran los resultados de las otras con un aviso; si fallan todas, se muestra un
error. Las búsquedas completas se conservan en memoria durante dos minutos para
reducir consultas repetidas; los fallos no se guardan en caché. Solo se admiten
categorías del tipo seleccionado y resultados con hash válido: los enlaces que solo ofrecen
un archivo `.torrent` sin hash no aparecen en esta integración.

Knaben utiliza su [API pública v2](https://knaben.org/api/v2/) y las
[categorías de películas y TV](https://knaben.org/rss/). Sus resultados proceden de su
índice y los datos de seeds pueden estar desactualizados. Las fuentes dependen de
su disponibilidad externa. Los resultados se
asocian a la ficha que has abierto; comprueba el nombre del torrent antes de
seleccionarlo. La previsualización de la ficha consulta TMDB, pero no encola la
preparación completa del título hasta que el vídeo está guardado.

### Añadir fuentes con Jackett o Prowlarr

La API admite hasta ocho fuentes adicionales mediante Torznab. Requiere una
instancia de [Jackett](https://github.com/Jackett/Jackett) o Prowlarr accesible desde
la Raspberry, con los indexadores públicos configurados. Copia la URL Torznab de
cada indexador y la clave API; define en el entorno de `minitv-api.service`:

```ini
[Service]
Environment='MINITV_TORZNAB_SOURCES=[{"name":"Mi indexador","url":"http://127.0.0.1:9117/api/v2.0/indexers/INDEXADOR/results/torznab/api","apiKey":"TU_CLAVE"}]'
```

Puedes añadir este bloque con `sudo systemctl edit minitv-api.service`. Sustituye
la URL y la clave por las de tu instalación, ejecuta `sudo systemctl daemon-reload`
y `sudo systemctl restart minitv-api.service`. `127.0.0.1` solo sirve si Jackett
está en la propia Raspberry. No guardes claves reales en el repositorio.

Cada objeto del array añade una fuente que aparece en **Fuentes consultadas** y
en los resultados. Se consulta en paralelo con las fuentes existentes, aplica
categorías de películas/TV y combina hashes duplicados. Un fallo se muestra como
fuente no disponible sin ocultar los demás resultados. Las claves se quedan en
el servidor. Sin esta variable, la búsqueda conserva las fuentes predeterminadas.

Esta integración admite hashes y magnets públicos, incluidos hashes base32.
Omite resultados marcados como privados, sin categoría compatible o que solo
ofrecen una URL de archivo `.torrent`; esos necesitan otro flujo de descarga.
Añadir una fuente no garantiza que una película concreta esté disponible.

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

Y copia ahí tus vídeos en los formatos de `video_formats.py`, incluidos `.mp4`,
`.m4v`, `.mov`, `.mkv` y `.avi`.

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
`minitv-menu.service`. También instala o actualiza el servicio independiente
`minitv-update.service`, conservando la configuración de la API y el menú.
Los cambios locales de código se guardan automáticamente en un `stash` recuperable
antes de actualizar. La biblioteca multimedia y los sonidos de alarma locales se
conservan en su sitio y no bloquean las actualizaciones.

### Actualizar desde el dashboard

Antes de **Cerrar sesión**, **Actualizar Git y refrescar web** ejecuta el mismo proceso en
`minitv-update.service`: descarga `origin/main`, instala dependencias, compila la
web y reinicia la API y el menú. Solo incluye cambios publicados en Git; los
cambios que todavía están en tu ordenador deben subirse primero. La reproducción
se interrumpe al reiniciar el menú. La página consulta el estado y recarga
la web automáticamente cuando termina correctamente. El proceso continúa aunque cierres el navegador o se
reinicie la API. El modo demo no permite iniciarlo.

Debajo del botón se muestra la última actualización completada con fecha y hora
locales del navegador (`dd/mm/aaaa hh:mm:ss`) y un historial con scroll, del intento
más reciente al más antiguo. Cada entrada conserva el resultado, la versión de Git
y los títulos de todos los commits incorporados. Al pulsar el identificador de la
versión se despliegan los commits con sus descripciones completas; al pulsar uno,
un diálogo permite abrir su página de GitHub en una pestaña nueva o cancelar.
Cada actualización guarda la URL web del remoto `origin`, sin credenciales,
para conservar el repositorio correspondiente aunque el remoto cambie después.
Las entradas antiguas sin ese dato usan el `origin` actual como referencia; si no
se puede obtener un repositorio de GitHub, los cambios se muestran sin enlace.
Si Git ya estaba al día, se indica que solo se recompiló la web
y se reiniciaron los servicios. Los intentos fallidos también se registran, sin
cambiar la fecha de la última actualización completada.
El registro se guarda en `/var/lib/minitv-update/history.jsonl`, fuera del repositorio,
y sobrevive a reinicios y actualizaciones aunque el navegador esté cerrado.
Empieza a recopilar entradas cuando se ejecuta esta versión del actualizador;
no reconstruye actualizaciones anteriores.

Para habilitar el botón por primera vez, después de copiar esta versión y compilar
la web en la Raspberry:

```bash
sudo bash DeviceApp/install_update_service.sh
sudo systemctl restart minitv-api.service
```

Los instaladores habituales y `update_minitv.sh` también instalan este servicio.
El servicio se ejecuta como root para instalar dependencias y reiniciar servicios
sin pedir una contraseña. Git y npm se ejecutan con el propietario de `.git`
(configurable mediante `MINITV_UPDATE_USER` durante la instalación), conservando
su acceso a Git y la propiedad de los archivos de código y compilación. No hace
falta conceder `sudo` sin contraseña al usuario. Tras actualizar una instalación
antigua, vuelve a ejecutar `sudo bash DeviceApp/install_update_service.sh` para
aplicar este cambio a la unidad instalada. Los archivos locales `user_settings.json`,
`subtitle_settings.json` y `game_settings.json` quedan fuera del backup de Git,
incluso cuando el `.gitignore` de la versión instalada todavía no los incluye.
La API existente se ejecuta como root y solo permite iniciar esta unidad fija;
ambos endpoints, `GET` y `POST /system/update`, requieren el PIN de la web.
Systemd conserva el resultado al reiniciar la API y limita la ejecución a 30 minutos.
Un bloqueo compartido impide solapar actualizaciones manuales y desde la web.

Si falla, consulta `journalctl -u minitv-update.service -n 100 --no-pager`.
No se revierte automáticamente el código tras un fallo. El éxito se comunica
solo después de compilar y comprobar que la API y el menú están activos.

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
4. Consultar completados, pendientes y el listado desplazable de errores, con el título,
   temporada/episodio y tipo de imagen (cartel, fondo, logo, fotograma, extra o retrato).
   Los fallos del original y sus miniaturas se agrupan por imagen. **Descartar imagen**
   cancela sus reintentos y la excluye de las portadas y galerías; el resto del título
   se conserva. La decisión se guarda en `ignored-images.json`, también para los
   reinicios y las actualizaciones de fichas. Si ya no quedan fallos sin resolver, el
   título pasa a completado; los fallos de datos o de otras imágenes siguen pendientes.
   Los errores de versiones anteriores se identifican con las fichas locales disponibles,
   sin descargar el catálogo de nuevo.
   Puede cerrarse el navegador: la cola
   sigue en la API. Al reiniciar el servicio, los trabajos interrumpidos se retoman.
5. Los títulos sin ID aparecen en una lista; asociarlos a su ficha TMDB desde la web
   y repetir. No se asignan resultados por similitud de nombres automáticamente.

La migración es idempotente: repetirla omite trabajos completos y reintenta fallidos,
reutilizando los archivos ya descargados. Un error parcial sin resolver nunca se marca completado;
las imágenes descartadas expresamente dejan de ser recursos requeridos.
La cola se persiste en `jobs.json`, los archivos se publican mediante reemplazo atómico
y las descargas tienen tiempo límite y reintentos para errores transitorios/429.
No se borran vídeos, perfiles ni imágenes al migrar. Los trabajos se deduplican por
ID TMDB, aunque haya varios archivos de vídeo para una misma película.

Al subir nuevos episodios se actualizan las fichas de esa serie para descubrir nuevas
temporadas e imágenes; los gráficos existentes no se vuelven a descargar. Durante la
navegación normal las fichas no caducan. Las búsquedas nuevas necesitan conexión;
las fichas e imágenes ya almacenadas se sirven sin conexión a TMDB. Enlaces externos
como IMDb, Rotten Tomatoes o su resolución mediante Wikidata conservan su comportamiento.

### Puntuaciones IMDb, Rotten Tomatoes y Metacritic con OMDb

Las fichas de películas y series pueden mostrar la puntuación de IMDb y su número
de votos, el porcentaje de Rotten Tomatoes y la nota de Metacritic sobre 100,
cuando [OMDb](https://www.omdbapi.com/) proporciona cada dato. Las fuentes que
faltan se muestran como **No disponible**. Solicita una clave en
[OMDb API Key](https://www.omdbapi.com/apikey.aspx), actívala desde el correo recibido
y guárdala en **Dashboard → Servicios auxiliares → Puntuaciones · OMDb**. **Probar conexión** verifica la
clave guardada y consume una consulta. La integración necesita también el backend
actualizado en la Raspberry; el modo demo no consulta OMDb.

La clave permanece en `DeviceApp/omdb_settings.json`, con permisos `0600`, excluida
de Git y conservada por el actualizador. La ruta de configuración protegida por el
PIN devuelve la clave para mostrarla en el formulario, sin caché HTTP ni almacenamiento
persistente en el navegador. Un campo vacío al guardar conserva la actual y **Eliminar clave** la borra. No se
debe poner la clave en variables `VITE_*`, en el código web ni en URLs del navegador.

Las consultas se hacen al abrir una ficha. Una misma respuesta de OMDb puede incluir
las tres fuentes, sin consultas adicionales por cada nota.
`MultimediaContent/OmdbCache/` conserva las notas durante siete días si existe
alguna y los títulos sin ninguna puntuación durante un día. Una nota
caducada sigue disponible si falla la conexión o se agota la cuota, indicando que
está pendiente de actualización. Los errores tienen una pausa antes de reintentar:
una hora si se agota la cuota, cinco minutos si se rechaza la clave y un minuto para
otros fallos de OMDb. No se programa una tarea periódica.
La caché anterior, que solo contenía IMDb, se renueva al abrir cada ficha por primera
vez con esta versión. Si falla la renovación se conserva la nota IMDb anterior.
Los valores ausentes se guardan como `null` y respetan la misma caducidad, evitando
consultas repetidas por notas que el proveedor no tiene.

Rotten Tomatoes procede de `Ratings` con la fuente exacta `Rotten Tomatoes` y un
valor porcentual. Metacritic procede de `Ratings` con la fuente `Metacritic` y un
valor sobre 100, usando `Metascore` como alternativa cuando ese dato falta o es
inválido. Solo se aceptan enteros entre 0 y 100; el cero es una nota válida.
Una nota opcional malformada queda ausente sin invalidar la puntuación IMDb.
No se utiliza `tomatoUserMeter`, que representa una puntuación de audiencia distinta.

Para preparar las fichas que ya están en el catálogo, abre
**Dashboard → Servicios auxiliares → Puntuaciones · OMDb** y pulsa el botón de
actualizar las fichas. La Raspberry crea un trabajo explícito en segundo plano
con las películas y series guardadas. Se deduplican los ID TMDB y los enlaces IMDb;
las fichas sin identificador aparecen aparte para poder completarlas.

La actualización reutiliza las notas vigentes y las respuestas sin puntuaciones
que ya están guardadas. Solo consulta las fichas que faltan, han caducado o tienen
la versión antigua de caché. Procesa un título cada vez con una pausa de medio
segundo entre títulos. Se puede cerrar el navegador o pulsar **Pausar**; la pausa
termina la consulta en curso y conserva el avance en
`MultimediaContent/OmdbCache/backfill.json`.

Al agotar la cuota, rechazar la clave o fallar la conexión, el trabajo queda pausado
con el título pendiente. Una respuesta antigua sirve para ver la ficha, pero no
marca ese título como actualizado. Después de resolver el problema, se puede
reanudar desde el mismo punto. Un reinicio de la API deja el trabajo pausado hasta
que se reanude manualmente. Las fichas sin correspondencia IMDb se cuentan como
fallidas y el resto del trabajo continúa.

Al reanudar se compara el trabajo con el catálogo actual: las fichas eliminadas se
descartan y las añadidas o con identificadores corregidos se incorporan pendientes.
Se conservan los resultados ya procesados de fichas con los mismos identificadores
y caché vigente, por lo que corregir una ficha problemática permite continuar.

El contador general de preparadas incluye las fichas con caché vigente aunque
OMDb no tenga notas para ellas. El resumen del trabajo distingue fichas con alguna
nota, sin notas y fallidas; una ficha reutilizada de la caché cuenta como procesada,
sin afirmar que se haya hecho una consulta nueva. Iniciar otro trabajo tras acabar
permite incluir fichas añadidas posteriormente.

Cuando falta el ID IMDb, se busca primero en la ficha TMDB local y después en
`/movie/<id>/external_ids` o `/tv/<id>/external_ids`, usando las credenciales TMDB
de la Raspberry. El resultado se guarda por ID TMDB, por lo que también funciona
con series preparadas antes de incorporar estos identificadores. La puntuación
IMDb se presenta separada de la puntuación TMDB; un título sin nota nunca recibe
una puntuación inventada.

Rutas protegidas por el PIN y con `Cache-Control: no-store`:

- `GET/POST /settings/omdb`: valores guardados `{settings: {configured, apiKey}}`; guardar
  `{apiKey: "..."}` o eliminar `{clearApiKey: true}`.
- `POST /settings/omdb/test`: verifica la clave guardada con una consulta.
- `GET /omdb/library`: inventario y progreso local, sin consultar los proveedores
  ni arrancar trabajos. `total` incluye los títulos identificables deduplicados;
  `ready` cuenta los que tienen caché vigente y `missingIds` enumera el resto.
- `POST /omdb/library` con `{action: "start"}` inicia o reanuda el trabajo y con
  `{action: "pause"}` solicita una pausa. Ambos devuelven el mismo estado que GET.
  `job` incluye `state`, `total`, `processed`, `ready`, `unavailable`, `failed`,
  `currentTitle`, `code`, `startedAt` y `finishedAt`. `processed` es la suma de
  `ready`, `unavailable` y `failed`; las fechas usan segundos Unix o `null`.
- `GET /omdb/ratings?imdbId=tt0111161`, o `?kind=movie&tmdbId=278`
  (`kind=tv` para series): devuelve `imdbId`, `rating`, `votes`, `updatedAt`
  (segundos Unix), `stale`, `rottenTomatoes` y `metacritic`. `rating` (1–10) y
  `votes` corresponden a IMDb; `rottenTomatoes` es un porcentaje entero y
  `metacritic` un entero sobre 100. Cada puntuación y `votes` pueden ser `null`.

Pruebas sin acceso a Internet:
`python -m unittest discover -s DeviceApp/tests -p 'test_omdb*.py'`.

Las fichas de películas y series también conservan el reparto completo disponible
en TMDB (identificadores, nombres y personajes) y el equipo, con sus funciones.
En series se usan los créditos agregados de todos los episodios. La preparación de
nuevas incorporaciones descarga estos datos y los retratos de las personas mostradas
automáticamente. Los avatares se descargan a 185 píxeles, se guardan como WebP y se
comparten entre títulos; no es necesario descargar las fotos originales.
Las fichas existentes se completan desde **Dashboard → Servicios auxiliares → TMDB
→ Reparto y equipo → Completar todas las fichas**. Esta acción descarga únicamente
los créditos y retratos que faltan; conserva los vídeos, imágenes y ajustes de cada ficha.
Las fichas con créditos antiguos y sin avatares vuelven a aparecer como pendientes.
La cola continúa al cerrar la web, se reanuda tras reiniciar la API y permite
reintentar fallos. Las fichas sin identificador requieren una coincidencia manual.

`GET /tmdb/credits` informa de la cobertura del catálogo instalado sin acceder a
Internet; `POST /tmdb/credits` encola los créditos pendientes. Ambos requieren PIN.
También se puede ejecutar `python3 DeviceApp/complete_media_credits.py` en la
Raspberry, con la API actualizada y en marcha; `--check` solo comprueba el estado.
El comando termina con código 1 si quedan títulos pendientes o sin identificar.
Las variantes ya guardadas con `append_to_response=credits` o
`append_to_response=aggregate_credits` se reutilizan sin volver a descargarlas.

API autenticada con el PIN habitual:

- `GET /tmdb/cache`: progreso, errores e identificadores pendientes de asignar.
- `POST /tmdb/cache`: encolar catálogo/reintentar fallidos.
- `GET /tmdb/cache?background=1&refresh=1` y `GET /tmdb/credits?background=1&refresh=1`:
  iniciar o compartir una comprobación local sin bloquear la respuesta HTTP.
  Mientras se calcula devuelven `calculating: true`; las consultas siguientes
  omiten `refresh=1` hasta recibir los contadores definitivos o un error HTTP.
  Los errores se conservan hasta solicitar una nueva comprobación. La web muestra
  un spinner durante la espera y, si falla, permite reintentar con «Actualizar estado».
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

Las descargas TMDB comparten un ritmo moderado en todo el proceso de la API,
incluidas la biblioteca y las colecciones de premios: una transferencia de imagen
y una consulta de metadatos simultáneas, cada una limitada a 256 KiB/s. Se dejan
250 ms entre imágenes y 500 ms entre consultas; los reintentos también respetan
estos límites. Las consultas interactivas pasan antes que los trabajos de catálogo
que aún estén esperando. Una operación ya iniciada termina o alcanza su timeout
de red de 10 segundos; cancelar interrumpe también las esperas y la lectura por
bloques. La conversión de miniaturas se hace de una en una, con pausas de 200 ms.
Estos límites no se aplican a la lectura de recursos ya guardados.

En el buscador, los carteles, temporadas y episodios se solicitan al acercarse a
la zona visible. Las vistas previas descargan de TMDB el tamaño reducido solicitado
cuando falta el original local; no descargan el original solo para mostrar una
miniatura. La preparación de la biblioteca sigue conservando los originales.
El formato de estas URLs sigue la [documentación de imágenes de TMDB](https://developer.themoviedb.org/docs/image-basics).

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
SRT. Permite elegir los 21 idiomas de MiniTV, con el idioma de la interfaz
seleccionado inicialmente. La Raspberry busca en
OpenSubtitles.com primero por la huella del vídeo (solo lee sus primeros y últimos
64 KiB); si no hay coincidencia, busca por el ID TMDB de la ficha guardada, o por
el nombre del fichero cuando no hay ID. Prioriza la coincidencia de versión,
fuentes fiables, valoración y descargas. Descarta otros idiomas, otras películas,
subtítulos parciales, traducciones automáticas y entregas divididas en varios CD.
La consulta de respaldo evalúa la primera página ordenada por descargas; es una
selección por compatibilidad estimada, no una garantía de sincronización.

Si no hay un subtítulo compatible, se ofrece **Traducir subtítulo con la IA**
desde una pista de texto disponible a cualquiera de esos 21 idiomas. Si no hay
una pista de origen, descarga primero un subtítulo en otro idioma o carga un SRT.
La traducción usa la configuración de OpenAI del dashboard y guarda una pista
`<nombre-del-vídeo>.<idioma>.ai.srt`, conservando los tiempos y el original.
Los idiomas sin catálogo propio en OpenSubtitles (pidgin nigeriano, árabe egipcio
y hausa) también permiten esta traducción. Chino y portugués usan los códigos
del proveedor `zh-cn` y `pt-pt`, respectivamente.

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

### Fichas de videojuegos e imágenes sin conexión

Al añadir una ROM, la web busca su nombre en **ScreenScraper** e **IGDB**, filtrando por la consola elegida. Selecciona la coincidencia correcta antes de subirla. El servidor obtiene la ficha completa por ID y descarga todas las carátulas, capturas y otras imágenes disponibles de esa fuente. Las subidas directas también buscan automáticamente; solo asocian un título exacto y sin ambigüedad.

Configura al menos una fuente en el `.env` de la raíz del repositorio de la Raspberry o en el entorno del servicio. Las credenciales se leen exclusivamente en el servidor; no deben incluirse en variables `VITE_*`.

```dotenv
# IGDB: aplicación Confidential registrada en Twitch Developer Console.
IGDB_CLIENT_ID=
IGDB_CLIENT_SECRET=

# ScreenScraper: credenciales de desarrollador; cuenta de usuario opcional.
SCREENSCRAPER_DEV_ID=
SCREENSCRAPER_DEV_PASSWORD=
SCREENSCRAPER_SOFTNAME=MiniTV
SCREENSCRAPER_USER=
SCREENSCRAPER_PASSWORD=
```

Documentación: [IGDB (registro y autenticación)](https://api-docs.igdb.com/#account-creation) y [ScreenScraper API v2](https://www.screenscraper.fr/webapi2.php). IGDB renueva el token OAuth en el servidor y limita sus peticiones; ScreenScraper se consulta secuencialmente. Si una fuente falla, la búsqueda conserva los resultados de la otra.

- `MultimediaContent/media_library.sqlite3`: ficha del juego, fuente/ID, fechas, descripción, géneros, desarrolladores, distribuidores, jugadores, puntuación y respuesta completa original de la fuente (incluidos los demás campos disponibles). Las credenciales de URLs de ScreenScraper se eliminan antes de guardar.
- `MultimediaContent/GameMetadata/`: caché de fichas por fuente, ID, consola e idioma. Seleccionar, subir y reintentar reutiliza la misma ficha.
- `MultimediaContent/GameCovers/`: imágenes locales con nombres derivados de la ruta completa de la ROM y la imagen; dos consolas pueden tener el mismo título sin sobrescribir archivos.

La biblioteca muestra los datos guardados sin consultar APIs. No se limita la galería a cinco imágenes. Las imágenes pueden tener hasta 16 MiB cada una; si una descarga falla, el juego y la ficha se conservan con estado `partial`. **Completar ficha e imágenes** reintenta lo que falta sin volver a subir la ROM y conserva las personalizaciones. Los estados `not_configured`, `not_found`, `needs_selection` y `error` indican por qué una ficha no está completa; nunca se comunica un fallo de metadatos como si hubiera fallado la subida de la ROM.

Rutas autenticadas: `GET /games/search`, `GET /games/metadata?source=…&id=…&platform=…&extension=…`, `GET /games/metadata?relativePath=Games/…` (ficha local completa), `POST /games/metadata` (`relativePath`, opcionalmente `source` e `id`, para completar/reintentar). `POST /games/upload` admite `metadataSource` y `metadataId`; conserva compatibilidad con `screenScraperId`. La vista previa usa `/games/metadata/image` como proxy de imágenes de los proveedores para mantener las credenciales fuera del navegador. Las imágenes elegidas manualmente y el texto personalizado prevalecen sobre la descarga automática.

Comprobación local sin credenciales: `PYTHONDONTWRITEBYTECODE=1 python -m unittest discover -s DeviceApp/tests -p 'test_game*.py'` (requiere Flask).

Las fuentes de juegos se pueden configurar desde **Dashboard → Servicios
auxiliares → Fichas de videojuegos**, mediante `GET/POST /settings/games` con PIN.
El servidor guarda las claves en `DeviceApp/game_settings.json` (permisos 0600,
excluido de Git); las respuestas solo indican presencia, nunca devuelven claves.
Los valores guardados tienen prioridad sobre `.env`; los campos omitidos se
conservan y una cadena vacía desactiva ese valor incluso si existe en `.env`.
Guardar no valida las credenciales contra el proveedor; la búsqueda utiliza
los cambios inmediatamente.

`GET /games/youtube?query=...` requiere PIN y busca hasta seis vídeos mediante
YouTube Data API v3, con filtros `videoEmbeddable=true` y `videoSyndicated=true`.
Usa `YOUTUBE_API_KEY` del entorno/`.env` o de la configuración de juegos del
dashboard. La clave permanece en el servidor; no se devuelven errores crudos del
proveedor. La caché en memoria dura 15 minutos y tiene un máximo de 128 búsquedas.

`POST /games/video` requiere PIN y recibe `{ relativePath, video: { id, name, channel } }`.
Guarda el vídeo principal elegido en `preferredVideo` dentro del perfil del juego
en SQLite. Valida el identificador de YouTube y que la ROM exista; no modifica
las imágenes ni los metadatos del proveedor. La selección se devuelve en la
biblioteca y se conserva al completar o actualizar la ficha.

### Búsqueda del catálogo con OpenAI

Configura la clave en **Dashboard → Servicios auxiliares → OpenAI**. Se guarda
en `DeviceApp/ai_settings.json`, con permisos 0600 y excluida de Git y de las
copias temporales del actualizador. La API de configuración protegida por el PIN
devuelve la clave y los ajustes para mostrarlos en el formulario, sin caché HTTP ni
almacenamiento persistente en el navegador; un campo vacío conserva la anterior y **Eliminar clave**
la borra. No hay que introducirla en `.env` del frontend ni en variables `VITE_*`.
Guardar y probar son acciones separadas. La prueba realiza una petición pequeña
al modelo guardado, incluso si la búsqueda está desactivada.

El selector del dashboard guarda el modelo predeterminado; en una configuración nueva
es `gpt-6.1-sol`. El selector de **Buscar** se abre con `gpt-6.1-sol` seleccionado y
permite elegir otro solo para esa consulta, o usar el modelo del dashboard, sin modificar
los ajustes guardados.
**Actualizar modelos** consulta `/settings/ai/models`, protegido por PIN, que obtiene
los modelos de texto de tu cuenta desde `/v1/models` sin devolver la clave. Se priorizan
los alias actuales (`chat-latest`, `gpt-6.1-sol`, `gpt-6-luna`, `gpt-6-astra`) disponibles;
también permite escribir un ID. Si falla la consulta, se indican las opciones predefinidas.
Se conserva el modelo que ya tenías guardado. La búsqueda requiere Responses y archivos
de texto; Fotos y recomendaciones también requieren Structured Outputs. Pulsa
**Subir catálogo a OpenAI** para generar un archivo `.txt` con películas, series,
libros y juegos presentes en la biblioteca. Incluye identificadores numéricos,
títulos y nombres alternativos, año, autor/director/creador/desarrollador y consola
cuando están disponibles. No incluye sinopsis, reparto, marcas de usuario ni los
archivos multimedia. Los datos se leen de las fichas locales sin descargar más
metadatos. Los identificadores son alias estables de las rutas internas; el mapa
se guarda en `DeviceApp/ai_settings_catalog.json`, con permisos 0600 y excluido de
Git y de las copias temporales del actualizador. Las rutas permanecen en el dispositivo.

La subida es **manual**. El panel muestra la fecha, cantidades por sección y si
hay cambios pendientes. Cada búsqueda adjunta el `file_id` guardado mediante la
[API Responses de OpenAI](https://developers.openai.com/api/docs/guides/file-inputs),
con `store: false`. No usa File Search ni un índice
vectorial. El archivo subido permanece en OpenAI para reutilizarlo; `store: false`
no borra ese archivo ni evita el consumo de tokens al consultarlo. El botón de
actualización sube una nueva versión y, después de guardarla, intenta borrar la
anterior. Si la subida falla, conserva la versión anterior. Si solo falla la
limpieza, la nueva versión sigue activa y el panel avisa. Cambiar o eliminar la
clave desasocia el archivo; para usar otra clave hay que subir de nuevo el catálogo.

Las instrucciones se limitan a usar el catálogo adjunto y el conocimiento de las obras,
buscar solo registros de la sección activa y devolver exclusivamente un array JSON de IDs:
`[123,456]` o `[]` si no hay coincidencias. No se pide explicación, intención ni recuento,
y no se añade un esquema con todos los IDs a la petición. El servidor valida el array,
acepta enteros o cadenas decimales exactas y rechaza IDs de otras secciones o inexistentes.
**Depurar** muestra las instrucciones exactas, el modelo elegido y `scope` con
`responseFormat: id_array` e `idConstraint: server_validation`. El archivo ya subido sigue sirviendo.

El modelo puede usar su conocimiento de las obras para interpretar temas, tonos,
similitudes, actores y referencias indirectas; puede equivocarse o desconocer
obras. Devuelve IDs de la sección consultada. El servidor rechaza IDs inventados
o de otra sección, elimina duplicados y descarta elementos ya borrados del disco.
Los resultados se cruzan con la vista y filtros existentes. Los recuentos cuentan
los IDs validados de la instantánea subida que siguen disponibles. Las altas
posteriores no aparecen hasta volver a subir el catálogo; los cambios pendientes
se indican en los resultados. Una búsqueda puede devolver hasta 2000 IDs; si la
respuesta está incompleta se rechaza, sin aplicar un filtro parcial. Las consultas
por el total de una sección devuelven sus IDs y el servidor calcula el recuento.

El botón **Depurar**, junto a Buscar, muestra el diagnóstico de la última consulta:
texto original del modelo, cuerpo de respuesta de OpenAI, estado HTTP y de Responses,
modelo, archivo adjunto, uso de tokens y fase de validación. Los errores de formato
incluyen el campo y motivo; los IDs desconocidos se enumeran. `/ai/search` devuelve
este informe en `debug`, también en respuestas de error. Solo está disponible tras
la misma protección por PIN que la búsqueda, con `Cache-Control: no-store`.
No se envían cabeceras de autorización y se ocultan las claves en el contenido.
El cuerpo del proveedor se limita a los primeros 256 KiB y se marca si se recortó.
No se guarda un historial de diagnóstico en disco ni en el almacenamiento del
navegador. Abrir el panel o copiar el informe no llama de nuevo a OpenAI. Las
consultas realizadas antes de esta versión deben repetirse para obtener el informe.

La aplicación admite un archivo de hasta 8 MiB, pero el catálogo también debe
caber en el contexto del modelo configurado. Si OpenAI rechaza el archivo o el
contexto, la interfaz informa del problema. **Fotos** mantiene el filtro local por
nombre de archivo y no se incluye en la subida. Las búsquedas no analizan vídeos
ni imágenes. **Recomiéndame** conserva su flujo independiente.

En películas y series, el modo **Recomiéndame** mantiene una conversación por
perfil. Si faltan gustos, pregunta por géneros, actores o títulos; una petición
concreta puede producir recomendaciones directamente. Los gustos explícitos se
guardan en `recommendation_profiles`, una tabla de `user_profiles.sqlite3`, con
seis listas editables (géneros, actores, directores, títulos favoritos, géneros
y títulos que no gustan). Cada lista admite 12 entradas de hasta 100 caracteres.
Se comparten entre películas y series; cada sección conserva sus últimos 12
mensajes. El contexto también incluye los títulos verificados sugeridos para
entender referencias en las siguientes consultas. Los estados pasajeros no se
convierten automáticamente en gustos permanentes.

Para recomendar, OpenAI recibe esos gustos, la conversación reciente y hasta
80 candidatos con metadatos abreviados y marcas de visto/favorito del perfil
activo. No recibe nombres ni identificadores de usuario, rutas, archivos ni
credenciales de otros servicios. La memoria se conserva en el dispositivo;
`store: false` controla el almacenamiento de Responses, sin sustituir las
políticas de tratamiento de datos de la API. El PIN compartido de la casa sigue
permitiendo cambiar entre perfiles; no son cuentas con autenticación separada.

El servidor devuelve hasta cinco recomendaciones. La pertenencia a la biblioteca
se comprueba con rutas reales e identificadores TMDB. Hasta dos sugerencias
externas se verifican con las búsquedas oficiales de
[películas](https://developer.themoviedb.org/reference/search-movie) o
[series](https://developer.themoviedb.org/reference/search-tv): coincidencia exacta
de título y año cuando se conoce, sin elegir resultados ambiguos. Cada consulta
TMDB espera como máximo 12 segundos y no se reintenta. Si falla, se conservan las
recomendaciones locales verificadas y se avisa. No se descargan torrents desde
esta API: la web abre la ficha y la búsqueda existente para que el usuario elija.

**Olvidar mis gustos y conversación** limpia ambas secciones sin afectar a marcas
ni progreso. El borrado de un usuario elimina también su memoria. Las escrituras
usan una revisión atómica: una consulta pendiente no puede deshacer un borrado
ni sobrescribir gustos modificados en otra pestaña.

Rutas protegidas por el PIN de la web:

- `GET/POST /settings/ai`: estado y configuración (`enabled`, `model`,
  `requestsPerMinute`, `apiKey` y `clearApiKey`).
- `GET /settings/ai/models`: modelos de texto disponibles en la cuenta y
  `defaultModel`, sin credenciales. Espera hasta 15 segundos a OpenAI.
- `POST /settings/ai/test`: comprueba la clave y el modelo guardados.
- `GET /settings/ai/catalog`: estado de la subida y comparación con la biblioteca.
- `POST /settings/ai/catalog`: sin cuerpo; genera y sube el catálogo compacto con la
  clave guardada, incluso si la búsqueda está desactivada.
- `POST /ai/search`: recibe `section` (`movies`, `series`, `books`, `games` o
  `pictures`), `prompt` (hasta 2000 caracteres), `language` (`es`, `ca`, `en`) y
  opcionalmente `model`, que solo se aplica a esa búsqueda.
  Devuelve intención, mensaje, rutas y recuento. En las secciones con archivo el
  servidor adapta el array de la IA a este formato, con `intent: filter` y mensaje vacío;
  la IA no genera esos campos. Las secciones con archivo
  incluyen `catalogStale` y `catalogUploadedAt`; fotos incluye cobertura de metadatos.
- `GET /ai/recommendations?userId=…&section=movies|series`: gustos, historial y
  `revision` del perfil existente; funciona con la IA desactivada.
- `POST /ai/recommendations`: recibe `userId`, `section`, `revision`, `prompt`
  y `language`. Devuelve memoria actualizada, pregunta, tarjetas y avisos.
- `PATCH /ai/recommendations`: recibe `userId`, `section`, `revision` y las seis
  listas completas en `preferences`. `DELETE` recibe los tres primeros campos
  en JSON y borra gustos e historiales. Una revisión antigua devuelve 409.

Se permite una petición simultánea y, por defecto, diez por minuto entre todos
los navegadores, incluidas las subidas, recomendaciones y pruebas de conexión. El límite es configurable
entre 1 y 30; se reinicia al arrancar el servidor y no sustituye un presupuesto
de gasto configurado en OpenAI. Las subidas y consultas con archivo tienen hasta
60 segundos de espera del proveedor; el resto de consultas, 30. La salida está
limitada y las llamadas no se reintentan automáticamente.

Pruebas sin usar una clave real:
`python -m unittest discover -s DeviceApp/tests -p 'test_*ai*.py'` (requiere Flask).
Hay pruebas adicionales de proyección/filtrado en `tests/test_ai_catalog.py`.

### Registro de consumo de la API

`ai_usage.py` registra las inferencias en `ai_settings.usage.sqlite3`, junto a
`ai_settings.json` (archivo 0600). Inicia el registro antes de enviar la petición
y captura consumo, modelo efectivo, ID de petición, duración, estado, tarea y
tarifa aplicada. El almacenamiento usa enteros en nanodólares para evitar errores
de redondeo al sumar; la API devuelve USD. No persiste prompts ni contenido.
Si no se puede iniciar el registro se evita enviar una petición de pago; si falla
su finalización, la fila pendiente conserva la incertidumbre sin repetirla.

Rutas protegidas por el PIN y con `Cache-Control: no-store`:

- `GET /settings/ai/usage?start=YYYY-MM-DD&end=YYYY-MM-DD&period=day|week|month|year`:
  totales, serie y desglose local, costes importados y primeras 50 llamadas.
  Los extremos son inclusivos y UTC. Admite `operation`, `model`, `group` y
  `page` (desde cero); los totales siempre corresponden a todo el filtro.
- `GET|POST /settings/ai/billing`: configuración de consulta histórica.
  POST admite `adminKey`, `projectId`, `apiKeyId` y `clearAdminKey`. Una clave
  vacía conserva la anterior. GET solo devuelve presencia de clave e IDs.
- `POST /settings/ai/billing/sync` con `{start,end}`: consulta explícita a
  `/v1/organization/costs`, limitada a 366 días, con paginación, sin redirecciones
  ni reintentos automáticos. Se exige proyecto para acotar el coste recuperado.
  Cada intervalo se sustituye en una transacción, aislado por proyecto/ID de
  clave. Si falla una página o cambia la configuración no se aplica el resultado.

Las tarifas estándar verificadas el 21/10/2026 están en `TEXT_RATES` e
`IMAGE_RATES`, con [precios oficiales](https://developers.openai.com/api/docs/pricing).
La caché se descuenta de la entrada; los tokens de razonamiento ya están
incluidos en la salida. Las ediciones de imágenes distinguen entrada de texto e
imagen y no aplican descuentos de caché de la API Responses. Se conserva una
copia de la tarifa por llamada. Modelos desconocidos, modalidades no soportadas,
contextos largos de GPT-6 o datos ausentes permanecen sin importe estimado.

El registro no reconstruye llamadas anteriores, no incluye la suscripción de
Codex y no sustituye la facturación de OpenAI. Sus importes no se suman a los
de la [API de costes](https://developers.openai.com/api/reference/resources/admin/subresources/organization/subresources/usage/methods/costs).
Incluye `ai_settings.usage.sqlite3` en las copias privadas de seguridad: contiene
el historial y, si se configura, la clave Admin. Pruebas sin llamadas de pago:
`python -m unittest discover -s DeviceApp/tests -p 'test_ai_usage.py'`.

## Codex en el dashboard

La pestaña **Dashboard → Codex** permite enviar prompts y ver respuestas, comandos,
cambios e historial desde la web. Requiere instalar Codex en la Raspberry y
vincular tu cuenta desde el propio panel. Trabaja con un usuario sin privilegios
y una copia de desarrollo independiente. [Instalación y uso](CODEX.md).

## Biblioteca de fotos

`photo_library.py` conserva los álbumes en
`MultimediaContent/photo_library.sqlite3`, los originales y variantes en
`MultimediaContent/Pictures` y las miniaturas en `MultimediaContent/PhotoCache`.
Incluye esos tres elementos en la copia de seguridad. Las fotos existentes se
indexan en segundo plano al abrir Fotos, conservando sus rutas físicas y
apareciendo en la Galería plana. La fecha de subida de fotos anteriores se aproxima con la fecha de
modificación; la fecha de captura procede del EXIF o de los metadatos importados
desde Fotos del Mac. Los álbumes son
lógicos: añadir una referencia no renombra los ficheros ni pierde las marcas por perfil.
No muevas archivos manualmente después de indexarlos.

El **visualizador de fotos** (la vista grande compartida por Galería, Personas,
pendientes, mapa y álbumes) permite **Añadir a álbum** además de asignar caras.
Puedes elegir un **Álbum existente** o **Crear nuevo álbum** y añadir la foto
abierta en una sola operación. Los destinos que ya contienen esa foto aparecen
como **Ya incluida**. Al guardar o cancelar sigues en la misma foto del visualizador;
se conservan el original y todas sus referencias anteriores. La acción usa
`POST /pictures/albums/add`, también disponible en el modo demo local.

Junto al nombre del fichero puedes elegir **JPG** (la vista optimizada, por
defecto) u **Original** (el archivo guardado, sin reducir su calidad). El visor
muestra el spinner habitual durante la carga, conserva el zoom al cambiar de
calidad y mantiene la elección al pasar a otra foto. Si el navegador no admite
el formato original, puedes volver a JPG o descargarlo.

**Borrar foto** abre una confirmación con el nombre de la foto. Desde un álbum
o una persona puedes quitar solo esa referencia o borrar la imagen de Galería.
Desde Galería solo se ofrece el borrado completo, que elimina el original y
todas sus referencias. Cancelar mantiene abierta la misma foto; al completar
la eliminación se cierra el visor y se actualiza la biblioteca.

La migración `gallery-v1` cambia la pertenencia principal de todas las fotos a
`gallery`. Elimina la jerarquía antigua de Uploads sin tocar archivos, fechas,
GPS o personas, y lleva las carpetas propias de la raíz a `albums`. Las
asociaciones se guardan en `photo_albums`; Galería no permite subcarpetas.
`POST /pictures/albums/add` (y el alias antiguo `/pictures/move`) añade referencias
sin retirar las anteriores. `POST /pictures/photos/delete` requiere `ids` y un
`scope` explícito: `album` exige `folderId` y solo elimina esas asociaciones;
`gallery` elimina la foto y todas sus asociaciones, metadatos y huellas.
Ambas rutas requieren el PIN. Una selección obsoleta falla sin borrar parcialmente.
El borrado registra primero las rutas en `photo_deleted_files`: aunque falle la
limpieza del disco, las fotos no se sirven ni vuelven a indexarse. La API reintenta
la limpieza al reiniciarse y comunica `cleanupPending` si queda algún archivo.
Las miniaturas `render=tiny` son JPEG de 24 px hechos a partir de la caché de 600 px.

Pillow permite validar las imágenes, leer EXIF y preparar vistas JPEG orientadas
para el navegador. `pillow-heif` añade HEIC/HEIF. **Personas** requiere además
el detector HOG y la red neuronal ResNet de dlib. Instala en la Raspberry, desde
la carpeta del proyecto actualizado:

```bash
sudo bash DeviceApp/install_photo_support.sh --faces
```

Omite `--faces` si solo quieres añadir soporte HEIC. El instalador crea un entorno
Python en `/opt/minitv-photo-python`, conserva los paquetes del sistema y añade
un override a `minitv-api.service` para usarlo. Reinicia solo la API después de
comprobar los imports y ejecutar ambos modelos con una imagen de prueba.
`update_minitv.sh` también prepara este soporte y difiere el reinicio al final de
la actualización (`--no-restart`). El instalador es idempotente; si el motor pasa
la comprobación, no vuelve a instalar dependencias. Compila dlib con un único
proceso y prioridad baja. La primera instalación descarga paquetes y modelos,
puede tardar y necesitar memoria adicional en Raspberry antiguas. No analiza fotos.

`photo_faces.py` usa CPU, imágenes reducidas a 800 px, un proceso separado con
prioridad baja y afinidad a un solo núcleo en Linux, y limita los hilos de BLAS/OpenMP
a uno. Solo carga el predictor de cinco puntos y ResNet; no carga modelos CNN ni
el predictor de 68 puntos. Entre fotos descansa tanto tiempo como ha trabajado
(mínimo 250 ms); las vistas y subidas tienen prioridad para descodificar imágenes.
Al alcanzar 75 °C se pausa y pide continuar explícitamente después de enfriar.
Se mantiene una tolerancia conservadora de 0,48. Puede separar a una
persona en varios grupos o asociar caras parecidas; las coincidencias se pueden
revisar y quitar desde la web. No identifica personas por un nombre externo.

La asignación automática distingue coincidencias fuertes (distancia menor de
0,36) de las moderadas (menor de 0,48). Las moderadas necesitan una muestra
confirmada o coincidencias en dos fotos de referencia distintas. Además, la
mejor identidad debe separarse de la segunda por al menos 0,05; de lo contrario
se conserva una persona provisional independiente para revisión. Estos valores
pertenecen al espacio de dlib y requieren evaluación con fotos reales: no son
porcentajes de certeza ni umbrales trasladados de otro modelo. No se reagrupan
automáticamente las identidades existentes. Una fecha de nacimiento conocida
excluye coincidencias anteriores a ella cuando la foto tiene fecha de captura.

`photo_face_matching.py` compara fuera del bloqueo del catálogo y vuelve a leer
los datos si hay una corrección concurrente. La búsqueda usa una caché acotada
de vectores compactos, abandona comparaciones que ya superan la distancia y
ordena solo identidades próximas. Sigue siendo una búsqueda lineal, sin índice
vectorial ni dependencias nuevas. El progreso y las detecciones se confirman en
una sola transacción; pausar durante las comparaciones conserva la foto pendiente.
Una respuesta con dimensiones incompatibles o valores no finitos se rechaza
entera, sin borrar caras existentes ni marcar la foto como revisada sin caras.

Quitar una detección guarda un rechazo local a esa foto en `face_rejections`,
que sobrevive a reinicios y nuevas detecciones. Dibujar manualmente una cara en
la región permite recuperarla. Los rectángulos confirmados conservan su identidad
aunque cambie el vector al detectar de nuevo, evitando duplicados sobre la misma
cara. Los rechazos se eliminan junto con la foto. Los nombres, portadas, revisiones
pendientes y la carpeta Desconocido conservan sus funciones.

El análisis se inicia explícitamente desde **Personas → Analizar** y revisa
como máximo **100 fotos por lote**. Al terminar se detiene y libera los modelos;
**Analizar siguientes 100** inicia otro lote cuando lo decidas. La cola y el
avance se guardan en SQLite (`face_analysis` y `face_analysis_items`); **Pausar**
interrumpe el proceso incluso durante una foto y libera sus modelos; esa foto
permanece pendiente. **Continuar analizando** retoma las pendientes. Cerrar
la página no detiene el lote actual; reiniciar la API lo deja pausado. Cada lote
incluye originales pendientes, fallidos e importados con estado `skip` o
`imported`, y excluye variantes de IA. No consulta iCloud ni ningún servicio
externo. Los nombres de Apple no se usan para crear o nombrar grupos. Las
asociaciones antiguas con codificaciones vacías se conservan en SQLite pero no
aparecen en Personas; los metadatos originales siguen disponibles para descargar.
Las fotos añadidas durante un lote quedan disponibles para el siguiente.
El porcentaje cuenta fotos revisadas, incluidas las fallidas, que se muestran
por separado y pueden reintentarse. Los grupos se publican tras cada foto.
Se puede renombrar una persona y guardar su portada durante el análisis; la
portada debe pertenecer al grupo y se retira si se quita esa asociación o foto.
Las rutas con PIN son `POST /pictures/people/scan`, `/pictures/people/pause` y
`/pictures/people/<id>/cover` (JSON `{ "photoId": "..." }`).

**Personas → Pendientes de validar** reúne únicamente fotos con coincidencias
automáticas nuevas en personas que ya existían al comenzar ese lote. Los grupos
creados durante el propio lote quedan fuera, también al pausarlo y continuarlo
después de reiniciar. Las tarjetas de las personas indican cuántas fotos tienen
pendientes. Se pueden validar las coincidencias de una foto desde la miniatura,
las de varias fotos en Modo edición, o cada cara por separado desde el visor.
Corregir una cara, pasarla a Desconocido o quitarla resuelve solo su pendiente.
Una confirmación explícita conserva la asignación al repetir la detección.

En **Sin personas**, **Nuevas** separa las incorporaciones aún sin revisar de
**Resto**. **Marcar como revisada** las lleva a Resto sin mover ni borrar la foto.
Abrir una foto no la valida. Ambos tipos de pendientes se guardan en SQLite
(`photo_reviews`) y se acumulan entre lotes hasta revisarlos. `face_review_batch`
conserva las personas existentes al inicio del lote. La migración no marca
coincidencias antiguas como nuevas y deja las fotos anteriores sin caras en Resto.
El seguimiento empieza con los análisis posteriores a la actualización.
`POST /pictures/reviews/confirm` recibe `{ "ids": ["id-de-revisión"] }`, requiere
el mismo PIN y valida toda la selección antes de aplicar cambios; una revisión
obsoleta devuelve 409 sin confirmar otras por accidente. Actualiza DeviceApp y
WebApp juntos. Pruebas: `python -m unittest discover -s DeviceApp/tests -p 'test_photo_*.py'`
y, desde WebApp, `node --test tests/photo*.test.js`.

La edición múltiple usa `POST /pictures/people/merge` con `{ "ids": ["..."],
"personId": "destino" }` y `POST /pictures/people/delete` con `{ "ids": ["..."] }`.
Se validan todas las personas antes de aplicar la operación en una transacción.
Eliminar retira la identidad y mueve sus caras a **Desconocido**, sin borrar fotos
ni referencias de otros álbumes. No se puede eliminar ni unir la carpeta fija
**Desconocido** como origen. `POST /pictures/people/download`, también con `ids`,
devuelve un ZIP de originales con sus rutas relativas, sin duplicar fotos
compartidas. El ZIP usa un archivo temporal en disco, que se cierra al terminar
la respuesta, y no comprime de nuevo las imágenes. Estas rutas requieren el PIN
igual que el resto de la biblioteca.

Cada detección guarda su rectángulo normalizado sobre la imagen orientada,
vector y persona en `face_detections`. El visor dibuja todas las caras y resalta
la persona cuya carpeta se está viendo. Al pulsar una cara puedes asignarla a
una persona identificada o crear un nombre; `knownPeople` excluye los grupos
provisionales «Persona N», que siguen disponibles en `people` para revisarlos y
renombrarlos. Las rutas de asignación y alta manual rechazan esos grupos como
destino hasta que tengan un nombre. La corrección solo afecta a esa cara
y se conserva al volver a detectar. **Personas → Sin personas** reúne únicamente
originales revisados sin ninguna cara; excluye pendientes y errores.

**Desconocido** es una carpeta fija, disponible incluso vacía, para caras que no
quieres etiquetar. Aparece primero al elegir una persona en el visor o al unir
una carpeta completa. Usa el ID reservado `unknown`; se crea automáticamente
también en bibliotecas existentes y no se puede renombrar ni unir a otra carpeta.
Las asignaciones se conservan al repetir el análisis y pueden corregirse cara
por cara desde el visor. Al contener personas distintas, sus vectores no se usan
para asignar automáticamente nuevas caras a esta carpeta. Al pasar una cara a
Desconocido, su `person` cambia a `unknown`: se elimina la asociación anterior de
esa cara, se actualizan sus referencias y portada, y su vector deja de servir
como muestra de la identidad anterior. Las demás caras no cambian de persona.

**Detectar personas** en el visor analiza una sola foto y puede pausarse. Comparte
los límites de CPU y temperatura con los lotes, no ejecuta otro detector en
paralelo y conserva cualquier lote pausado. Su estado se guarda en
`face_photo_jobs`. Las rutas con PIN son `GET /pictures/photos/<id>/faces`,
`POST /pictures/photos/<id>/detect` y
`POST /pictures/photos/<id>/faces/<faceId>/assign` (JSON con `personId` o `name`).
Solo se devuelven rectángulos y nombres, nunca vectores. Al actualizar, los grupos
locales anteriores conservan sus nombres y sus fotos quedan pendientes para
obtener los rectángulos en un lote nuevo. Las colas antiguas de más de 100 fotos
se reinician sin descartar resultados ya guardados.

En otros entornos instala `requirements-photos.txt` o
`requirements-photo-faces.txt` con el mismo Python que ejecuta la API. Las rutas
`/pictures/library`, `/pictures/upload`, `/pictures/folders`, `/pictures/move`,
`/pictures/generate` y `/pictures/people/...` usan el PIN de la aplicación. Las
previsualizaciones en `/pictures/content?render=tiny|thumb|preview` también requieren
PIN. Las claves de OpenAI y los vectores faciales nunca aparecen en el catálogo.
La IA usa la configuración existente del Dashboard; consultar carpetas, añadir
referencias o analizar caras no hace llamadas a OpenAI.

La importación de Apple Fotos requiere también `photo_import.py`. La web envía
un multipart con las imágenes y un archivo `metadata` JSON que contiene sesión,
lote, metadatos normalizados y los JSON originales. La API valida límites y campos,
conserva los archivos originales y guarda los metadatos completos fuera del resumen
del catálogo. `GET /pictures/metadata/<id>` permite descargarlos con el PIN habitual
y `Cache-Control: no-store`. Incluye la base SQLite en las copias de seguridad:
contiene también los metadatos, las asociaciones a álbumes/personas, los hashes
de deduplicación y los recibos de lotes para reintentar sin repetir guardados.

`POST /pictures/import/check` recibe `digests` (1–20 SHA-256 hexadecimales) y
devuelve los índices `missing`, con PIN y sin caché. Consulta el índice y comprueba
existencia, tamaño y fecha del archivo, sin descodificar ni recorrer la biblioteca.
El multipart puede enviar solo esos archivos, indicando `fileIndices`, junto con
los `digests` y `records` del lote completo; admite cero imágenes cuando todas
existen. La API verifica las huellas de los archivos recibidos y conserva los
metadatos de las referencias. Una referencia desaparecida produce 409 y la web
consulta de nuevo una vez. Los recibos siguen evitando repetir lotes confirmados.

El asistente filtra los JSON antes de enviar fotos y marca el lote con
`geolocatedOnly: true`. La API vuelve a validar que todas las fotos tengan latitud
y longitud válidas, las guarda directamente en `gallery`, omite la recreación
de álbumes y asociaciones de personas y deja el análisis facial como `pending`.
Los metadatos originales se conservan. Las subidas ordinarias también guardan el original en Galería y, cuando se
elige un álbum, añaden una referencia. La web pide `/videos?pictures=0` al arrancar para no
recorrer ni transferir otra vez toda la colección de fotos con el catálogo general.
Las importaciones preparan una miniatura JPEG de hasta 600 px y una vista de
hasta 2400 px aprovechando la misma descodificación de validación. El original
permanece intacto. `photo_previews.py` prepara las fotos existentes en segundo
plano al abrir la biblioteca, de una en una y empezando por las más recientes.
Todas las operaciones de imagen comparten un único turno de descodificación:
el visor tiene prioridad, después las miniaturas visibles y las subidas, y al
final la preparación en segundo plano. Las dos vistas se generan juntas, se
escriben de forma atómica y reutilizan los JPEG que ya estuvieran en caché.
La imagen se reduce antes de copiar sus píxeles para limitar el uso de memoria.

`GET /pictures/content?relativePath=…&download=1` descarga el original del catálogo
con su nombre y extensión originales mediante `Content-Disposition: attachment`.
Mantiene la autenticación del endpoint, valida la ruta y admite peticiones Range;
no descodifica ni convierte la imagen, aunque se envíe además `render=thumb`.
Las peticiones normales de miniatura y vista grande siguen mostrándose inline.

El asistente envía `continueOnError: true`: una imagen ilegible se devuelve en
`rejected` con su índice de lote, nombre y motivo; las imágenes válidas se guardan
y la importación continúa. El recibo del lote incluye esos errores para que una
respuesta perdida no duplique guardados ni oculte fallos. Los errores de metadatos,
almacenamiento o conexión siguen interrumpiendo el lote para poder reintentarlo.
La web muestra las fotos pendientes, permite descargar la lista completa y
reintentar solo esas fotos en la misma carpeta. Los clientes que no activan esta
opción conservan la validación atómica del lote completo.

La biblioteca de fotos no tiene sondeo periódico cuando está en reposo. Al volver
a la pestaña consulta `GET /pictures/status`, una respuesta pequeña con revisión y
actividad que no recorre fotos, metadatos ni caras ni inicia una indexación.
Solo descarga el catálogo si cambia su revisión; las acciones explícitas también
lo actualizan. Mientras hay indexación, análisis facial o generación en curso,
consulta ese estado cada 15 segundos y se detiene al terminar. Las consultas se
suspenden con la pestaña oculta y durante la importación.

Cada foto se valida y descodifica una sola vez antes de bloquear el catálogo, y su
hash se calcula mientras se escribe. El listado de Personas obtiene todas sus
asociaciones en una consulta, evitando una consulta por persona en cada refresco.

Los nombres de Apple se conservan únicamente en el JSON de metadatos original;
Personas muestra los grupos calculados localmente. Reimportar una foto conserva
el análisis local ya completado y no añade asociaciones de Apple.
Consulta el [flujo de exportación e importación](../WebApp/README.md#importar-desde-fotos-del-mac)
para límites, formatos y reanudación.

### Inspeccionar un torrent antes de descargar

«Ver contenido» despliega los nombres y tamaños de los archivos del resultado,
y los capítulos reconocidos por nombres como `S01E02` o `1x02` (incluidos vídeos
con varios capítulos). Esta identificación no garantiza una temporada completa.
`GET /torrents/preview?infoHash=…` devuelve `loading` mientras obtiene los metadatos
y `ready` con `files` al terminar; requiere la misma autenticación que las descargas.
La consulta usa una sesión aislada de `python3-libtorrent`, con `upload_mode` y
sin gestión automática para impedir solicitudes de piezas de vídeo
([documentación de libtorrent](https://www.libtorrent.org/reference-Core.html)).
No añade tareas a Transmission ni importa contenido. Hay un máximo de dos consultas
simultáneas, 45 segundos de espera y una caché en memoria de hasta 32 resultados
por diez minutos. Si ningún peer responde, el visor permite reintentar.
El instalador de torrents incluye `python3-libtorrent`; en instalaciones existentes,
ejecuta de nuevo `bash DeviceApp/install_torrent_support.sh` y reinicia la API.
