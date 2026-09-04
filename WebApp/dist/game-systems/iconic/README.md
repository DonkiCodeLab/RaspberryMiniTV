# Recursos Iconic para MiniTV

Preparación: 2026-09-03. Fuente: https://github.com/Siddy212/iconic-es-de
Revisión: `0a549ffbe5a392bd818ee4c11a7175b2372591e4`.

Se han descargado 123 archivos originales (aproximadamente 11 MB), con recursos para 25 sistemas. Cada descarga se ha verificado contra el hash Git de origen. No se han descargado ROMs ni BIOS ni instalado emuladores. El carrusel y la subida ya están integrados en la aplicación.

## Contenido y uso

`manifest.json` contiene rutas web, procedencia, hashes, sistema, emulador sugerido, metadatos básicos y clasificación para Pi 4B. Cada carpeta incluye fondo, consola, logotipo y metadatos originales en inglés. Algunos sistemas tienen además una capa transparente de personaje; cuando no existe, `overlay` es `null` y debe omitirse.

Las rutas originales y su correspondencia local están en `files`. Se conserva el estilo Classic. El fondo `ngp/background.webp` corresponde a la captura aportada. Los XML de `upstream` se incluyen para estudiar la composición, no constituyen una instalación completa del tema ES-DE.

## Licencia y atribución

Tema: Siddy212. Conservar también los créditos completos de artistas y temas en `upstream/README.md`, apartado Acknowledgments. El arte de Haohmaru para Neo Geo Pocket se atribuye allí a jlcryu.

Existe una discrepancia en origen: `upstream/LICENSE` declara CC0, pero el README declara CC-BY-NC-SA 2.0. No asumir que todo el arte es de dominio público. Como criterio de reutilización, conservar atribución y créditos, uso no comercial y la misma licencia para las adaptaciones del tema; aclarar con el autor la discrepancia antes de una distribución comercial. Los derechos de imágenes, personajes y marcas de terceros no quedan resueltos por la licencia del repositorio.

Fuente de condiciones: https://creativecommons.org/licenses/by-nc-sa/2.0/

## Selección para Raspberry Pi 4B

Esta es una selección inicial práctica, no un listado exhaustivo ni una prueba de rendimiento. `hardwareTested: false` en todo el catálogo. La clasificación es una recomendación de integración basada en los sistemas/emuladores documentados por RetroPie; depende del juego, núcleo, resolución y configuración. La presencia de un sistema en RetroPie no garantiza velocidad completa.

| Grupo | Sistemas preparados | Emuladores sugeridos |
| --- | --- | --- |
| Principal | GB, GBC, GBA | Gambatte, mGBA |
| Principal | NES, SNES | FCEUmm, Snes9x |
| Principal | Master System, Mega Drive, Game Gear, Mega CD | Genesis Plus GX |
| Principal | PC Engine, PC Engine CD | Beetle PCE Fast |
| Principal | Neo Geo, Neo Geo CD | FinalBurn Neo, NeoCD |
| Principal | Neo Geo Pocket / Color | Beetle NGP |
| Principal | WonderSwan / Color | Beetle WonderSwan |
| Principal | Atari 2600, Atari 7800, Atari Lynx | Stella, ProSystem, Handy |
| Principal | PlayStation | PCSX ReARMed |
| Evaluar cada juego | Arcade 2D | FinalBurn Neo; ROM set compatible con la versión del núcleo |
| Evaluar cada juego | Nintendo 64 | Mupen64Plus; resolución nativa y configuración por juego |
| Evaluar cada juego | Dreamcast | Redream o Flycast según sistema operativo |
| Evaluar cada juego | PSP | PPSSPP, preferentemente standalone |

BIOS y formatos deben validarse por núcleo antes de habilitar cada plataforma. Las extensiones ZIP, BIN y CHD no identifican por sí solas una consola. En particular, el código actual asigna todo CHD a Neo Geo CD: habrá que sustituir esa suposición al incorporar PlayStation u otros sistemas de disco. Mega CD, PC Engine CD y Neo Geo CD requieren su configuración de BIOS; Neo Geo requiere un set coherente con el emulador.

El catálogo activo compartido está en `assets/game_platforms.json`; integra los 25 sistemas en subida, selección y resolución de núcleo RetroArch. Los cuatro IDs antiguos se conservan para compatibilidad. El manifest de esta carpeta documenta la importación original del arte, no la disponibilidad actual de emuladores. La instalación de núcleos y BIOS en la Raspberry debe comprobarse aparte. Los controles usan la configuración RetroArch existente.

Fuentes:
- https://github.com/RetroPie/RetroPie-Docs/blob/master/docs/Supported-Systems.md
- https://github.com/RetroPie/RetroPie-Docs/blob/master/docs/Nintendo-64.md
- https://github.com/RetroPie/RetroPie-Docs/blob/master/docs/Dreamcast.md
- https://github.com/RetroPie/RetroPie-Docs/blob/master/docs/PSP.md

## De dónde salen las carátulas y fichas

Iconic aporta arte y datos de las consolas. Para los juegos, declara qué campos e imágenes debe mostrar; ES-DE se encarga del scraping mediante ScreenScraper o TheGamesDB. No contiene una colección de ROMs ni descarga juegos.

En `upstream/theme-detailed.xml`, `imageType` pide `cover`, `miximage`, `marquee`, `titlescreen`, `physicalmedia` y `fanart` según la vista. Los campos `metadata` consumen nombre, jugadores, género, desarrollador, distribuidor y fecha. `gameselector.xml` usa fanart y captura como alternativa. La información de cada consola viene de `_inc/systems/metadata-global` y está copiada como `metadata.xml`.

Documentación del scraper: https://gitlab.com/es-de/emulationstation-de/-/blob/master/USERGUIDE.md

### Integración existente en MiniTV

En `DeviceApp/control_api.py`:
- `screen_scraper_credentials()` lee configuración de ScreenScraper en servidor; requiere ID y contraseña de desarrollador, con usuario y contraseña opcionales. No se han inspeccionado ni probado credenciales.
- `search_screen_scraper_games()` consulta `jeuRecherche.php` por nombre y sistema.
- `normalize_screen_scraper_game()` obtiene nombre, sinopsis y medios.
- `extract_screen_scraper_media()` conserva hasta ocho imágenes entre box-2D, box-texture, mixrbv2 y screenshot.
- `download_game_cover()` guarda la carátula elegida localmente.

La web ya tiene `GameMetadataBrowserModal` para escoger resultado y carátula. Para aproximarse a Iconic conviene ampliar los medios a logotipos, fanart y soporte físico, incorporar más campos de ficha y mantenerlos en caché local. Hará falta añadir IDs de ScreenScraper al ampliar sistemas. Las credenciales deben seguir en el servidor.

El carrusel permite seleccionar consola y juego, subir ROMs con carátulas e imágenes y cambiar/restaurar el fondo de cada consola (PNG/JPEG/WebP, máximo 8 MB). Los fondos se guardan en GameCovers con un registro por sistema. Para formatos ambiguos la subida exige consola explícita. Los CHD antiguos conservan la asignación Neo Geo CD. Se admiten imágenes de disco autocontenidas; no se ha añadido subida de conjuntos CUE/BIN. Los ZIP arcade conservan el nombre del ROM set y no se duplican.

Validación: `npm run build` en WebApp; `python -m unittest discover -s DeviceApp/tests -v` desde la raíz, con Flask instalado. Las pruebas usan una biblioteca temporal y no lanzan emuladores.
