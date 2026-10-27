# MiniTV Fotos Go

Prueba para **Expo Go en iPhone y Android**, sin compilar una app propia ni usar Apple Developer. Mantén Expo Go abierto hasta completar la importación. La pantalla se mantiene encendida mientras trabaja.

## Abrir la prueba publicada

[Publicación en Expo](https://expo.dev/accounts/donkikochan/projects/minitv-fotos-go/updates/6da28a1b-4729-4e02-a244-d69d1539b78f). Su QR está en [minitv-expo-go-sdk58-qr.png](../output/minitv-expo-go-sdk58-qr.png) y los identificadores en `publication.json`. Instala Expo Go compatible con SDK 58. En iPhone escanea el QR con Cámara; en Android usa el escáner de Expo Go.

1. Abre MiniTV Fotos Go con el QR de publicación.
2. Mantén el teléfono en la misma Wi-Fi que tu servidor MiniTV y abre la web/API.
3. En la app pulsa **Escanear QR** y lee el QR de **Dashboard → Subidas → Fotos**. También puedes pegar su enlace. Confirma la dirección y el puerto.
4. iPhone: **Subir mis fotos** revisa las fotos autorizadas. Puedes dar permiso completo o limitado, o usar **Elegir fotos**.
5. Android: **Elegir fotos y subir** abre el selector del sistema. Expo Go no declara permiso para leer toda la fototeca Android; selecciona las fotos por grupos. La compilación propia de `../ExpoApp` conserva el acceso completo autorizado y su motor de segundo plano.
6. Consulta porcentaje, nuevas, existentes, fallidas, últimas fotos y el informe CSV.

El primer QR descarga la app de Expo; el segundo la conecta con tu servidor. Las fotos se envían directamente al servidor que confirmas, no a Expo. El Mac no necesita ejecutar Metro para abrir la publicación. El equipo que aloja la biblioteca MiniTV sí debe seguir encendido y accesible.

## Pausa, datos y límites

- Si sales de Expo Go, se pausa la cola; al volver pulsa **Continuar subida**. No hay motor autónomo de segundo plano en esta edición.
- SQLite conserva la sesión, la lista de fotos, cada resultado y la foto pendiente. SecureStore guarda el enlace temporal. La siguiente foto no empieza antes de guardar la confirmación de la anterior.
- SHA-256 detecta duplicados por contenido. El identificador estable de sesión/lote permite recuperar la confirmación original aunque se pierda la respuesta de red. Los duplicados se confirman sin volver a enviar su imagen ni sobrescribir sus metadatos.
- El porcentaje cuenta fotos resueltas, incluidos los errores; no mide bytes. Una transferencia interrumpida se reintenta por foto completa.
- Si caduca el enlace o se reinicia la API, escanea un nuevo QR de la misma dirección y continúa. No se mezclan importaciones pendientes de servidores diferentes.
- Solo imágenes, hasta 50 MB por foto. Live Photos envía la imagen fija. HEIC/HEIF requiere soporte en el servidor. Los originales del móvil no se borran ni se modifican.
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

La versión 1.1.0 usa SDK 58 / React Native 0.88 para abrirse en el Expo Go instalado por el usuario. Los QR de publicaciones anteriores siguen apuntando a SDK 57: usa el QR actualizado. EAS Update no instala módulos nativos nuevos.

## Validación

- TypeScript y 9 pruebas: QR, recibos inválidos, nuevos, duplicados, pérdida de respuesta/reinicio, fallo de disco, pausa, foto inaccesible y CSV.
- Prueba original en Android, Expo Go 57.0.9: emparejamiento real, selección de 3 imágenes sintéticas, subida al backend de MiniTV: **2 nuevas, 1 existente, 0 errores**. La reapertura conserva los contadores.
- Prueba original en iOS 26, Expo Go 57.0.9: arranque desde enlace y prueba XCTest del formulario, teclado y rechazo de un QR incorrecto. La importación completa en iPhone físico queda para la prueba del usuario.
- Paquetes Hermes de iOS y Android exportados y publicados con EAS Update. QR decodificado y comparado con el enlace oficial de Expo.
- SDK 58 / versión 1.1.0: TypeScript, las 9 pruebas y `expo-doctor` (20/20) pasan. Publicación remota abierta en Expo Go Android 58.0.5 y en Expo Go iOS 58.0.7; XCTest de formulario/teclado/QR pasa. Los manifiestos de ambas plataformas declaran SDK 58.0.0. El QR nuevo se ha decodificado y verificado.
