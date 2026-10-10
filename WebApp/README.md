# WebApp

## Puntuaciones de IMDb, Rotten Tomatoes y Metacritic con OMDb

En **Dashboard → Servicios auxiliares → Puntuaciones · OMDb**, guarda la clave obtenida en
[OMDb](https://www.omdbapi.com/apikey.aspx) y pulsa **Probar conexión**. La clave
se guarda en la Raspberry y se muestra en el formulario de configuración al acceder
con el PIN. No se incluye en la compilación ni se guarda en el almacenamiento del
navegador. El plan gratuito de OMDb permite 1.000 consultas al día.

Las fichas de películas y series, incluidas las vistas previas del buscador TMDB,
muestran IMDb sobre 10 con sus votos, Rotten Tomatoes en porcentaje y Metacritic
sobre 100, cuando OMDb los proporciona, junto a la fecha de actualización.
Las tres puntuaciones se obtienen de la misma respuesta, sin claves ni consultas
adicionales. Cada fuente sin nota se indica como «No disponible». Se consulta al
abrir una ficha, con caché persistente de siete días; navegar por la biblioteca
no descarga todas las puntuaciones. Si falla una actualización se muestra la nota
guardada con un aviso. Las cachés antiguas que solo contienen IMDb se completan
al volver a abrir la ficha; si falla la consulta se conserva la nota anterior. La
valoración TMDB conserva su etiqueta y no se usa para rellenar una nota IMDb.

Para completar de una vez las fichas existentes, pulsa **Actualizar fichas**
en esa misma tarjeta de OMDb. La Raspberry recorre las películas y
series identificadas y consulta únicamente las notas pendientes o caducadas.
Se muestran el progreso, los títulos sin puntuaciones y las fichas sin identificar.
La tarea continúa al cerrar la página; puedes pausarla y reanudarla. Si OMDb
rechaza la clave, agota la cuota o falla la conexión, se pausa conservando el
progreso. Tras reiniciar la Raspberry requiere reanudarla manualmente.

Requiere actualizar también DeviceApp y configurar la clave en cada Raspberry.
El modo demo no consulta OMDb ni inventa puntuaciones.

En **Películas** y **Series**, el selector **Puntuación** junto a **Ordenar por**
permite elegir TMDB (sobre 5), IMDb (sobre 10), Rotten Tomatoes (%) o Metacritic
(sobre 100). La fuente elegida se usa en las tarjetas, en la puntuación principal
de la ficha y al ordenar por puntuación; se recuerda en ese navegador para ambas
secciones. Las notas ausentes se muestran como «No disponible» y quedan al final
en ambos sentidos de ordenación. La biblioteca lee las notas OMDb ya guardadas,
incluidas las antiguas, sin consultas externas. **Actualizar fichas** permite
completar las pendientes; al abrir una ficha se actualiza también su nota en la
biblioteca.

## Usuarios y progreso

El avatar situado a la derecha de **Fotos** abre un selector vertical animado.
La app inicia cada sesión con el perfil `default`; el cambio de usuario afecta a
favoritos, vistos/leídos y posiciones de reproducción o lectura. Los perfiles
nuevos empiezan vacíos y no importan las antiguas marcas compartidas del navegador.

**Dashboard → Users** permite crear, editar y borrar perfiles, cambiar su nombre,
subir una foto JPG/PNG/WebP o elegir entre 25 avatares locales en una cuadrícula
de 5×5. El perfil `default` se puede renombrar y personalizar, pero se conserva
como perfil de inicio. Al borrar otro perfil se eliminan sus marcas y progreso;
si estaba activo, se vuelve a `default`.

Después de elegir dónde abrir un vídeo o libro, se ofrece **Continuar** o
**Empezar desde el principio** solo si ese usuario ya tiene una posición guardada.
Los vídeos guardan segundos; PDF/CBZ/CBR guardan páginas; EPUB guarda una posición
CFI que se conserva al cambiar la pantalla o el tamaño de letra. Llegar al final
marca el contenido como visto/leído. Cambiar de perfil no reasigna una reproducción
que ya está en curso a otro usuario.

Los datos se guardan en `MultimediaContent/user_profiles.sqlite3`, compartidos entre
navegadores que se conectan a la misma Raspberry. El modo maqueta usa su propio
almacenamiento local. Si falla un guardado, aparece un aviso con reintento; no
conviene cerrar esa pestaña hasta que se guarden los cambios. Son perfiles de la
biblioteca familiar, protegidos por el PIN común de la MiniTV, sin contraseñas
individuales. Las fuentes de los avatares están en `public/avatars/catalog.json`.

Para leer con progreso en la pantalla de la Raspberry se utiliza el mismo lector
web en Chromium. Consulta [los requisitos del dispositivo](../DeviceApp/README.md#perfiles-de-usuario-y-reanudación).

Pruebas: `node --test tests/userProfiles.test.js` y
`python -m unittest discover -s DeviceApp/tests -p 'test_user_profiles.py'`.

Libros → **Libros premiados** permite recorrer por año el **Pulitzer de Ficción**
(1948–2026, 73 obras) y el **Premio Planeta de Novela** (1952–2025, 74 obras).
Los catálogos en `DeviceApp/data/pulitzer_fiction.json` y `planeta_novel.json`
incluyen las fuentes oficiales y la fecha de comprobación. Al actualizar el
palmarés, conserva una clave por obra: el Pulitzer 2023 tiene dos ganadoras.
Los años sin premio se indican aparte; no se incluyen premios a trayectorias.
Las obras presentes en la biblioteca se pueden leer y las ausentes ofrecen
la carga habitual. La coincidencia exige título y autor o la misma obra de
Open Library; excluye adaptaciones gráficas. Portadas y sinopsis se consultan
al seleccionar una obra mediante el servicio de metadatos existente, con una
cubierta tipográfica de respaldo si faltan datos o conexión. En modo demo no
se hacen consultas externas. Los palmarés están incluidos en la compilación;
no se actualizan automáticamente.

Si falta una obra, **Buscar torrent** abre su ficha de Open Library y debajo el
buscador de torrents. La ficha se consulta en castellano aunque la interfaz esté
en catalán o inglés. La búsqueda inicial usa el título español y «español»;
si la API no identifica una traducción, se puede elegir otra ficha e introducir
el título antes de buscar. Los resultados muestran fuente, tamaño y seeds y se
pueden ordenar como los de películas. El idioma del archivo depende del resultado
elegido, no solo del título de búsqueda.

Las descargas usan Transmission y el dashboard existentes. Se importa un EPUB o
PDF con sus metadatos de obra y se conserva cualquier libro ya instalado. Los
packs ambiguos, comprimidos y audiolibros producen un error recuperable. Los
identificadores de edición, ISBN y número de páginas del catálogo no se atribuyen
al archivo descargado sin comprobarlos. Requiere actualizar también DeviceApp.

Pruebas: `cd WebApp && node --test tests/bookAwards.test.js tests/bookTorrent.test.js tests/torrentUtils.test.js`;
backend: `python -m unittest discover -s DeviceApp/tests -p 'test_*torrent*.py'`.

La ficha de una película guardada incluye **Obtener subtítulo**, con español,
catalán e inglés. Busca y guarda automáticamente el SRT en la Raspberry, primero
por la huella del fichero y después por su ficha y versión. **Configurar
OpenSubtitles** abre la tarjeta de configuración en **Dashboard → Servicios
auxiliares**, junto a TMDB, para guardar la cuenta una sola vez; los errores y las
coincidencias aproximadas se muestran en la ficha. La carga manual de SRT sigue
disponible en el editor. [Configuración y funcionamiento](../DeviceApp/README.md#subtítulos-durante-la-reproducción).

En Uploads → TMDB, las fichas de películas buscan torrents en The Pirate Bay y
Knaben; las de series añaden EZTV y filtros de temporada/capítulo. Se muestran
la fuente de cada resultado, tamaño en MB y seeds de mayor a menor. Los
duplicados se agrupan conservando sus fuentes; si una API no responde, un aviso
indica que los resultados son parciales. La descarga se realiza en la Raspberry
y se controla desde la nueva sección del dashboard. El vídeo se añade cuando
está completo y después se preparan los recursos TMDB. Los packs de series importan
todos los capítulos identificados de la selección, conservando los que ya existen.
El modo demo no inicia descargas reales. Instalación y funcionamiento:
[DeviceApp](../DeviceApp/README.md#descargas-de-películas-y-series-por-torrent).

Base inicial para migrar la app de React Native a una web React que pueda ejecutarse en una Raspberry Pi dentro de la red local.

## Si, es viable en Raspberry Pi

Si. Un proyecto React puede ejecutarse en Raspberry Pi sin problema, pero hay dos formas distintas:

1. `React` como frontend estatico servido por un servidor web.
2. `React + backend` ejecutandose en la Raspberry para exponer API y guardar datos persistentes.

Para tu caso, la opcion correcta es la segunda:

- la Raspberry muestra un QR con `IP:puerto`
- el movil abre el navegador en esa direccion
- la web habla directamente con la Raspberry
- la Raspberry guarda el estado persistente
- no hace falta publicar en Google Play ni App Store

## Arquitectura recomendada

- `WebApp/`: frontend React para navegadores.
- `DeviceApp/control_api.py`: backend HTTP en la Raspberry.
- persistencia en Raspberry usando `SQLite` o un fichero `JSON`.

Lo ideal es que la Raspberry sirva todo desde la misma URL:

- `GET /` -> frontend React compilado
- `GET /health` -> estado de la Raspberry
- `GET /videos` -> lista de carpetas y episodios
- `POST /play` -> reproducir episodio
- `POST /volume/up` -> subir volumen
- `POST /volume/down` -> bajar volumen
- `GET /api/...` -> datos persistentes de usuario, favoritos, vistos, etc.

## Sobre la persistencia

React por si solo no debe ser la fuente de persistencia principal.

La persistencia deberia vivir en la Raspberry:

- `SQLite` si quieres algo robusto y sencillo
- `JSON` si quieres arrancar rapido

## Estado actual de esta carpeta

Esta carpeta deja preparado:

- un frontend React con Vite
- un cliente HTTP sencillo
- una pantalla inicial que comprueba conectividad con la API de la Raspberry
- una base facil de ampliar para migrar pantallas desde React Native

## Estructura

```text
WebApp/
  index.html
  package.json
  vite.config.js
  src/
    main.jsx
    App.jsx
    styles.css
    api/
      raspberryApi.js
```

## Desarrollo local

```bash
cd WebApp
npm install
npm run dev
```

## Biblioteca de libros

- El selector con iconos distingue **Novelas** y **Novelas gráficas**. El orden por **Nombre** usa el título en el idioma del sistema; **Año** muestra primero los más recientes y deja los libros sin fecha al final. Las colecciones usan el primer año conocido de sus volúmenes y conservan la portada del primer archivo.
- **Novela gráfica** puede marcarse o desmarcarse al subir y en la ficha de edición. En subidas de carpetas o varios archivos, la selección de Uploads se aplica a todos los volúmenes. Sin clasificación guardada, CBZ/CBR se consideran novelas gráficas y PDF/EPUB novelas; una elección manual siempre tiene prioridad. Una colección mixta aparece en ambos tipos con los volúmenes correspondientes.
- Al seleccionar un libro suelto en **Uploads → Libros**, se busca su título en Open Library. Para EPUB se leen primero el título y autor internos. Selecciona una coincidencia, revisa los datos y pulsa **Confirmar libro y subir**. Cancelar no sube el archivo.
- La búsqueda no necesita una clave API. La ficha obtiene los datos disponibles de la obra y su edición: autores, sinopsis, editorial, publicación, ISBN, idioma, páginas y temas. Si no hay coincidencia o el servicio no responde, se puede editar la ficha manualmente.
- La búsqueda prioriza ediciones en el idioma del sistema (castellano, catalán o inglés). Al confirmar una coincidencia se consultan también las ediciones de esa misma obra en los tres idiomas y se guardan sus textos disponibles. La biblioteca cambia de idioma sin conexión, conservando el ISBN, editorial y portada de la edición elegida. Las páginas se consultan primero en la edición seleccionada de Open Library, incluyendo su descripción de paginación si falta el campo numérico. Si no constan, se usa la lista de páginas o maquetación fija del EPUB cuando existe. Los valores introducidos manualmente se respetan. La ficha indica cuándo el recuento procede del EPUB y puede diferir de las pantallas del lector. El selector **Idioma de los textos** permite revisar o completar cada versión. Open Library no traduce sinopsis: si falta una versión se indica que se está mostrando el texto original. **Actualizar los tres idiomas** completa las versiones de una ficha antigua sin sustituir sus textos ya guardados.
- El archivo se guarda en `MultimediaContent/Books`, la ficha en el catálogo SQLite (`MultimediaContent/media_library.sqlite3`) y las portadas seleccionadas de Open Library en `MultimediaContent/BookCovers`. El catálogo existente también genera sus copias locales de recuperación. Consultar una ficha guardada no vuelve a pedirla a Open Library.
- Para un libro ya subido, **Entrar → Buscar información del libro** permite identificarlo y guardar su ficha sin volver a subirlo. Las colecciones mantienen su subida por carpetas y cada volumen tiene su propia ficha.
- **Entrar** muestra la ficha y **Leer** permite elegir Raspberry o navegador. Los EPUB se renderizan dentro de la web con EPUB.js, índice, paginación, tamaño de letra y posición guardada en ese navegador. La dependencia se incluye en la compilación, sin CDN ni aplicación externa. Los EPUB con DRM no son compatibles. La lectura PDF existente se conserva.
- En el lector del navegador, escribe el número en **Página** y pulsa **Ir** o **Enter** para saltar directamente. PDF, CBZ y CBR usan las páginas del archivo completo; en EPUB el selector recorre la sección actual y el índice permite cambiar de capítulo. Sus páginas se recalculan al cambiar la pantalla o el tamaño de letra.
- La opción Raspberry envía el comando al lector configurado en el dispositivo; requiere que el menú de la MiniTV esté en ejecución.

Comprobaciones de libros: `node --test tests/bookLibrary.test.js tests/bookMetadata.test.js tests/bookReading.test.js` desde `WebApp`, y `python -m unittest discover -s DeviceApp/tests -p 'test_book*.py'` desde la raíz con el entorno Python del backend.

Si arrancas la web en tu Mac con `localhost` y no defines `VITE_RASPBERRY_API_BASE_URL`, entra automaticamente en `modo maqueta local`:

- no pide PIN
- usa un catalogo simulado de episodios
- permite trabajar la maquetacion sin Raspberry encendida

Si durante desarrollo quieres apuntar a una Raspberry real:

```bash
VITE_RASPBERRY_API_BASE_URL=http://192.168.1.50:5050 npm run dev
```

Si quieres forzar el modo maqueta aunque cambies otras cosas del entorno:

```bash
VITE_WEB_DEV_MODE=mock npm run dev
```

## Despliegue recomendado en Raspberry

Opcion recomendada:

1. compilar el frontend con `npm run build`
2. servir `dist/` desde Flask o desde Nginx
3. mantener la API y la persistencia en Python

## Siguiente paso recomendado

La migracion mas natural seria:

1. mover primero la configuracion y el listado de temporadas/episodios
2. adaptar las llamadas de `src/services/raspberryApi.js` a esta nueva web
3. crear endpoints nuevos en `control_api.py` para persistencia
4. servir el build de React desde la propia Raspberry

### Reparto y equipo de películas y series

Las fichas de películas y series muestran **Reparto y equipo**: actores y personajes,
dirección, guion/obra original y, en series, creadores. Las listas se pueden ampliar
para consultar todas las personas disponibles. Estos datos se leen de la caché de
la Raspberry y están disponibles sin conexión a TMDB una vez preparados.
Para completar las fichas existentes, usa **Dashboard → Servicios auxiliares → TMDB
→ Reparto y equipo → Completar todas las fichas**. El panel muestra el progreso,
los errores y los títulos que necesitan identificar su ficha. Requiere actualizar
tanto la web como la API de la Raspberry. Las nuevas incorporaciones preparan
los créditos automáticamente.

### Fichas de juegos

El formulario de añadir juegos busca automáticamente por nombre y consola en ScreenScraper e IGDB. Permite elegir la ficha antes de subir, ver su carátula y capturas y conservar texto o imágenes propios. El servidor guarda la ficha completa y todas las imágenes disponibles en la Raspberry; la biblioteca funciona después sin conexión y muestra fechas, géneros, desarrollador, distribuidor, jugadores/modos y puntuación cuando la fuente los ofrece.

La ficha guardada sigue el estilo de la biblioteca: carátula fija, consola, título,
géneros y botones de jugar juntos, seguidos de la sinopsis y los datos del juego.
El archivo y la fuente se pueden desplegar. **Multimedia** permite alternar entre
imágenes con miniaturas y vídeos con un único reproductor y una lista de selección.
La distribución se adapta al móvil y respeta las imágenes guardadas en el editor.

Si faltan imágenes o metadatos, **Completar ficha e imágenes** permite reintentar o elegir una coincidencia sin volver a subir el juego. Configura las credenciales exclusivamente en la Raspberry siguiendo [DeviceApp/README.md](../DeviceApp/README.md#fichas-de-videojuegos-e-imágenes-sin-conexión).

OpenSubtitles admite clave de API y usuario sin contraseña. La contraseña es opcional; sin ella se omite el inicio de sesión. «Sin contraseña» también elimina una contraseña guardada. La cuota depende del acceso concedido por OpenSubtitles.

Las credenciales de IGDB y ScreenScraper también se pueden introducir en
**Dashboard → Servicios auxiliares → Fichas de videojuegos**. Basta con configurar
una fuente. Los campos vacíos conservan los valores existentes; la opción de
borrar desactiva esa fuente, incluidas sus credenciales del entorno. El estado
indica si están configuradas, sin validar todavía el acceso al proveedor.
En modo maqueta los controles están deshabilitados: para buscar fichas reales
hace falta el backend, que también puede ejecutarse en el Mac sin contenido.

Al seleccionar una ficha de juego se muestran sus vídeos de YouTube asociados
por IGDB, priorizando los titulados gameplay, walkthrough, longplay o playthrough.
El reproductor también aparece en la ficha guardada; los enlaces se conservan con
los metadatos, pero reproducirlos requiere Internet. No se descargan vídeos ni se
reproducen automáticamente. Si no hay vídeo asociado, se muestra un aviso y una
búsqueda en YouTube por nombre y consola. Los vídeos de IGDB pertenecen al juego
y pueden mostrar otra plataforma si el título se publicó en varias.

La sección **Más gameplays en YouTube** realiza una búsqueda adicional al desplegarla.
Muestra hasta seis vídeos incrustables con miniatura, título y canal, y permite
editar la búsqueda. Al elegir un resultado, se muestra en el mismo reproductor.
Configura una clave de **YouTube Data API v3** en Dashboard → Servicios auxiliares
→ YouTube Data API v3 (habilita la API en el proyecto de Google Cloud).
La búsqueda se hace desde el servidor y conserva resultados en memoria durante
15 minutos para evitar repetir consultas. Los errores de clave, cuota, conexión
y las búsquedas vacías se indican en pantalla; no impiden usar los vídeos de IGDB.

### Buscar con IA

El botón **IA**, junto al filtro de la biblioteca, abre una consulta con ejemplos
para la sección actual: películas por actor o director, series por creador,
libros por autor y juegos por género, consola o desarrollador. En fotos se busca
por nombre de archivo. La respuesta filtra el listado normal y se combina con
los filtros manuales, favoritos y la vista actual. **Quitar filtro IA** permite
volver al listado anterior. Una petición de aclaración conserva el filtro que
ya estaba aplicado; no sustituye el listado por una respuesta inventada.

Actívala desde **Dashboard → Servicios auxiliares → OpenAI**: introduce la clave,
guarda y comprueba la conexión. El formulario recupera y muestra la clave y los
ajustes guardados al acceder con el PIN, sin guardarlos en el almacenamiento del
navegador; el campo vacío conserva la clave existente.
La prueba utiliza los ajustes guardados. Requiere actualizar web y API, conexión
a Internet y acceso a la API de OpenAI. En modo maqueta los controles indican que
hay que conectarse a la Raspberry y no guardan credenciales ni simulan resultados.

El modo **Buscar** interpreta filtros sobre metadatos y calcula los recuentos con
el catálogo local. No reconoce imágenes ni busca escenas dentro de los vídeos.
El panel avisa si hay fichas incompletas.

En películas y series también aparece **Recomiéndame**. Puedes responder a una
pregunta sobre tus gustos o pedir algo concreto, como «Una comedia para esta
noche». Los gustos se guardan para el usuario seleccionado y se pueden editar,
quitar uno a uno o borrar junto con la conversación. Se comparten entre películas
y series, con un historial reciente separado para cada sección. Los favoritos
y el progreso se conservan al olvidar los gustos.

Las tarjetas distinguen **En tu biblioteca**, con acceso a la ficha local, de
los títulos que faltan. **Buscar torrent** abre la ficha verificada de TMDB y
busca torrents para esa película o serie; la descarga comienza sólo al elegir
un resultado en la pantalla habitual. Una sugerencia que no se puede verificar
no muestra un botón de descarga.

Las recomendaciones envían a OpenAI los gustos, la conversación reciente y una
selección abreviada del catálogo con las marcas de visto/favorito del usuario.
Los archivos y las rutas permanecen en el dispositivo. El PIN compartido permite
acceder a los distintos perfiles. Al cambiar de usuario se cancela la espera
y se descarta cualquier respuesta del perfil anterior; las revisiones del
servidor protegen también las ediciones y borrados simultáneos.
