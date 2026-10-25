# MiniTV Fotos · iPhone / iPad

App nativa SwiftUI (iOS 17 o posterior) para enviar las fotos autorizadas del
iPhone a la biblioteca de MiniTV por Wi-Fi. El proyecto no requiere paquetes
Swift externos.

## Instalar en el iPhone

1. Abre `MiniTVFotos.xcodeproj` en Xcode 15 o posterior.
2. En **Signing & Capabilities**, selecciona tu equipo de Apple. Cambia
   `com.donkicodelab.minitvphotos` si tu equipo necesita otro identificador.
3. Conecta el iPhone, selecciónalo como destino y ejecuta **Run**. Activa
   Developer Mode en el iPhone si Xcode lo solicita.
4. Actualiza también **DeviceApp y WebApp**. En la web abre
   **Dashboard → Subidas → Fotos**. La izquierda conserva la carga por arrastre
   y la derecha muestra el QR y la dirección de red.
5. Escanea con **MiniTV Fotos → Escanear QR**, o abre el enlace
   `minitvphotos://pair?...` con la app instalada. También puedes pegar ese
   enlace en la app. Confirma la dirección y pulsa **Exportar todas mis fotos**.
6. Concede acceso a Fotos y Red local. El acceso limitado exporta únicamente
   la selección autorizada. Ambos dispositivos deben poder comunicarse por
   la misma red; `localhost` en la web se sustituye por la dirección de la MiniTV.

La firma para un dispositivo físico y la distribución por TestFlight/App Store
se hacen con la cuenta de Apple del propietario. Este repositorio contiene el
proyecto; no publica ni instala la app en un iPhone físico automáticamente.

## Qué conserva y qué muestra

- Envía originales JPEG, PNG, HEIC/HEIF, WebP, GIF, BMP o AVIF, hasta 50 MB por
  archivo (límite del servidor). Los originales en iCloud se descargan al prepararlos.
- Conserva fecha de captura, ubicación y favorito cuando PhotoKit los proporciona.
  Las Live Photos aportan su imagen fija. No incluye vídeos, el movimiento de
  Live Photos, álbumes ni RAW sin una representación compatible en Fotos.
- Compara SHA-256 con la biblioteca antes del envío. Las fotos existentes
  conservan sus metadatos locales y no se reenvían; archivos visualmente iguales
  con bytes diferentes cuentan como fotos distintas. El catálogo reconoce las
  huellas registradas por las subidas e importaciones de MiniTV.
- El porcentaje global cuenta fotos confirmadas sobre fotos seleccionadas.
  Muestra nuevas, ya existentes, fallidas, archivos preparados y progreso de envío
  de cada archivo. Los últimos 50 resultados aparecen en pantalla; el informe
  CSV contiene el nombre y resultado de todas las fotos de esa importación.
- El registro sobrevive al cierre. Los lotes tienen identificadores estables:
  una respuesta perdida se recupera sin crear otra foto ni contar dos veces la
  misma confirmación. **Reintentar solo las fallidas** crea una importación nueva.

## Segundo plano

Los envíos usan una `URLSession` de fondo con identificador estable y cuerpos
multipart en disco. iOS puede seguir enviándolos al salir de la app o bloquear
la pantalla. Se recuperan las tareas y las confirmaciones cuando iOS despierta
la app o se abre de nuevo. El llavero y los archivos de trabajo están disponibles
tras el primer desbloqueo del dispositivo, incluso si después se vuelve a bloquear.

La app prepara hasta 12 archivos, con un límite de 256 MB antes de añadir el
siguiente (máximo temporal aproximado de 306 MB), y pide dos conexiones por
servidor. No copia toda la fototeca al almacenamiento temporal. Al pasar a
segundo plano usa el tiempo de ejecución concedido por iOS para preparar más
archivos y registra un `BGProcessingTask` con red requerida para continuar luego.
La cola se conserva al pausar y al faltar conexión; el usuario puede reanudarla.

**iOS decide cuándo ejecutar la preparación pendiente** según batería, red y
uso del dispositivo. No se garantiza un envío continuo de toda la fototeca ni
una hora exacta para las tareas de preparación. Si fuerzas el cierre deslizando
la app, iOS cancela sus transferencias de fondo: abre la app para recuperar la
cola. Los archivos confirmados no se duplican. El iPhone debe seguir teniendo
acceso a la red de la MiniTV. Si una foto requiere iCloud, también necesita
conexión con iCloud.

El simulador permite comprobar las transferencias de fondo, pero no reproduce
de forma fiable la planificación de `BGProcessingTask`; esa parte debe probarse
en un iPhone físico con firma de desarrollo.

Referencias de Apple: [sesiones de fondo](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background),
[tareas de procesamiento](https://developer.apple.com/documentation/backgroundtasks/bgprocessingtaskrequest),
[privacidad de red local](https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy).

## Enlace y permisos

El QR contiene dirección, puerto, versión de protocolo y un código aleatorio
de un solo uso que caduca a los cinco minutos. No contiene el PIN de la web.
Tras confirmar el destino, el iPhone recibe una credencial de importación de
24 horas guardada en el llavero; solo permite consultar duplicados, subir fotos,
comprobar la sesión y desconectarse. No permite descargar o borrar la biblioteca,
ni administrar la MiniTV. Cambiar el PIN, desconectar desde la web o reiniciar
DeviceApp invalida el enlace. Las transferencias requieren un enlace válido;
si caduca, escanea otro QR para continuar con la misma cola.

La red local puede usar HTTP. Para un servidor expuesto fuera de casa hay que
configurar HTTPS y su dirección de acceso; este cambio no abre puertos en el router.

## Comprobaciones de desarrollo

Desde la raíz del repositorio:

```sh
xcodebuild -project iOSApp/MiniTVFotos.xcodeproj -scheme MiniTVFotos \
  -configuration Release -sdk iphoneos -destination 'generic/platform=iOS' \
  -derivedDataPath /tmp/minitv-ios-build CODE_SIGNING_ALLOWED=NO build

# En simulador, conserva la firma ad hoc: el llavero requiere los entitlements.
xcodebuild -project iOSApp/MiniTVFotos.xcodeproj -scheme MiniTVFotos \
  -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/minitv-ios-sim CODE_SIGN_IDENTITY=- build

swiftc -module-cache-path /tmp/minitv-swift-cache \
  iOSApp/MiniTVFotos/Pairing.swift iOSApp/MiniTVFotos/ImportJournal.swift \
  iOSApp/MiniTVFotos/UploadOutbox.swift iOSApp/Tests/main.swift \
  -o /tmp/minitv-ios-core-tests
/tmp/minitv-ios-core-tests

python -m unittest discover -s DeviceApp/tests -p 'test_photo_mobile.py'
cd WebApp
node --test tests/photoMobilePairing.test.js tests/photoImportTransfer.test.js
npm run build
```

Prueba física recomendada: exportar una selección, volver a Inicio y bloquear
el iPhone; comprobar las fotos recibidas en la web. Abrir de nuevo y verificar
las confirmaciones. Repetir la selección y comprobar «ya estaban». Probar también
pausa, pérdida de Wi-Fi, caducidad/revocación, acceso limitado e imágenes en iCloud.
