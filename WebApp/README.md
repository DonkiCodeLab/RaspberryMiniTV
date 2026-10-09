# WebApp

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

Pruebas: `cd WebApp && node --test tests/bookAwards.test.js`.

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
