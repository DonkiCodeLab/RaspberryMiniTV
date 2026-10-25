# MiniTV para LG webOS

Aplicación instalable para ver la biblioteca de la MiniTV en una Smart TV LG.
El reproductor funciona en la LG: la Raspberry sirve los archivos y, cuando es
necesario, prepara una copia con audio compatible. No necesita que el Mac esté
encendido después de instalarla.

## Instalador

El paquete está en [`releases/com.donkicodelab.minitv_1.0.0_all.ipk`](releases/com.donkicodelab.minitv_1.0.0_all.ipk).
ID de aplicación: `com.donkicodelab.minitv`. Versión: `1.0.0`.

Objetivo de compatibilidad: **webOS 4.0 (LG de 2018) o posterior**. El JavaScript
usa sintaxis ES5, scripts clásicos, XHR y estilos compatibles con Chromium 53.
No se ha validado aún en una LG física. La reproducción de cada códec depende
del modelo y del archivo; la conversión existente prepara el audio, no convierte
un códec de vídeo incompatible. Para la primera prueba, utiliza MP4 / H.264 / AAC.

### Televisor de destino

**LG 70UK6950PLA**, 70 pulgadas, Ultra HD 4K; comprado el 31 de enero de 2019
(datos facilitados por el propietario). La [ficha oficial de LG](https://www.lg.com/ch_de/tvs-soundbars/uhd-4k-tvs/70uk6950pla/)
especifica **webOS 4.0**, que corresponde al objetivo de compatibilidad de esta
aplicación. LG documenta **Chromium 53** para webOS 4.x en su
[tabla de motores web](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine).
La versión concreta del firmware instalado se comprobará en la tele.

Se mantiene `resolution: "1920x1080"` para la interfaz: es la resolución gráfica
que [LG indica para las aplicaciones en televisores UHD](https://webostv.developer.lge.com/develop/specifications/app-resolution).
Esto no limita por sí solo el vídeo a Full HD. La plataforma admite reproducción
4K en modelos UHD, pero cada archivo y la velocidad de la red deben comprobarse
en el equipo real. Los [formatos publicados para webOS 4.0](https://webostv.developer.lge.com/develop/specifications/video-audio-40)
incluyen H.264 y HEVC; no se fuerza su compatibilidad en el reproductor basándose
únicamente en el nombre del modelo.

El paquete actual conserva la configuración adecuada para este objetivo; conocer
el modelo no exige recompilarlo. Falta validar en esta unidad la instalación,
el teclado virtual, el mando, los subtítulos y la reproducción de archivos reales.

## Funciones

- Conexión por dirección y PIN de la MiniTV; la dirección se recuerda y el PIN
  permanece exclusivamente en memoria hasta cerrar sesión o terminar la app.
- Perfiles existentes, películas, series por temporada, búsqueda y Mi lista.
- Reanudar, reproducir desde el principio y guardar la posición en el perfil
  compartido con la web. Cada 10 segundos, al pausar, al salir del reproductor
  y al ocultarse la aplicación se intenta guardar. Un cierre forzado o corte de
  corriente puede perder los últimos segundos.
- Reproducción en pantalla completa, avance/retroceso, siguiente episodio,
  pistas de subtítulos disponibles y estado de preparación del audio.
- Fotos, carpetas/álbumes y presentación cada seis segundos, con previsualizaciones
  compatibles generadas por el servidor.
- Paginación de 25 tarjetas para mantener ligero el catálogo en la tele.
- Demostración sin servidor, marcada como tal. Las imágenes proceden de los
  recursos del proyecto; todos los títulos de muestra reproducen **el vídeo
  de bienvenida de Donkicode Lab**, no los episodios completos.

Los contenidos se añaden y administran desde la web o las apps de importación.
Esta versión de TV se centra en películas, series y fotos; no incluye el lector
de libros ni los emuladores de la web.

## Preparar la MiniTV

1. Actualiza `DeviceApp/control_api.py` y añade `DeviceApp/tv_access.py` en la
   Raspberry. Reinicia su servicio API (`minitv-api`, si se usa la instalación
   del repositorio). No es necesario recompilar la WebApp para este cambio.
2. La LG y la Raspberry deben compartir una red que permita comunicación entre
   dispositivos. Introduce la dirección de la **Raspberry**, no la de la LG.
   Ejemplo: `http://192.168.1.50:5050`. Usa su IP local si el nombre `.local` no
   resuelve en la tele.
3. Introduce el PIN configurado en la MiniTV y selecciona el perfil.

El módulo `tv_access` permite CORS con origen `null` (el de una app empaquetada
`file://`) únicamente para el catálogo, fotos, reproducción y estado del perfil.
Las peticiones reales siguen pasando por la autenticación existente. Las
peticiones de administración, subida y borrado no se habilitan por esta política.
El origen `null` no identifica una aplicación de forma exclusiva: el PIN sigue
siendo el control de acceso. El vídeo y las imágenes usan los enlaces con PIN
que ya acepta DeviceApp; la app no los imprime y envía `Referrer-Policy` mediante
la etiqueta `meta`. Usa HTTP solo en la red local de confianza, o HTTPS con un
certificado aceptado por la LG. No se abren puertos del router.

## Instalar en la LG

1. Instala **Developer Mode** desde LG Apps e inicia sesión con una cuenta de
   LG Developer. Activa **Dev Mode Status** y deja que se reinicie la tele.
2. En el Mac, instala el CLI oficial (el paquete incluido se generó con `3.2.6`):

   ```sh
   npm install -g @webos-tools/cli@3.2.6
   ares-setup-device
   ```

3. En el asistente elige `add`: nombre `lg`, IP de la **tele**, puerto `9922`,
   usuario SSH `prisoner`, sin contraseña. Abre Developer Mode en la LG,
   activa **Key Server** y ejecuta:

   ```sh
   ares-novacom --device lg --getkey
   ```

   Introduce en el terminal la frase de seis caracteres que muestra la LG.

4. Desde la raíz del repositorio:

   ```sh
   ares-install --device lg LGApp/releases/com.donkicodelab.minitv_1.0.0_all.ipk
   ares-launch --device lg com.donkicodelab.minitv
   ```

Developer Mode tiene una sesión limitada: extiéndela desde **EXTEND** antes de
que caduque. LG elimina las apps instaladas por este método al desactivar el
modo desarrollador. Este paquete es para instalación de desarrollo; no está
publicado en LG Content Store.

Guías oficiales: [Developer Mode y conexión a la TV](https://webostv.developer.lge.com/develop/getting-started/developer-mode-app),
[CLI e instalación de paquetes](https://webostv.developer.lge.com/develop/tools/cli-dev-guide),
[motor web por versión](https://webostv.developer.lge.com/develop/specifications/web-api-and-web-engine),
[botón Atrás](https://webostv.developer.lge.com/develop/guides/back-button).

## Mando

| Botón | Acción |
| --- | --- |
| Flechas | Mover el foco entre tarjetas y botones; desplazar el catálogo |
| OK | Activar el elemento seleccionado |
| Atrás | Cerrar diálogo, volver a la pantalla anterior o mostrar salida en Inicio |
| Play / Pause | Reproducir o pausar |
| Stop | Cerrar el reproductor y guardar la posición |
| Avance / retroceso | Saltar 30 segundos |
| Izquierda / derecha con controles ocultos | Saltar 10 segundos |
| OK con controles ocultos | Mostrar controles y alternar pausa |
| Volumen | Volumen propio de la LG |
| Canal + / − en una foto | Foto anterior / siguiente |

El puntero de Magic Remote también funciona. En el Mac se puede usar teclado,
ratón y Escape como Atrás. El vídeo se pausa al ocultar la aplicación y no se
reanuda sin intervención al volver.

## Construir, previsualizar y comprobar

No se necesitan dependencias npm para compilar o ejecutar las pruebas unitarias.
La construcción copia solo `src` a `dist`; no modifica `WebApp/dist`.

```sh
cd LGApp
npm test
npm run build
npm run preview
# Abre http://127.0.0.1:4180 y elige la demostración.
npm run package
```

Para una conexión real desde el navegador abre `LGApp/dist/index.html` como
archivo local. La previsualización HTTP está pensada para la demo: el servidor
no habilita CORS para páginas web arbitrarias. `ARES_PACKAGE=/ruta/a/ares-package`
permite empaquetar con un CLI instalado en otra ubicación.

Pruebas de servidor y navegador desde la raíz (Python con Flask; Node con Playwright
y Google Chrome instalados):

```sh
python3 -m unittest discover -s DeviceApp/tests -p 'test_tv_access.py'
python3 LGApp/tests/fixture.py  # servidor sintético solo en 127.0.0.1:5059
# En otro terminal:
cd LGApp
npm run test:ui
```

Si Playwright no está en `node_modules`, define `PLAYWRIGHT_MODULE` con la ruta
al paquete. Las capturas se guardan en `output/minitv-lg-*.png`. Las pruebas
comprueban navegación, Atrás LG (461), foco de diálogos, PIN incorrecto, CORS real
desde archivo local, perfiles, favoritos, vídeo, subtítulos, pausa del mando,
progreso compartido, fotos, búsqueda y ausencia del PIN en almacenamiento local.

Antes de dar por validada la instalación, probar en el modelo físico: teclado
virtual, cruceta y puntero, reproducción de un archivo real, avance/retroceso,
subtítulos, regreso desde Inicio, desconexión de red y reanudación del perfil.
