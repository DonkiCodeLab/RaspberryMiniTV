# MiniTV para Apple TV

Cliente **nativo SwiftUI para tvOS 17 o posterior**, conectado a la misma API y
biblioteca que WebApp. Incluye proyecto de Xcode, iconos por capas y Top Shelf,
sin paquetes Swift externos. No necesita tener un navegador abierto.

## Instalar en tu Apple TV

1. Abre `MiniTV.xcodeproj` en Xcode 26 o posterior. Si falta tvOS, instálalo en
   **Xcode → Settings → Components**.
2. En el target **MiniTV → Signing & Capabilities**, selecciona tu equipo de
   Apple. El identificador inicial es `com.donkicodelab.minitv.tv`.
3. Conecta el Mac y el Apple TV a la misma red. En el Apple TV abre
   **Ajustes → Mandos y dispositivos → App Remote y dispositivos** y enlázalo
   desde **Xcode → Window → Devices and Simulators**. Selecciónalo como destino
   y pulsa **Run**. Completa los pasos de desarrollo que muestre Xcode.
4. Abre MiniTV en el Apple TV. Introduce la dirección de la Raspberry, por
   ejemplo `http://192.168.1.50:5050`, y el mismo PIN que utilizas en su web.
   Usa la IP de la Raspberry, no `localhost` ni la IP del Apple TV.
5. Actualiza DeviceApp junto con esta app para habilitar el lector EPUB:
   necesita el nuevo módulo `tv_books.py` y su registro en `control_api.py`.

La instalación en un Apple TV físico requiere la firma de tu cuenta y el
emparejamiento del dispositivo. Crear este proyecto no publica una app en
App Store ni instala automáticamente nada en tu Apple TV.

## Funciones disponibles

| Sección | Desde Apple TV |
| --- | --- |
| Inicio | Biblioteca, continuar viendo/leyendo y favoritos del perfil activo. |
| Películas | Catálogo, carátulas locales, ficha, favorito y reproducción en Apple TV. |
| Series | Series, temporadas, episodios, reproducción y reanudación por episodio. |
| Buscar | Búsqueda local por título, autor o plataforma con el teclado de tvOS. |
| Fotos | Galería, álbumes, personas ya identificadas y presentación a pantalla completa. |
| Libros | PDF y cómics CBR/CBZ, zoom, páginas y lectura de EPUB en modo texto. |
| Juegos | Catálogo, ficha, favoritos y lanzamiento en la Raspberry MiniTV. |
| Perfiles | Selección y creación; favoritos y progreso compartidos con la web. |
| MiniTV | Espacio libre, estado de reproducción, volumen y parada de la Raspberry. |
| Descargas | Estado, porcentaje, velocidad, pausa, reanudación, reintento y cancelación. |
| Ajustes | Conexión, idioma, ciudad del tiempo y activación/hora de alarmas de MiniTV. |

**No tiene paridad con todas las herramientas de administración de la web.**
Las subidas, la edición de fichas, la búsqueda/importación de nuevas descargas,
los servicios de IA, la corrección de caras y los ajustes avanzados siguen en
WebApp. El emulador JavaScript de la web no se ejecuta en tvOS: los juegos se
inician en la Raspberry y necesitan su pantalla y su mando. La interfaz lo
indica antes de iniciarlos.

## Mando

- **Cruceta o superficie táctil:** mueve el foco entre controles. **Centro:** abre
  o selecciona. **Atrás:** regresa por las pantallas y cierra los visores.
- **Vídeo:** controles nativos de AVKit, Play/Pausa, avance, retroceso y pistas
  integradas. El panel **Subtítulos MiniTV** permite seleccionar pistas de texto
  externas o extraídas por el servidor. Play/Pausa desde una ficha de película
  inicia su reproducción.
- **Fotos:** izquierda/derecha cambia la imagen; Play/Pausa inicia o pausa una
  presentación de cinco segundos por foto.
- **Libros:** izquierda/derecha pasa página; arriba/abajo desplaza la página;
  Play/Pausa alterna el zoom.

## Reproducción y datos

La preparación reutiliza `/media/playback`: si hace falta, el servidor prepara
una copia MP4 con audio AAC sin modificar el original. La pantalla muestra
el estado y el porcentaje real. Requiere `ffmpeg`/`ffprobe` en esos casos.
AVKit reproduce formatos compatibles con el modelo de Apple TV; no se promete
compatibilidad con todo archivo MKV, WebM, códec o perfil de vídeo. El servidor
conserva la imagen al preparar audio y no convierte un códec de vídeo incompatible.

