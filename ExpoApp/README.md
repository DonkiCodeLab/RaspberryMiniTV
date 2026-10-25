# MiniTV Fotos · React Native + Expo

Una interfaz TypeScript compartida para **Android 10+ e iOS 17+**. Escanea el QR del dashboard, confirma el servidor y exporta la fototeca autorizada. Muestra porcentaje, nuevas, existentes, errores, últimas fotos e informe CSV. Admite pausa y reanudación después de recuperar el proceso.

El proyecto está en **ExpoApp**. Su identificador es **com.donkicodelab.minitvphotos.expo**, distinto de las apps nativas anteriores.

## Abrir y desarrollar

Requisitos: Node 22 LTS, JDK 17 y Android SDK 36 / Android Studio para Android; macOS, Xcode y CocoaPods para iOS.

~~~sh
cd ExpoApp
npm ci
npm run android
# En macOS:
npm run ios
~~~

Estos comandos generan los proyectos nativos e instalan una development build. Para el trabajo diario con una compilación ya instalada:

~~~sh
npm start
~~~

**Expo Go no incluye el motor nativo de transferencias.** Necesitas instalar la compilación propia. Las compilaciones Release incluyen JavaScript y funcionan sin Metro ni el ordenador de desarrollo.

Se fija Expo SDK 54 / React Native 0.81.5 por compatibilidad con el Xcode 26.0.1 instalado en este Mac. El lockfile fija dependencias reproducibles. Una actualización de SDK requiere volver a compilar y validar el módulo nativo.

El workspace local y sus pods ya están generados en este Mac. Puedes abrirlo directamente en Xcode. En un checkout nuevo, ejecuta **npx expo prebuild** e instala los pods antes de abrirlo:

- Android Studio: **ExpoApp/android**.
- Xcode: **ExpoApp/ios/MiniTVFotosExpo.xcworkspace**, después de instalar los pods. Usa el workspace.

Para un iPhone real sigue siendo necesaria una firma válida de Apple. Expo no elimina el límite de dispositivos de una Personal Team. El simulador no necesita registrar un iPhone.

## Conectar con el dashboard

1. Ejecuta la API y la web existentes de MiniTV. Móvil y servidor deben estar en la misma red accesible por Wi-Fi.
2. En la web, abre **Dashboard → Subidas → Fotos** y genera el QR.
3. En la app, pulsa **Escanear QR** o pega el enlace completo. Confirma la IP y el puerto.
4. Pulsa **Subir mis fotos** y concede acceso completo o a una selección.
5. Puedes salir a Inicio durante el envío. La lista y los resultados se guardan.

El esquema es el mismo de las otras apps: **minitvphotos://pair?v=1&server=...&code=...**. La cámara del sistema puede abrir la app directamente. Si has instalado también las versiones anteriores, el sistema puede elegir otra app que registre ese esquema; usa el escáner integrado para enlazar esta versión.

El QR caduca y no permite copiar una conexión indefinidamente. Si caduca el token o se reinicia la API, vuelve a enlazar **la misma dirección** y pulsa Continuar. Un servidor distinto requiere una nueva revisión de la fototeca. No se borran fotos del teléfono ni de la web.

## Segundo plano

La interfaz React Native observa el motor; las transferencias **no dependen de timers de JavaScript ni de Expo BackgroundTask**.

| Plataforma | Motor |
| --- | --- |
| iOS | PhotoKit, URLSession de fondo con archivos persistentes, registro de recibos y BGProcessingTask para preparar más fotos. Un AppDelegate subscriber recibe eventos aunque JavaScript todavía no haya arrancado. |
| Android 14+ | JobScheduler con transferencia iniciada por el usuario, notificación, persistencia y requisito Wi-Fi. |
| Android 10–13 | Servicio de primer plano dataSync y notificación persistente. |

En iOS, los archivos preparados pueden continuar al suspenderse la interfaz; el sistema decide cuándo concede tiempo para preparar más. No se garantiza recorrer una fototeca ilimitada de una sola vez en segundo plano. Si fuerzas el cierre, vuelve a abrir la app. En Android, forzar la detención requiere reabrir y pulsar Continuar; fabricantes y ajustes de batería también pueden interrumpir el trabajo.

