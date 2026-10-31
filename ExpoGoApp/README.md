# MiniTV Fotos Go

Prueba para **Expo Go en iPhone y Android**, sin compilar una app propia ni usar Apple Developer. Mantén Expo Go abierto hasta completar la importación. La pantalla se mantiene encendida mientras trabaja.

## Abrir la prueba publicada

[Publicación en Expo](https://expo.dev/accounts/donkikochan/projects/minitv-fotos-go/updates/d545827f-b7fb-4135-8d06-c719649cf131). Su QR está en [minitv-expo-go-gps-qr.png](../output/minitv-expo-go-gps-qr.png) y los identificadores en `publication.json`. Instala Expo Go compatible con SDK 58. En iPhone escanea el QR con Cámara; en Android usa el escáner de Expo Go.

1. Abre MiniTV Fotos Go con el QR de publicación.
2. Mantén el teléfono en la misma Wi-Fi que tu servidor MiniTV y abre la web/API.
3. En la app pulsa **Escanear QR** y lee el QR de **Dashboard → Subidas → Fotos**. También puedes pegar su enlace. Confirma la dirección y el puerto.
4. iPhone: **Subir mis fotos** revisa las fotos autorizadas. Puedes dar permiso completo o limitado, o usar **Elegir fotos**.
5. Android: **Elegir fotos y subir** abre el selector del sistema. Expo Go no declara permiso para leer toda la fototeca Android; selecciona las fotos por grupos. La compilación propia de `../ExpoApp` conserva el acceso completo autorizado y su motor de segundo plano.
6. Consulta el panel fijo inferior: fotos exportadas con y sin GPS detectado, fotos comprobadas sobre el total, porcentaje y controles **Pausar**, **Continuar subida** y **Detener**. Permanece visible al desplazarte por el informe.

El primer QR descarga la app de Expo; el segundo la conecta con tu servidor. Las fotos se envían directamente al servidor que confirmas, no a Expo. El Mac no necesita ejecutar Metro para abrir la publicación. El equipo que aloja la biblioteca MiniTV sí debe seguir encendido y accesible.

## Pausa, datos y límites

- **Exportadas** cuenta únicamente las fotos nuevas que el servidor ha confirmado y cuyo resultado se ha guardado en el móvil. Las existentes y los errores aparecen aparte; el porcentaje de comprobadas incluye las tres categorías. El contador se actualiza durante el envío y se conserva al pausar o cerrar la app.
- **GPS de las exportadas** desglosa únicamente las fotos nuevas confirmadas: **Con GPS**, **Sin GPS detectado** y, cuando falta una evaluación, **Sin dato**. Se basa en la ubicación de la fototeca o los EXIF disponibles en el móvil; no es una auditoría del GPS almacenado en el servidor. El dato se conserva al pausar, reabrir y reintentar y aparece en el CSV. Los resultados antiguos no guardaban esta información y aparecen como **Sin dato**, nunca como **Sin GPS**. Las fotos se siguen exportando con y sin ubicación.
- **Pausar** interrumpe la petición de red y guarda el punto para **Continuar subida**. **Detener** finaliza esa sesión, conserva los resultados y el CSV y desactiva su reanudación, también después de reiniciar. Puedes iniciar otra revisión: las fotos ya presentes se detectarán como existentes.
- Los controles están disponibles también mientras se prepara la fototeca. Si interrumpes su lectura inicial, puedes volver a revisarla. Una operación nativa en curso (selector, copia o descarga de iCloud) puede necesitar terminar antes de cerrar la interrupción; la app muestra «Pausando…» o «Deteniendo…» y no inicia el siguiente envío. No se retiran fotos que el servidor ya haya recibido, incluida una petición cuya confirmación estuviera en camino.
- Si sales de Expo Go, se pausa la cola; al volver pulsa **Continuar subida**. No hay motor autónomo de segundo plano en esta edición.
- SQLite conserva la sesión, la lista de fotos, cada resultado y la foto pendiente. SecureStore guarda el enlace temporal. La siguiente foto no empieza antes de guardar la confirmación de la anterior.
- SHA-256 detecta duplicados por contenido. El identificador estable de sesión/lote permite recuperar la confirmación original aunque se pierda la respuesta de red. Los duplicados se confirman sin volver a enviar su imagen ni sobrescribir sus metadatos.
- El porcentaje cuenta fotos resueltas, incluidos los errores; no mide bytes. Una transferencia interrumpida se reintenta por foto completa.
- Si caduca el enlace o se reinicia la API, escanea un nuevo QR de la misma dirección y continúa. No se mezclan importaciones pendientes de servidores diferentes.
- Solo imágenes, hasta 50 MB por foto. Live Photos envía la imagen fija. HEIC/HEIF requiere soporte en el servidor. Los originales del móvil no se borran ni se modifican.
- Los envíos conservan el nombre y la extensión originales aunque la copia local
  se llame `pending-…`. Esto corrige el rechazo «La selección contiene un formato
  no compatible: pending-…». La corrección también sirve para las fotos pendientes
  guardadas por versiones anteriores: al abrir la versión corregida, pulsa
  **Continuar subida** para retomar la misma importación y conservar sus contadores.
- El selector puede devolver nombres y representaciones administrados por el sistema. Se usa la representación actual sin editar ni recortar; no se garantiza exportar el recurso original sin editar de PhotoKit ni los álbumes. En iPhone, la revisión de fototeca puede descargar fotos de iCloud y conserva fecha/localización disponibles.
- Las fotos elegidas en el selector se copian al almacenamiento de la app para poder reanudar. Es necesario espacio libre para esa selección; las copias se eliminan tras confirmar su envío. Las copias antiguas se limpian al iniciar otra revisión.

## Desarrollo y publicación

Node 22 LTS. Este proyecto SDK 58 es independiente del SDK 54 con módulo nativo de `../ExpoApp`.

```sh
cd ExpoGoApp
npm ci
npm start
npm test
npx expo export --platform all
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$PWD" eas update --branch expo-go --environment preview --platform all --message "Descripción de la actualización"
```

Después de publicar, actualiza `publication.json` con los enlaces e identificadores
de la nueva actualización y recompila `../WebApp`. La web usa ese registro para
mostrar el QR al pulsar **MiniTV Fotos** en **Dashboard → Subidas → Fotos**.

La versión 1.1.0 usa SDK 58 / React Native 0.88 para abrirse en el Expo Go instalado por el usuario. Los QR anteriores siguen abriendo sus publicaciones originales: usa el QR actualizado de arriba para corregir el envío de nombres `pending-…` y conservar el contador y los controles de pausa y detención. EAS Update no instala módulos nativos nuevos.

## Validación

- Desglose GPS: TypeScript y 29 pruebas pasan, incluidos los exportadores de fototeca y selección manual, EXIF, coordenadas cero, persistencia, duplicados, respuesta perdida y 6.000 resultados antiguos sin dato GPS. Interfaz comprobada en Expo Go / iPhone 17 Pro Simulator con una sesión sintética (4.500 con GPS, 1.400 sin GPS detectado y 100 sin dato); datos del simulador restaurados después. Paquetes de iOS y Android publicados el 31/10/2026; enlace remoto abierto en Expo Go iOS sin Metro y nueva tarjeta GPS verificada. Sigue pendiente comprobar el GPS de la fototeca real del usuario.

- Nombre de archivo: TypeScript y 20 pruebas, incluidas dos del serializador real
  de Expo para copias `pending-…`, selección manual y nombres de multipart.
  Prueba nativa en Expo Go / iOS 26 con bytes sintéticos: se reproduce el envío
  incorrecto del nombre temporal y se confirma el nombre original tras el arreglo,
  con bytes idénticos y sin mover ni borrar el archivo pendiente. Paquetes de iOS
  y Android generados y publicados el 30/10/2026 a las 22:16 (Europe/Madrid).
  QR decodificado y verificado contra la publicación; enlace remoto abierto en
  Expo Go iOS 26 sin Metro. Pendiente la comprobación con la fototeca del usuario.
- Controles de exportación: TypeScript y 18 pruebas cubren contadores confirmados, pausa/reanudación, detención persistente, interrupciones al leer/preparar/guardar, confirmación en camino, fallo de disco, QR, duplicados, pérdida de respuesta y CSV. Actualización publicada el 30/10/2026 para iOS y Android; el enlace y el QR de arriba abren esta versión.
- Interfaz de los controles comprobada en Expo Go / iPhone 17 Pro Simulator (iOS 26), con una cola sintética: contador actualizado, pausa, continuación y detención conservando el resumen. Paquetes de iOS y Android generados. Queda la prueba con fotos reales en el móvil.
- Publicación del 30/10/2026: disponibilidad de iOS y Android verificada en EAS, QR generado y decodificado, y enlace remoto abierto en Expo Go iOS 26 mostrando la interfaz actualizada, sin Metro.
- Prueba original en Android, Expo Go 57.0.9: emparejamiento real, selección de 3 imágenes sintéticas, subida al backend de MiniTV: **2 nuevas, 1 existente, 0 errores**. La reapertura conserva los contadores.
- Prueba original en iOS 26, Expo Go 57.0.9: arranque desde enlace y prueba XCTest del formulario, teclado y rechazo de un QR incorrecto. La importación completa en iPhone físico queda para la prueba del usuario.
- Paquetes Hermes de iOS y Android exportados y publicados con EAS Update. QR decodificado y comparado con el enlace oficial de Expo.
- SDK 58 / versión 1.1.0: TypeScript, las 9 pruebas y `expo-doctor` (20/20) pasan. Publicación remota abierta en Expo Go Android 58.0.5 y en Expo Go iOS 58.0.7; XCTest de formulario/teclado/QR pasa. Los manifiestos de ambas plataformas declaran SDK 58.0.0. El QR nuevo se ha decodificado y verificado.