El progreso se guarda cada diez segundos, al terminar y al cerrar o pasar a
segundo plano. Las peticiones se serializan para no escribir una posición vieja
después de una nueva. El perfil queda fijado al abrir el reproductor. Se muestran
los fallos de guardado; se necesita conexión para sincronizar y no hay cola
persistente de cambios sin red. Los episodios completados marcan solo ese episodio.

Los PDF y cómics comparten el número de página con la web. Los EPUB se convierten
a páginas de texto, sin scripts, imágenes ni maquetación original. Su posición
usa una clave independiente `tv-book` para conservar el CFI del lector web.
No admite EPUB con DRM ni libros compuestos solo por imágenes. Los cómics usan
la conversión PDF que ya ofrece DeviceApp.

El PIN se guarda en el llavero, separado por servidor. Las peticiones usan
`X-Web-Pin`; AVKit utiliza la URL autenticada de streaming ya existente. No se
envía el PIN a carátulas externas ni se siguen redirecciones hacia otro origen.
Los recursos locales usan la excepción de red local de Apple; para direcciones
públicas utiliza HTTPS. No se abren puertos ni se configura el router.

## Compilar y comprobar

Desde la raíz del repositorio:

```sh
xcodebuild -project tvOSApp/MiniTV.xcodeproj -scheme MiniTV \
  -configuration Release -sdk appletvos -destination 'generic/platform=tvOS' \
  -derivedDataPath /tmp/minitv-tvos-build CODE_SIGNING_ALLOWED=NO build

xcodebuild -project tvOSApp/MiniTV.xcodeproj -scheme MiniTV \
  -configuration Debug -sdk appletvsimulator -destination 'generic/platform=tvOS Simulator' \
  -derivedDataPath /tmp/minitv-tvos-sim CODE_SIGN_IDENTITY=- build

swiftc -module-cache-path /tmp/minitv-tvos-swift-cache \
  tvOSApp/MiniTV/Core.swift tvOSApp/MiniTV/API.swift tvOSApp/MiniTV/Subtitles.swift \
  tvOSApp/Tests/main.swift -o /tmp/minitv-tvos-tests
/tmp/minitv-tvos-tests

.venv/bin/python -m unittest discover -s DeviceApp/tests -p 'test_tv_books.py'
```

Las pruebas Swift cubren URLs, aislamiento del PIN, contrato del catálogo,
identidades por ruta, marcas compatibles con la web, progreso y subtítulos.
Las pruebas del servidor cubren autorización, paginación EPUB, orden del índice,
archivos dañados, límites, enlaces externos, rutas fuera de Books y caché.

Validación realizada: compilación Release para Apple TV y Debug para simulador;
38 comprobaciones Swift y 32 pruebas Python (lector EPUB y regresiones de
reproducción, perfiles y libros). En el simulador Apple TV 4K con tvOS 26 se
comprobaron navegación por foco, fichas, reproducción de vídeo, regreso con Atrás,
galería y cambio de foto, lectura EPUB y cambio de página. El servidor de pruebas
confirmó el guardado de la posición de vídeo y de la página leída.

Para probar la interfaz con datos ficticios, ejecuta
`python3 tvOSApp/Tests/mock_server.py` (requiere FFmpeg). En la configuración
**Debug** del esquema añade `MINITV_UI_TEST_SERVER=http://127.0.0.1:5097` como
variable de entorno y ejecuta en el simulador. Este acceso de pruebas se excluye
de Release y solo acepta `127.0.0.1`. No usa tu biblioteca real.

El proyecto y sus recursos ya están incluidos. Si añades fuentes nuevas,
`python3 tvOSApp/tools/generate_project.py` regenera el proyecto y el esquema.
`swift tvOSApp/tools/generate_artwork.swift` regenera los iconos originales.
La regeneración del proyecto restablece ajustes de firma que hayas añadido en Xcode.

Prueba física pendiente de tu Apple TV: enlazar, entrar con PIN, recorrer las
secciones con el Siri Remote, comprobar audio/subtítulos y reanudación, volver
con Atrás, cambiar perfil y verificar conexión tras reposo o pérdida de Wi-Fi.

Referencias de Apple: [interacción con el mando](https://developer.apple.com/library/archive/documentation/General/Conceptual/AppleTV_PG/WorkingwiththeAppleTVRemote.html),
[reproductor AVKit](https://developer.apple.com/documentation/avkit/avplayerviewcontroller),
[limitación de vistas web en tvOS](https://developer.apple.com/design/human-interface-guidelines/web-views),
[red local](https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking).