La recuperación es por foto, no por fragmento: una foto cortada puede enviarse completa otra vez. El identificador de lote se conserva y el servidor devuelve el recibo original, evitando contabilizarla dos veces. El porcentaje global cuenta fotos resueltas (incluidos errores), no bytes enviados.

## Qué fotos se exportan

- JPEG, PNG, WebP, GIF, BMP, AVIF y HEIC/HEIF; máximo 50 MB por foto. HEIC requiere soporte del servidor.
- iOS puede recuperar originales de iCloud si están disponibles. En Android se consultan imágenes locales de MediaStore; descarga antes las que solo existan en Google Fotos.
- No incluye vídeos ni la parte de vídeo de Live/Motion Photos. No crea álbumes o reconocimiento de personas en Android.
- Se conservan los originales y se transmite la fecha y los metadatos disponibles. En Android, negar ubicación multimedia puede quitar GPS y cambiar los bytes del archivo.
- Los duplicados se reconocen por SHA-256 exacto de los bytes, no por similitud visual. Una foto antigua del servidor sin huella registrada puede no reconocerse.
- El acceso limitado se indica en pantalla. Puedes ampliarlo en los ajustes de fotos de la app.

## Estructura y mantenimiento

- **App.tsx**: interfaz, permisos, cámara, enlaces entrantes e informe compartido.
- **modules/minitv-transfer/index.ts**: contrato TypeScript, sin exposición del token a JavaScript.
- **modules/minitv-transfer/ios**: puente Expo, lifecycle subscriber y motor Swift.
- **modules/minitv-transfer/android**: puente Expo, servicios, SQLite, Keystore y motor Kotlin.
- **app.json** y **plugins/withMiniTV.cjs**: configuración reproducible de permisos, segundo plano y copia de seguridad.
- **scripts/sync-native.cjs**: copia los motores desde las carpetas iOSApp y AndroidApp, adaptando identificadores y la apertura desde la notificación.

Los motores se incluyen dentro de ExpoApp para que una compilación remota no dependa de carpetas externas. No edites sus copias **ios/Engine** y **android/.../engine**: cambia el original y ejecuta **npm run native:sync**. **npm run native:check** detecta diferencias. Los puentes de Expo se editan aquí.

