# MiniTV Fotos para Android

Aplicación nativa Kotlin para Android 10 o posterior. Comparte con iOS el QR y los endpoints de fotos de MiniTV. Incluye escáner integrado, enlace directo `minitvphotos://pair`, subida de la galería autorizada, detección SHA-256 de duplicados, progreso, pausa, recuperación de la cola e informe CSV.

## Instalar y usar

1. Abre la carpeta `AndroidApp` con Android Studio y deja que sincronice Gradle. Usa JDK 17 y Android SDK 36 (Build Tools 36.0.0). También puedes instalar directamente el APK de pruebas generado en `dist/MiniTVFotos-debug.apk` cuando esté disponible.
2. Para compilar: `./gradlew :app:assembleDebug`. El APK se genera en `app/build/outputs/apk/debug/app-debug.apk`. Es una compilación de desarrollo firmada automáticamente para pruebas; no requiere una cuenta de pago. Android pedirá autorizar la instalación desde la aplicación que abra el APK.
3. Arranca DeviceApp y conecta la web a su API real. En Dashboard → Subidas → Fotos aparece el QR. Comprueba que usa la IP y el puerto de la API, normalmente `http://192.168.x.x:5050`; no el puerto de Vite ni `localhost`.
4. Conecta el móvil a la misma Wi-Fi. Abre MiniTV Fotos → Escanear QR → confirma la dirección. También puedes pegar el enlace o abrirlo desde una cámara compatible. No se envían fotos hasta que pulses **Subir mis fotos**.
5. Concede acceso a todas las fotos o, desde Android 14, solo a una selección. El permiso de ubicación multimedia es opcional: permite leer los originales sin que Android quite los datos GPS. Autoriza las notificaciones para ver el progreso fuera de la app.
6. Pulsa **Subir mis fotos**. La app muestra porcentaje de fotos confirmadas, porcentaje del envío actual, nuevas, ya existentes y errores. Puedes pausar desde la app o su notificación, continuar y guardar el informe CSV.
7. **Volver a revisar toda la galería** crea otra importación; las fotos idénticas ya importadas se contabilizan como existentes. Si quedaban pendientes, la app pide confirmar la sustitución de la lista y del informe anterior.

Para instalar desde un ordenador con un dispositivo autorizado para depuración USB:

```sh
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

## Segundo plano y recuperación

- **Android 14 o posterior:** `JobScheduler` con un trabajo de transferencia iniciado por el usuario (`setUserInitiated(true)`), notificación y restricción Wi-Fi. La cola del planificador es persistente y Android puede reprogramarla tras una interrupción o reinicio. La app programa el trabajo desde una acción visible del usuario.
- **Android 10–13:** servicio en primer plano de tipo `dataSync`, con notificación, inicio desde la app y un bloqueo parcial de CPU limitado a seis horas. Tras reiniciar el teléfono, abre la app y pulsa Continuar.
- Salir a Inicio, abrir otra aplicación o bloquear la pantalla no pausa deliberadamente la subida. Android y los ajustes de batería del fabricante pueden detener o aplazar el proceso. Forzar la detención desde Ajustes o el administrador de tareas requiere volver a abrir la app y pulsar Continuar. No se promete ejecución ininterrumpida en todos los fabricantes.
- Solo se usan conexiones Wi-Fi; no hay fallback a datos móviles. Las peticiones se vinculan a esa red, también cuando no tiene acceso a Internet.
- Una caída de red o error temporal del servidor provoca reintentos con espera progresiva. La pausa solicitada por el usuario se conserva. Los originales permanecen intactos en el móvil.
- SQLite, con lectura concurrente durante la preparación de bibliotecas grandes, guarda la lista, el servidor, la sesión, el resultado por foto y el manifiesto del envío pendiente. Se prepara como máximo una foto de hasta 50 MB, sin cargar la galería completa en memoria.
- El archivo preparado se publica mediante renombrado tras sincronizarlo a disco. El manifiesto y la clave de lote permanecen estables al reintentar. Primero se guarda el recibo del servidor y después se elimina la copia temporal. Si se pierde la respuesta, el mismo lote recupera el resultado original sin incrementar dos veces el contador.
- La recuperación es **por foto**, no por fragmentos de red: una foto interrumpida puede volver a enviarse completa. El porcentaje global cuenta fotos confirmadas, incluidos los errores identificados; no representa bytes totales.

## Fotos y límites

Se consultan las imágenes accesibles mediante MediaStore: cámara, capturas y otras carpetas de la galería. Las imágenes que solo estén en Google Fotos u otra nube deben descargarse al dispositivo antes. No se importan vídeos ni la parte de vídeo de Motion Photos, álbumes o reconocimiento de personas. Formatos: JPEG, PNG, WebP, GIF, BMP, AVIF y HEIC/HEIF; RAW no es compatible. HEIC requiere las dependencias de `DeviceApp/requirements-photos.txt` en el servidor.

La fecha de captura se envía en el manifiesto; los datos EXIF disponibles viajan dentro del archivo. El identificador Android y su marca de favorito se conservan en los metadatos de origen; esta versión no sincroniza el favorito con una categoría de la web. Si se deniega la ubicación multimedia, Android puede quitar GPS y cambiar los bytes respecto del original. La detección exacta compara SHA-256 de los bytes accesibles, no similitud visual. También depende de que la foto de la web tenga una huella registrada: las fotos copiadas directamente al disco del servidor por rutas antiguas pueden carecer de ella.

Si se modifica o elimina una imagen antes de prepararla, se procesa el archivo accesible en ese momento o se registra un error. Si se retira el permiso general, se conserva la cola y se solicita restaurarlo. El acceso limitado se indica en pantalla; una foto retirada de esa selección puede resultar inaccesible al reanudar.

## Conexión y seguridad

El QR contiene versión, dirección y código de un solo dispositivo; no contiene el PIN. Caduca en cinco minutos y el token de importación dura 24 horas. Reiniciar la API, cambiar su PIN o revocar el enlace desde la web obliga a enlazar de nuevo. Al enlazar la misma dirección se puede continuar la cola existente; cambiar de servidor exige preparar otra importación.

El token se cifra con AES-GCM usando una clave de Android Keystore y queda fuera de copias de seguridad y transferencias entre dispositivos, igual que la cola. No se incorporan claves privadas de firma al proyecto. Los redireccionamientos HTTP están desactivados para no reenviar credenciales o fotos a otro destino.

El manifiesto permite HTTP para direcciones LAN configurables. Úsalo en una Wi-Fi de confianza; para una conexión fuera de esa red se necesita HTTPS y una configuración de servidor apropiada. La app no abre puertos del router ni publica la biblioteca.

## Comprobaciones

```sh
./gradlew :app:testDebugUnitTest :app:lintDebug :app:assembleDebug
# Con un emulador o dispositivo de pruebas sin datos que conservar:
./gradlew :app:connectedDebugAndroidTest
```

Las pruebas instrumentadas sustituyen la cola de la instalación de prueba y prueban SQLite, recibos repetidos, rollback y cifrado. Las unitarias cubren QR, tamaño y hash del archivo, cancelación, respuestas, CSV, metadatos de duplicados, reintentos del manifiesto y bloqueo de redirecciones.

Verificación local del 25/10/2026: compilación del APK y análisis estático sin errores; 11 pruebas unitarias y 3 instrumentadas. En emuladores Android 15 se comprobó enlace, permisos, 3 fotos nuevas, repetición con 3 existentes y 0 errores, pausa desde la notificación, recuperación tras forzar el cierre y finalización con pantalla apagada. La apertura del escáner y su permiso de cámara se revisaron en el emulador; la lectura con cámara real y el comportamiento de batería en móviles físicos quedan pendientes. El servicio alternativo de Android 10–13 está compilado y revisado, pero no se ha ejecutado en un dispositivo de esas versiones.

Para probar el comportamiento completo con una biblioteca desechable: importar varias fotos, salir a Inicio durante el envío, bloquear la pantalla, pausar desde la notificación, cortar/restaurar Wi-Fi, repetir la importación y forzar la detención para comprobar que **Continuar** recupera los pendientes. No uses una biblioteca personal para pruebas destructivas de datos.

Referencias oficiales: [transferencias iniciadas por el usuario](https://developer.android.com/develop/background-work/background-tasks/uidt), [opciones de trabajo en segundo plano](https://developer.android.com/develop/background-work/background-tasks/data-transfer-options), [acceso parcial a fotos](https://developer.android.com/about/versions/14/changes/partial-photo-video-access), [MediaStore](https://developer.android.com/training/data-storage/shared/media).