Los directorios generados **ios/** y **android/** se ignoran en Git; recrearlos con **expo prebuild --clean** elimina cambios manuales en ellos. Conserva los cambios duraderos en configuración, plugins o el módulo local.

Las credenciales se almacenan en Keychain o cifradas con Android Keystore. La cola Android queda excluida del backup. Se permite HTTP para IP locales y se bloquean los redireccionamientos de peticiones de fotos. Usa una red de confianza; no se abren puertos del router ni se publica la biblioteca.

## Compilaciones independientes

APK local sin Metro:

~~~sh
npx expo prebuild --platform android
cd android
./gradlew :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
~~~

El template de Expo firma ese Release local con una clave de desarrollo. Sirve para pruebas; configura una firma propia antes de distribuir en una tienda. Omite la restricción de arquitectura para construir todas las ABI configuradas.

También se incluye **eas.json**, sin subir ni publicar nada automáticamente. Ejecuta EAS desde **ExpoApp** y limita la raíz de subida a esta carpeta; así no se envían las otras aplicaciones del repositorio. **.easignore** excluye compilaciones, cachés y credenciales locales, conservando los módulos nativos:

~~~sh
npx eas-cli login --browser
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli project:init
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli build --profile preview --platform android
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" npx eas-cli build --profile preview --platform ios
~~~

EAS requiere configurar tu cuenta/proyecto y, para distribuir a un iPhone físico, una cuenta Apple Developer de pago y registrar el dispositivo con **eas device:create** antes de compilar. El perfil **preview** incluye el JavaScript y produce un APK Android o un IPA iOS de distribución interna; el enlace de instalación se puede compartir mediante QR. **simulator** es una development build para simulador; **production** sirve de base para las tiendas, que requieren firma y revisión. Un QR de instalación no sustituye al QR de emparejamiento del dashboard.

### Proyecto remoto

El proyecto está vinculado a [donkikochan/minitv-fotos-expo](https://expo.dev/accounts/donkikochan/projects/minitv-fotos-expo), con ID **4c534c7c-2d21-4ae3-a333-4a81d7f3fb6f**.

- [Compilación Android de prueba](https://expo.dev/accounts/donkikochan/projects/minitv-fotos-expo/builds/fb144409-381b-49e6-987b-bfa47ae9bab4): enviada a EAS el 25/10/2026. La página muestra el estado y permite instalar el APK cuando termine.
- [Registro del iPhone](https://expo.dev/register-device/7d040616-bf00-4494-9b10-79ab24469d26): abrir en Safari desde el iPhone. Este enlace registra su UDID para distribución interna; **no instala la app**. La compilación de iOS queda pendiente de completar el acceso a Apple y la firma.
- Los QR están en **output/minitv-expo-android-install-qr.png** y **output/minitv-expo-iphone-register-qr.png**, en la raíz del repositorio.

El APK de EAS utiliza una clave propia almacenada en Expo. Si ya instalaste el APK local con la firma de desarrollo, Android puede rechazar actualizarlo por tener otra firma. En ese caso, termina cualquier transferencia pendiente antes de desinstalar la versión local e instalar la de EAS; desinstalar borra la conexión y la cola guardadas en el teléfono.

## Comprobaciones

~~~sh
npm test
npx expo export --platform all
cd android
./gradlew :minitv-transfer:testReleaseUnitTest :app:assembleRelease -PreactNativeArchitectures=arm64-v8a
~~~

Las pruebas del motor Android cubren QR inválidos, límites, SHA-256, cancelación, respuestas de importación, CSV, deduplicación, reintentos y redirecciones. El servidor y las apps nativas conservan sus propias pruebas en sus carpetas.

### Validación local · 25/10/2026

- TypeScript, sincronización de motores y versiones de Expo: correctos. Bundles Hermes de Android e iOS generados.
- APK Release ARM64 y app Release para iOS Simulator compilados. 11 pruebas unitarias Android superadas y dos pruebas de interfaz iOS superadas (importación y formulario QR con teclado).
- Android 15: tres fotos nuevas, segunda pasada con tres existentes y cero errores; envío con pantalla apagada; pausa a 0 %, cierre forzado y reanudación; apertura del informe CSV y permiso/apertura del escáner Expo.
- iOS 18.3: nueve fotos del simulador, de las cuales ocho se importaron y luego se reconocieron como existentes; una HEIC fue rechazada con su motivo porque el servidor temporal no tenía pillow-heif. Ambas pasadas continuaron al salir a Inicio. El permiso de Fotos y el enlace entrante se comprobaron mediante automatización.
- La cámara física, las restricciones de batería de fabricantes, los iPhone reales y el servicio alternativo de Android 10–13 requieren una prueba en esos dispositivos. Estas comprobaciones se hicieron localmente, antes de subir el proyecto a EAS. No se ha publicado en tiendas.
- npm audit conserva avisos de dependencias transitivas de herramientas (node-forge, postcss, image-size). No se aplica el cambio incompatible de SDK que propone audit --force.

El APK listo para pruebas está en **ExpoApp/dist/MiniTVFotosExpo-android-arm64.apk** y su huella en **ExpoApp/dist/SHA256SUMS**. Usa una firma de distribución propia para publicar.

Referencias: [development builds de Expo](https://docs.expo.dev/develop/development-builds/introduction/), [módulos nativos de Expo](https://docs.expo.dev/modules/overview/), [transferencias Android iniciadas por el usuario](https://developer.android.com/develop/background-work/background-tasks/uidt), [transferencias de fondo de Apple](https://developer.apple.com/documentation/foundation/downloading-files-in-the-background).
