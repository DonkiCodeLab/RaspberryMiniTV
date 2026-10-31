# WebApp

**Fotos** abre directamente **Galería**. El carrusel de la cabecera, como el de
plataformas de Videojuegos, permite cambiar entre **Galería**, **Mapa**,
**Personas**, **Álbumes personales** y **Diviértete con la IA**. Dentro de una
persona o un álbum, la sección sigue seleccionada; pulsarla vuelve a su inicio.
La biblioteca ya no muestra **Nueva carpeta**, **Subir fotos** ni el acceso
**Del iPhone a tu MiniTV**: la incorporación de fotos se realiza desde las apps.

**Mapa** utiliza MapLibre GL y el mismo estilo claro de
[Immich](https://docs.immich.app/guides/custom-map-styles/), con **Mapa 2D** y
**Globo 3D**. Las fotos individuales son círculos que se amplían al pasar el
puntero y abren su ficha al pulsarlos. Clic en un grupo acerca hasta separar
sus marcadores; clic derecho abre la galería con todos los miembros del grupo.
También se puede abrir con pulsación larga o Mayús + Intro, incluso si todas las
fotos comparten posición. Volver conserva el encuadre y la proyección.
No hay panel lateral ni botón para mostrar fotos del área.
**Ir a mi ubicación** solicita permiso solo al pulsarlo; requiere HTTPS o
localhost. El fondo necesita conexión a Internet. Para un proveedor propio,
configura `VITE_PHOTO_MAP_STYLE_URL` con la URL de un estilo MapLibre; se admite PMTiles.

Al ver las fotos de una persona, **Mostrar cara de [nombre]** y **Mostrar otras caras**
controlan sus recuadros de forma independiente: puedes ver solo esa persona, solo
las demás, todas o ninguna. La elección se conserva al cambiar de foto dentro del
visor. **Editar caras** abre las herramientas
para reasignar cualquier cara, incluida la principal, a una persona existente o
a un nombre nuevo. **Validar cambio** guarda esa cara; **Añadir cara** permite
dibujar otra y confirmarla. El visor conserva la foto abierta aunque la corrección
la saque de la carpeta de la persona. Los controles están disponibles al abrir
una foto dentro de su ficha; las vistas flotantes
del asistente de revisión ofrecen también acceso al editor.

La rueda amplía o reduce la foto manteniendo el punto bajo el cursor; clic y
arrastre desplazan la imagen ampliada. Funciona también directamente en la
tarjeta de **Revisar nuevas personas detectadas**. Al añadir una cara, la rueda
sigue ampliando; **Mover foto** permite desplazarla y **Dibujar recuadro** vuelve
a la selección. Tras terminar el recuadro se puede mover la imagen sin perderlo.

Todas las fotos usan el mismo visor, tanto en Galería, Mapa, álbumes personales,
IA y Sin personas como al abrir una foto de la ficha de una persona.
**Mostrar todas las caras detectadas** permite ocultar o mostrar sus recuadros;
en las personas se conservan los dos controles independientes. **Editar caras**
activa o desactiva sus herramientas. **Editar foto** permite girar a izquierda o
derecha, recortar, cambiar el tamaño entre 10 y 200 % y deshacer antes de pulsar
**Guardar imagen**. Los recuadros siguen las transformaciones. El original se
conserva y se actualiza la misma foto en todos sus álbumes, sin validar revisiones
pendientes. Cerrar una edición sin guardar ofrece seguir editando o descartarla.
**Añadir a álbum** permite asignar la referencia a un álbum existente o crear
otro, también desde las fotos de una persona, conservando las referencias anteriores.

Todos los recuadros de caras visibles muestran el nombre y, cuando se conocen ambas
fechas, la edad en la fecha de captura, por ejemplo **Ana (24 años y 3 meses)**. Se aplica en
Galería, Mapa, álbumes, Personas, miniaturas, vistas previas y editores, incluido
el asistente de revisión. Sin nacimiento se muestra solo el nombre. Se cuentan años
y meses cumplidos, omitiendo los meses cuando son cero. Antes del primer año se
muestran solo meses; antes del primer mes, días: el nacimiento es **1 día** y el
día siguiente **2 días**. Se conserva el día de la foto en su zona horaria.
En los nueve meses anteriores al nacimiento se muestra una estimación, como
**≈ 6 meses de gestación**, restando los meses completos que faltan para nacer
a una referencia de nueve meses. El límite inicial indica **Menos de 1 mes de
gestación (aprox.)**. Es una aproximación para las fotos, no una fecha de concepción
conocida; la referencia habitual es de [unas 40 semanas, algo más de nueve meses](https://www.nichd.nih.gov/health/topics/factsheets/pregnancy).
No se muestra edad si falta una fecha o la foto es anterior a ese intervalo.
Se actualiza al corregir
la fecha de la foto, el nacimiento o la identidad, también dentro del asistente.

Dentro de una persona, las fotos se ordenan por fecha de captura. **Ordenar por**
permite elegir **Año de la foto** o **Edad en la foto** (si tiene nacimiento).
El slider derecho recorre toda la colección, incluso las fotos de otras páginas:
en año muestra décadas y años, y en edad muestra años cumplidos, con todas las fotos
del intervalo estimado de gestación agrupadas en **-1**, antes de **0** en orden
ascendente. Dentro del grupo se mantiene el orden de captura. Su flecha alterna
el orden ascendente y descendente; las fotos sin fecha quedan al final. La elección
se recuerda en este navegador y no depende del orden de subida de otros álbumes.

En la ficha de una persona, **Mosaico / Cine** permite cambiar entre las tarjetas
y un carrusel de fotos en perspectiva, inspirado en las películas de los Óscar.
**Cine** muestra las fotos completas y un slider inferior con los años de captura:
al moverlo cambian la foto, la fecha y la edad (años y meses, meses, días o gestación
aproximada). Recorre toda la colección, sin limitarse a una página; también admite
arrastre horizontal, flechas y teclado. Pulsar la foto central o **Ampliar** abre
el visor habitual. El orden se puede invertir; las fotos sin fecha siguen accesibles
y no reciben una edad inventada. La vista se recuerda en este navegador y volver
al mosaico abre la página de la foto seleccionada. **Acciones** y **Elegir portada**
muestran el mosaico mientras se usan sus herramientas.

El visor muestra la fecha y **Ver en el mapa**. **Editar fecha** abre un calendario;
**Guardar fecha** conserva la hora y la zona horaria originales cuando existen.
En el minimapa, **Editar ubicación** permite pulsar una nueva posición, arrastrar
el marcador o escribir las coordenadas, y **Guardar ubicación** confirma el cambio.
También se pueden añadir fecha y posición a fotos sin esos datos. Los cambios
se guardan en la biblioteca y se reflejan en Galería, Mapa y las demás personas
de la foto; los archivos originales se conservan. Cancelar descarta la edición;
Escape vuelve primero del editor al mapa y después a la foto.

**Fotos → Personas** muestra directamente las personas reconocidas, sin selector
entre personas nuevas y reconocidas ni carpeta de coincidencias pendientes.
El icono a la derecha del título abre **Analizar y validar**; el progreso del
análisis y sus controles aparecen dentro del diálogo. **Revisar una a una**
permite retomar los pendientes de todos los lotes, incluidas las personas nuevas.
La biblioteca no muestra el campo «Buscar fotos o carpetas».

En el header, **Ordenar por** permite elegir **Nombre**, **Número de fotos** o
**Edad**, con el mismo diseño que Películas. El slider lateral recorre toda la
lista, sin limitarse a una página, y cambia su escala según el criterio elegido.
Su flecha alterna entre ascendente y descendente. Las edades desconocidas siempre
van al final y las personas con la misma edad se ordenan por nombre.
Cada ficha muestra el nombre, el número de fotos y, si consta, cumpleaños y edad.
El nombre y el retrato abren la ficha con las fotos de la persona. **Modo edición**, en el propio
slider, despliega las herramientas de las fichas y las acciones conjuntas.

El asistente de análisis tiene cuatro pasos:

1. **Analizar lote**: elige cuántas fotos analizar. El valor inicial es 100
   (o las pendientes si quedan menos), con mínimo 1 y máximo las pendientes.
   Abrir el asistente o pulsar **Analizar otro lote** solo muestra este paso;
   el análisis comienza al pulsar **Empezar** dentro del diálogo.
   Pausar conserva el lote; continuar retoma su tamaño y progreso.
2. **Validar personas identificadas**: aprueba, marca como desconocido o corrige
   cada coincidencia. Arrastrar a derecha/izquierda sigue funcionando.
3. **Fotos sin personas reconocidas**: revisa las fotos nuevas sin caras,
   añade las que falten y márcalas como revisadas. Añadir caras, girar, recortar,
   cambiar tamaño y zoom están disponibles directamente. El editor de nombres
   ocupa un panel lateral y el botón para avanzar permanece visible; la foto se
   adapta a la altura disponible. No repite las históricas.
4. **Revisar nuevas personas detectadas**: pon nombre a cada grupo provisional
   o únelo a una identidad existente; puedes recorrer todas sus fotos. Se muestran
   los recuadros de todas las caras detectadas, incluidas las ya validadas, con el
   grupo actual resaltado. **Mostrar todas las caras detectadas** está activado
   por defecto y permite ocultar los recuadros tanto en la tarjeta como al ampliar.
   La opción se mantiene al cambiar de foto o persona durante la revisión.
   El foco inicial está en el selector de personas: tras elegir **Desconocido**
   u otra identidad, **Tab** lleva directamente a **Anotar y siguiente** y **Intro**
   avanza. Al cambiar de foto o persona, el foco vuelve al selector. Si creas una
   persona nueva, Tab pasa primero por su nombre. Corregir
   individualmente todas sus caras también permite continuar, incluida la opción
   Desconocido. Los grupos resueltos en una foto compartida no se vuelven a pedir.
   **El resto de esta foto son desconocidos** resuelve de una vez las caras aún sin
   identificar, conservando las identidades indicadas y los nombres del borrador.
   Avanza a lo que quede pendiente sin repetir esos desconocidos; si el grupo tiene
   otras fotos sin revisar, continúa por ellas. Se puede deshacer y se guarda al
   validar el paso, sin marcar como desconocidas las caras de otras fotos.

En los pasos 2–4 puedes pulsar la fecha para elegir otro día (conserva la hora y
la zona horaria originales). El botón de mapa permite editar la ubicación pulsando
el mapa, arrastrando el marcador o escribiendo las coordenadas, también si la foto
no tenía GPS. **Anotar fecha/ubicación** incorpora el cambio al borrador: se conserva
al avanzar o reabrir y se aplica con **Validar todo y continuar**. Al ampliar
una foto (o directamente en el paso 3) puedes añadir caras, girar a izquierda/derecha, recortar libremente,
cambiar el tamaño y deshacer ediciones. Los recuadros siguen la imagen al editarla.
El asistente usa miniaturas de hasta 600 píxeles en lugar de las vistas de 2400,
también al ampliar o editar. Una vez cargada la foto actual, prepara como máximo
las dos siguientes, una a una. Las miniaturas conservan el encuadre y la orientación;
las caras se guardan como proporciones del original, independientemente de la
resolución mostrada. Si falta una miniatura, se genera sin esperar a la versión grande.
Las versiones editadas se guardan en `Pictures/edited-photos`; los archivos
anteriores se conservan y no se vuelven a importar al explorar la carpeta.
Borrar una foto de Galería elimina también sus versiones conservadas.

En los pasos 2–4, **Aplicar cambios ahora** guarda lo anotado sin terminar el paso.
Cada foto o grupo se aplica en una transacción independiente y el contador muestra
cuántos se han guardado. **Pausar guardado** termina el elemento en curso y permite
continuar después. Si falla una petición, lo ya aplicado se conserva; reintentar
usa los mismos identificadores para no duplicar caras, ediciones ni álbumes.
**Pasar al siguiente paso** conserva el borrador y deja sin validar lo no revisado.
El último paso permite **Continuar más tarde**. El borrador tiene copia en el
almacenamiento persistente del navegador y puede descargarse como JSON desde
**Descargar copia del borrador**, incluso después de un fallo. Los borradores
anteriores guardados en la pestaña se recuperan; antes de dividir un envío antiguo
se consulta su recibo en el servidor para comprobar si ya se había aplicado.

Cada decisión avanza inmediatamente, sin guardar ni recargar toda la biblioteca.
Los nombres nuevos del borrador aparecen en los selectores de las siguientes fotos
con la etiqueta **pendiente de validar**. Puedes reutilizarlos también al corregir
caras o identificar otros grupos. Al validar se resuelven como una única persona;
descartar el borrador retira esos nombres sin crear personas en la biblioteca.
En cada foto de los pasos 2–4, **Añadir a álbum personal…** permite elegir un
álbum existente (incluidos los anidados) o crear uno nuevo en Álbumes personales.
Puedes vincular varios álbumes y deshacer las incorporaciones desde sus etiquetas.
Los nuevos álbumes también aparecen como **pendiente de validar** en las siguientes
fotos. Las referencias y la creación se guardan con el resto del paso, sin duplicar
álbumes ni sustituir las referencias que ya tenía la foto.
**Guardar cambios y continuar** aplica los pendientes por partes y después
actualiza la biblioteca una sola vez. Los borradores se conservan en este navegador
al cerrar/reabrir el asistente o recargar la página. Puedes volver a la decisión
anterior durante el repaso o descartar los cambios del paso. Si falla el envío,
el borrador permite reintentar sin duplicar caras ni aplicar dos veces las ediciones.
Se puede avanzar con la foto ampliada al terminar de editar. Escape cierra primero
el editor de cara o la ampliación. El icono de análisis permite retomar el mismo
paso al reabrir el asistente, también si solo quedan personas nuevas.

**Revisar una a una** retoma los pendientes de todos los lotes;
**Sin personas → Pendientes de validar → Revisar fotos nuevas** abre el tercer paso.
**Quitar de pendientes de validar** muestra la foto directamente en Sin personas,
conservando el original.
**Borrar la imagen de Galería** está disponible en todas las fotos de los pasos 2–4,
también al identificar personas nuevas y al ampliar la imagen. En el último paso,
continúa con las fotos restantes del grupo, sin exigir un nombre para la foto que
se borra; si ya no quedan caras pendientes, pasa al siguiente grupo.
La casilla general **No pedir confirmación al borrar fotos durante la revisión**
omite la confirmación individual en todos esos pasos. Está desactivada por defecto,
se recuerda en este navegador y se puede desmarcar para recuperar las confirmaciones.
El borrado queda anotado en el borrador hasta guardar los cambios y puede deshacerse
con **Volver a la decisión anterior** antes de aplicarlo.
Actualiza WebApp y DeviceApp juntos: el asistente usa `POST /pictures/reviews/batch`.

Pruebas: `node --test tests/photoReviewWizard.test.js tests/photoImageEdits.test.js`
y `python -m unittest discover -s DeviceApp/tests -p 'test_photo_review*.py'`.

**Dashboard → Subidas → Fotos** divide la carga en dos columnas: arrastra fotos
a la izquierda y enlaza **MiniTV Fotos** para Android o iPhone con el QR de la derecha.
En «Escanea con MiniTV Fotos», **MiniTV Fotos** es un enlace amarillo y subrayado
que abre el QR de la última publicación de Expo Go, con su fecha y un botón
para abrirla directamente en el móvil. Después, el QR de conexión de esta
pantalla enlaza la app con la MiniTV. El QR de publicación se genera a partir de
`ExpoGoApp/publication.json`: actualiza ese registro al publicar una nueva versión
y recompila WebApp para que el enlace y el QR apunten a ella.
La dirección incluye IP y puerto y puede corregirse antes de escanear. El QR
caduca en cinco minutos, no contiene el PIN y muestra cuándo se conecta el
iPhone. **Desconectar iPhone** revoca su acceso. En pantallas pequeñas las
columnas se apilan. El modo demo indica que necesita una MiniTV real.
Requiere actualizar DeviceApp y compilar WebApp. Consulta
[instalación de la app y segundo plano](../iOSApp/README.md).

En Películas, **Ordenar por → Calidad del vídeo** usa la calidad guardada al importar cada
vídeo; los archivos sin valoración quedan al final en ambos sentidos. La calidad
y la resolución aparecen en las tarjetas y en el listado.
Las fichas leen el análisis guardado y ya no analizan el vídeo al abrirse.

Pruebas: `node --test tests/movieCatalog.test.js tests/libraryScroll.test.js tests/movieFileQuality.test.js`.

El botón **Atrás del navegador** ejecuta la acción de volver de la pantalla
actual: cierra primero el reproductor o la ficha de un capítulo, vuelve de una
temporada a la ficha de la serie y de una ficha al listado. Desde el dashboard
regresa a la pantalla de origen, aunque se hayan cambiado sus pestañas. También
respeta los niveles del buscador TMDB, las colecciones de libros y las carpetas
de fotos. Los filtros y el orden del listado se conservan. En la raíz de la
biblioteca, Atrás permite salir de la web normalmente.

Pruebas de navegación: `node --test tests/browserBack.test.js` desde `WebApp`.

Al pulsar **Reproducir en navegador**, se abre directamente el vídeo original,
sin comprobar el audio ni iniciar conversiones. Si no se oye o da problemas,
**Intentar corregir audio** está disponible bajo el reproductor y en el aviso de
error. Solo al pulsarlo la MiniTV comprueba las pistas y prepara una copia con
AAC estéreo, incluso si el navegador declara admitir el audio original,
conservando la imagen sin recodificar y el original intacto.
El reproductor muestra la comprobación, la cola, el porcentaje real, el tiempo transcurrido
y una estimación del restante; al finalizar intenta comenzar automáticamente.
Si el navegador bloquea la reproducción automática, aparece un botón **Reproducir**.
Se conservan el perfil, la posición de reanudación y los subtítulos externos.

Puedes volver al original o cerrar la ventana durante la preparación. Al abrir
el vídeo y pulsar de nuevo **Intentar corregir audio**, se recupera el avance o
se reutiliza la copia terminada. Los fallos
de conexión, conversión, herramientas o espacio se indican con **Reintentar**.
Actualiza también DeviceApp; consulta [la caché y los requisitos](../DeviceApp/README.md#audio-compatible-al-reproducir-desde-la-web).

Si la reproducción se interrumpe después de comenzar, el aviso distingue entre
un fallo de descarga, de decodificación y un archivo que el navegador no puede
reproducir. Estos errores no se presentan como fallos de preparación del audio.
**Reintentar** conserva el punto alcanzado en esta sesión y vuelve a cargar el
vídeo sin iniciar una conversión. Un error de los subtítulos no cierra el reproductor.

**Reproducir en navegador** en películas y episodios abre el vídeo dentro de la
carcasa de Los Simpson, ampliada hasta ocupar el espacio disponible. El interruptor
**Carcasa** de la cabecera permite pasar al vídeo sin marco, conservando la
reproducción, el volumen, los subtítulos y la posición. La elección se recuerda en
ese navegador, de forma independiente a las carcasas de los juegos. El vídeo
conserva sus proporciones y la vista se adapta al móvil y al escritorio.

Al pulsar **Jugar desde el navegador** en un juego de Game Boy, Game Boy Color o
Game Boy Advance, la partida aparece dentro de la pantalla de su consola.
Color y Advance conservan los colores del juego; el tono verde es exclusivo de la
Game Boy original. La cruceta,
A/B y Start/Select de la imagen son pulsadores; también funcionan las flechas,
Z (A), X (B), Enter (Start) y V (Select). Advance añade L/R sobre sus gatillos y
las teclas Q/E. El selector **Carcasa / Pantalla grande** permite acceder al
menú del emulador y volver a la consola sin reiniciar la partida. **Ayuda** muestra
las teclas junto a cada botón, con líneas amarillas sobre la consola. Al desactivarla,
queda una guía compacta a la derecha; la preferencia se recuerda en el navegador.
La vista de pantalla grande también muestra la guía compacta. La cabecera incluye
la portada, el año disponible y el regreso a la ficha del juego. Requiere actualizar
WebApp y DeviceApp juntos. Las demás plataformas conservan su reproductor habitual.

**Configurar controles** abre el mapeo del jugador 1. Pulsa una asignación y después
una tecla, un botón del ratón o del gamepad, o mueve un eje del gamepad. Cada sentido
del eje se asigna por separado; primero hay que soltar los botones y centrar los
ejes. Escape cancela la captura. Puedes añadir asignaciones con **+**, quitarlas
con **×** o restaurar los valores originales. Si una entrada ya pertenece a otro
botón, se mueve a la nueva asignación y el diálogo indica de dónde se ha retirado.
El juego se pausa mientras el diálogo está abierto y conserva su pausa anterior.
Los cambios se guardan por consola en el navegador, funcionan también en pantalla
grande y actualizan las etiquetas de la ayuda y los botones. El número de mando
corresponde a su posición de conexión en el navegador. Si el navegador impide
guardar, el diálogo avisa y mantiene el mapeo durante la partida actual.

Pruebas de controles: `node --test tests/gameInputMapping.test.js tests/gameboyBridge.test.js` desde `WebApp`.

Los botones se sombrean mientras están pulsados, también al jugar con el teclado.
El puente del emulador comunica las pulsaciones simultáneas y suelta la indicación
al perder el foco o cambiar de vista. Cada control expone `data-console-button`
(`up`, `down`, `left`, `right`, `a`, `b`, `start`, `select`, `l`, `r`),
`data-pressed="true|false"` y la clase `is-pressed` para conectar otros diseños.
Game Boy, Game Boy Color y Game Boy Advance utilizan los SVG aportados por el
usuario, conservados en `src/assets/gameboy-vector.svg`,
`src/assets/gameboy-color-vector.svg` y `src/assets/gameboy-advance-vector.svg`.
`GameBoyVector.jsx` los inserta como vectores:
los grupos `data-part="a|b|dpad|start|select"` se hunden y oscurecen de forma
independiente; la cruceta se desplaza según la dirección y el LED indica que la
partida está lista. Las coordenadas de pantalla y controles están en
`gameConsoleFrames.js`. En Color, las letras A/B y las marcas de la cruceta se
mueven junto con sus botones; la pantalla conserva los colores del juego.
Advance incluye los grupos `data-part="l|r"` para animar también los gatillos,
con Q/E o pulsándolos en pantalla; su LED se ilumina en verde al iniciar el juego.

Todas las plataformas tienen un control de volumen de 0 a 100 % y un botón para
silenciar/restaurar el nivel anterior en la cabecera. El nivel se recuerda en el
navegador y se sincroniza con el menú del emulador en la vista ampliada. Ajusta
el audio de la partida del navegador, sin cambiar el volumen de la Raspberry.

Mega Drive utiliza un desplegable de carcasas: **Los Simpson**, **Gray**,
**Cream**, **Green** y **Sin carcasa**. Los Simpson es la opción inicial; la
selección se recuerda en este navegador. Sin carcasa muestra directamente una
pantalla 4:3 y permite seguir usando el mando. El catálogo y las medidas están
en `gameTelevisions.js`, y las imágenes transparentes en `public/game-televisions/`.
El dibujo del televisor cubre los bordes del juego, respetando la forma del cristal.
La carcasa de Los Simpson aprovecha la altura hasta el borde inferior: las puntas
de sus antenas quedan detrás de la cabecera semitransparente para ampliar la tele.
Todo el hueco de la pantalla tiene una base negra, igual que el fondo del emulador,
para que los juegos que dejan bandas no muestren el color de la página.
Al cambiar de carcasa, el marco y la pantalla aparecen juntos una vez decodificada
la imagen. Durante la carga se oculta la pantalla sin desmontar el emulador ni
interrumpir la partida. Si falla la imagen, se puede reintentar o elegir otra carcasa.

El interruptor **Mostrar mando** activa la franja inferior, con el mando ampliado;
al desactivarlo, la tele aprovecha ese espacio para crecer. **Ayuda** solo aparece
con el mando visible y activa las teclas sobre sus botones y la guía de la cruceta.
La leyenda completa permanece siempre a la derecha de la tele, centrada en vertical,
con independencia de ambos interruptores. La preferencia de ayuda se recuerda por
separado de las portátiles. Cambiar de carcasa, ocultar
el mando o cambiar la ayuda mantiene el mismo emulador, sus controles y la partida.

Debajo aparece el mando SVG de tres botones MK-1650 aportado por el usuario,
con el logo **SEGA** en plata añadido en una capa independiente. Su archivo está
en `src/assets/megadrive-controller.svg`; las capas A/B/C, Start y cruceta se
hunden y oscurecen con ratón, pantalla táctil o teclado. Flechas, Z/X/C para A/B/C
y Enter para Start. Se conservan A/S/D para X/Y/Z y V para Mode mediante teclado
para los juegos compatibles con seis botones. La procedencia del logo se detalla
en `public/game-televisions/README.md`.

## Puntuaciones de IMDb, Rotten Tomatoes y Metacritic con OMDb

En **Dashboard → Servicios auxiliares → Puntuaciones · OMDb**, guarda la clave obtenida en
[OMDb](https://www.omdbapi.com/apikey.aspx) y pulsa **Probar conexión**. La clave
se guarda en la Raspberry y se muestra en el formulario de configuración al acceder
con el PIN. No se incluye en la compilación ni se guarda en el almacenamiento del
navegador. El plan gratuito de OMDb permite 1.000 consultas al día.

Las fichas de películas y series, incluidas las vistas previas del buscador TMDB,
muestran cuatro tarjetas: TMDB sobre 5, IMDb sobre 10, Rotten Tomatoes en porcentaje
y Metacritic sobre 100. Cada nota lleva una estrella delante y, cuando la fuente
proporciona el recuento, sus votos al lado entre paréntesis y en letra pequeña.
Las notas de OMDb incluyen su fecha de actualización.
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
(sobre 100). La fuente elegida se usa en las tarjetas de la biblioteca y al ordenar
por puntuación; las fichas muestran las cuatro fuentes juntas. La selección se recuerda en ese navegador para ambas
secciones. Las notas ausentes se muestran como «No disponible» y quedan al final
en ambos sentidos de ordenación. La biblioteca lee las notas OMDb ya guardadas,
incluidas las antiguas, sin consultas externas. **Actualizar fichas** permite
completar las pendientes; al abrir una ficha se actualiza también su nota en la
biblioteca.

Al ordenar películas por IMDb, el deslizador muestra marcas enteras del 0 al 9,
sin «/10». Al recorrerlo, el indicador de la izquierda muestra la nota exacta
con decimales; las películas sin puntuación conservan su acceso al final.
Con Rotten Tomatoes y Metacritic, las marcas van del 0 al 100 de diez en diez
y el indicador de la izquierda conserva la puntuación exacta. Metacritic
prescinde de «/100» en el deslizador.

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

La ficha de una película guardada incluye **Obtener subtítulo**, con los 21
idiomas de MiniTV y el idioma de la interfaz seleccionado inicialmente. Si no
hay un subtítulo compatible, permite traducir con IA una pista de texto existente
a cualquiera de esos idiomas, incluidos los que no tienen catálogo propio en
OpenSubtitles. Busca y guarda automáticamente el SRT en la Raspberry, primero
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

**Descargas libres** permite buscar torrents sin ficha desde la parte inferior de
**Dashboard → Torrents**. La búsqueda abarca todas las categorías y conserva la
ordenación por seeds/tamaño. Al pulsar **Descargar** se muestra **Iniciando…** y se
bloquean los clics repetidos. La confirmación añade la tarea inmediatamente al
listado y abre su tarjeta; los resultados ya añadidos muestran su estado y
**Ver descargas**. Los errores y la falta de respuesta aparecen junto al resultado.
Las tareas comparten pausa, reanudación, cancelación
y avisos con las descargas habituales. Al finalizar o cancelar pasan a la tercera
pestaña **Descargas libres**; las vinculadas a fichas siguen en **Historial**.

**Ver contenido** abre un explorador de carpetas y subcarpetas con descompresión
y borrado de toda la descarga. Las canceladas se pueden quitar del historial.
El explorador muestra la ruta completa del servidor y permite volver a cualquier
carpeta superior desde la ruta o con **Subir una carpeta**. El lápiz de la barra
activa la edición de todos los nombres del directorio actual. A su lado, **✓**
o **Enter** guarda los cambios y **×** o **Esc** cancela los cambios pendientes.
Solo se envían los nombres modificados; si alguno falla, su error aparece en la
fila y se conserva el borrador para corregirlo o reintentarlo. Los nombres ya
guardados se mantienen. El icono de flechas circulares actualiza el listado. Los nombres duplicados
se rechazan sin sobrescribir contenido; durante la descompresión se desactiva el
renombrado. Esta función requiere actualizar también DeviceApp.
En **Uploads → Serie/Película**, **Abrir descargas libres** permite elegir un vídeo
o carpeta del servidor y confirmar después su ficha TMDB. Se mueven los vídeos
compatibles sin volver a subirlos desde el navegador; otros archivos y capítulos
ya instalados se conservan en la descarga. Para películas, una carpeta debe
contener un único vídeo. Las series pueden tener subcarpetas y necesitan nombres
de capítulo reconocibles (`S01E01`, `1x01`). Información general muestra cantidad
y espacio de Descargas libres junto a Series y Películas.

En **Dashboard → Torrents**, junto a **Codex**, se encuentran las descargas en curso,
el historial y los ajustes de torrents. Cada descarga tiene **Avisarme al terminar**.
Cuando está lista en la biblioteca, aparece un contador amarillo en la campanita
junto a **Fotos**. El botón circular comparte el fondo oscuro del menú y permite
abrir las descargas; la tele de la cabecera mantiene su acceso al dashboard.
En las temporadas, que no muestran ese menú, se conserva el aviso sobre la tele.
Al pulsar la campanita con avisos pendientes, se abre **Historial** y se enfoca la
primera descarga avisada, resaltada en amarillo. **Dejar de avisar** retira ese
aviso del contador y el botón desaparece del historial. El contador se reduce
al instante y desaparece al llegar a cero. Abrir el historial no desactiva los
avisos y no se pueden activar nuevos avisos en descargas ya terminadas. Las
descargas canceladas o con error no generan avisos de finalización.

Las películas terminadas ofrecen **Ir a la ficha**. Si la película está en el
catálogo cargado, se abre directamente sin volver a cargar la biblioteca ni sus
portadas. Solo si no se encuentra se consulta el catálogo de la Raspberry; si
tampoco está allí, aparece un diálogo y se conserva la descarga en el historial.
Un fallo de conexión durante esa consulta se indica por separado.

La elección se guarda por perfil en la Raspberry y se comparte entre sus
navegadores. También se detectan las descargas terminadas mientras la web estaba
cerrada al volver a abrirla. Requiere actualizar WebApp y DeviceApp. Son avisos
dentro de la app y no requieren permisos de notificaciones del navegador.

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

Las fichas de películas y series muestran **Reparto y equipo** justo después de
las puntuaciones y antes de las temporadas. El bloque aparece plegado, solo con
su título y la flecha para abrirlo o cerrarlo. Incluye actores y personajes,
dirección, guion/obra original y, en series, creadores. Cada persona tiene un avatar
circular con su foto de TMDB; si no hay foto o no se puede cargar, aparecen sus
iniciales. Las listas se pueden ampliar para consultar todas las personas disponibles.
Las fotos se cargan a medida que son visibles. Estos datos se leen de la caché de
la Raspberry y están disponibles sin conexión a TMDB una vez preparados.
Para completar las fichas existentes, usa **Dashboard → Servicios auxiliares → TMDB
→ Reparto y equipo → Completar todas las fichas**. El panel muestra el progreso,
los errores y los títulos que necesitan identificar su ficha. Requiere actualizar
tanto la web como la API de la Raspberry. Las nuevas incorporaciones preparan
los créditos y sus fotos automáticamente. Usa también **Completar todas las fichas**
para añadir los avatares a créditos descargados antes de esta actualización.

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
En una ficha guardada, **Guardar vídeo seleccionado** conserva la selección en
la Raspberry y la muestra primero al volver a abrir el juego, también tras
actualizar sus metadatos. Se conservan los vídeos originales de la ficha.
El botón confirma el guardado y permite reintentar si falla. Requiere actualizar
tanto WebApp como DeviceApp.
Configura una clave de **YouTube Data API v3** en Dashboard → Servicios auxiliares
→ YouTube Data API v3 (habilita la API en el proyecto de Google Cloud).
La búsqueda se hace desde el servidor y conserva resultados en memoria durante
15 minutos para evitar repetir consultas. Los errores de clave, cuota, conexión
y las búsquedas vacías se indican en pantalla; no impiden usar los vídeos de IGDB.

### Buscar con IA

En **IA → Buscar**, el filtrado usa la API de OpenAI con la clave configurada en
el dashboard. El selector de modelos recuerda el modelo de API elegido en este
navegador. Las preferencias antiguas de Codex se migran a OpenAI conservando ese
modelo. Las recomendaciones también usan la API de OpenAI.

El botón **IA**, junto al filtro de la biblioteca, abre una consulta con ejemplos
para la sección actual: películas por actor o temas, series por ambiente o
similitud, libros por autor y juegos por estilo, consola o desarrollador. En fotos se busca
por nombre de archivo. La respuesta filtra el listado normal y se combina con
los filtros manuales, favoritos y la vista actual. **Quitar filtro IA** permite
volver al listado anterior. Una petición de aclaración conserva el filtro que
ya estaba aplicado; no sustituye el listado por una respuesta inventada.

Actívala desde **Dashboard → Servicios auxiliares → OpenAI**: introduce la clave,
guarda, comprueba la conexión y pulsa **Subir catálogo a OpenAI**. El formulario recupera y muestra la clave y los
ajustes guardados al acceder con el PIN, sin guardarlos en el almacenamiento del
navegador; el campo vacío conserva la clave existente.
La prueba utiliza los ajustes guardados. Requiere actualizar web y API, conexión
a Internet y acceso a la API de OpenAI. En modo maqueta los controles indican que
hay que conectarse a la Raspberry y no guardan credenciales ni simulan resultados.

El botón genera un archivo de texto compacto con IDs, títulos, año y autor,
director, creador o desarrollador cuando están disponibles, además de la consola
de los juegos. No incluye sinopsis ni archivos multimedia. Solo se actualiza al
pulsarlo. El panel muestra la última subida, cantidades por sección y cambios
pendientes. Si cambias la clave de OpenAI, vuelve a subir el catálogo.

El modo **Buscar** adjunta ese archivo a cada consulta y busca exclusivamente
en la sección activa: libros, películas,
series o juegos. Las adaptaciones y los títulos compartidos no permiten mezclar
IDs entre secciones. La IA recibe instrucciones breves: usar el catálogo y su conocimiento,
buscar solo en la sección activa y devolver únicamente un array JSON como `[123,456]`
o `[]`. No se le piden mensajes ni otros campos y no se envían enumeraciones de IDs.
El servidor valida la respuesta, la pertenencia de los IDs a la sección y que sigan
presentes antes de mostrar las fichas. El archivo subido sigue siendo válido.

El selector **Modelo** permite cambiar de modelo antes de cada búsqueda sin alterar
el predeterminado del dashboard. El dashboard también ofrece un selector para guardar
ese valor. **Actualizar modelos** carga los modelos de texto de tu cuenta: se priorizan
los alias actuales disponibles, incluidos `chat-latest`, `gpt-6.1-sol`, `gpt-6-luna`
y `gpt-6-astra`. También se puede escribir un ID. Si no se puede consultar la cuenta,
se avisa y se muestran opciones predefinidas cuya disponibilidad depende de la clave.
Los modelos disponibles pueden tener distintos costes y tiempos de respuesta.

Los recuentos se calculan sobre esos resultados. Los elementos añadidos después de
la subida requieren actualizar el catálogo. La IA puede equivocarse: no analiza
los vídeos ni las imágenes. Fotos mantiene la búsqueda por nombre de archivo.
El archivo consume contexto al consultarlo y debe caber en el modelo configurado.

Después de buscar, **Depurar** permite ver la respuesta original de la IA y el
motivo concreto de un rechazo: formato, IDs incorrectos o respuesta incompleta.
También muestra las instrucciones exactas, el modelo, archivo adjunto, estado y consumo de tokens. **Respuesta
completa de OpenAI** despliega el cuerpo recibido y **Copiar informe** permite
compartirlo para diagnosticar el fallo, incluso desde la dirección HTTP de la
Raspberry. Abrir o copiar el informe no repite la consulta. Las claves se ocultan
y el informe no se guarda en el almacenamiento del navegador.

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

### Consumo y costes de OpenAI

**Dashboard → Servicios auxiliares → OpenAI → Consumo** muestra el registro
persistente de búsquedas, recomendaciones, traducciones de subtítulos, imágenes y
pruebas de conexión hechas por esta Raspberry. Incluye llamadas, tokens y coste
estimado, gráficas por día, semana (lunes), mes y año, filtros de fechas, función y
modelo, y un historial paginado con detalles. Las traducciones y generaciones por
lotes permiten filtrar una tarea y sumar sus llamadas. Fechas y agrupaciones usan
UTC para poder compararlas con los costes diarios de OpenAI; los importes son USD.

El registro comienza al instalar esta versión del servidor. Guarda metadatos y
consumo, sin consultas, respuestas, subtítulos ni fotografías. Cada llamada
conserva la tarifa utilizada: actualizar las tarifas no recalcula el pasado.
Las tarifas verificadas se mantienen en `DeviceApp/ai_usage.py`; los modelos,
modalidades o consumos sin tarifa compatible aparecen sin estimación. Los
errores y las interrupciones pueden tener coste: si falta el consumo, se señala
como desconocido y no se considera cero. El estado mostrado es el de la API,
aunque la aplicación pudiera rechazar después el formato de una respuesta.
Las subidas de catálogo y la consulta de modelos no se incluyen en este registro
de inferencias; el uso de Codex con la suscripción de ChatGPT tampoco.

**Importar costes históricos de OpenAI** es opcional. Introduce una clave
**Admin API**, el ID del proyecto y, si lo necesitas, el **ID** de la clave API
como filtro (no su secreto). La clave de administración se guarda con permisos
restringidos en la Raspberry y nunca se devuelve al navegador. Guarda y pulsa
**Importar fechas seleccionadas** para recuperar hasta 366 días por operación.
La importación es explícita, paginada y reemplaza los importes del intervalo;
repetirla no duplica el gasto. Un error conserva los datos anteriores.

Los importes comunicados por OpenAI se muestran separados de las estimaciones.
Pueden incluir actividad de otros dispositivos en ese proyecto/clave y no se
filtran por función, modelo o tarea local. Se indica cuántos días se han
importado; los que no se han importado quedan sin importe. OpenAI puede revisar
los datos diarios. Este histórico proporciona totales, no las llamadas antiguas
que la aplicación no registró. Requiere actualizar tanto WebApp como DeviceApp.

## Codex en el dashboard

**Dashboard → Codex** incorpora conversaciones con el Codex de la Raspberry:
mensajes en directo, historial, aprobaciones y cancelación. El panel tiene una
clave de administrador separada del PIN familiar, respeta el idioma de la web
y permanece inactivo en modo demo. [Preparar la Raspberry](../DeviceApp/CODEX.md).

## Fotos: Galería, Mapa, Personas y Álbumes personales

**Galería** contiene todas las fotos una sola vez y no admite subcarpetas.
**Mapa**, **Personas**, **Álbumes personales** e **IA** muestran referencias a esas
mismas imágenes. Álbumes personales admite carpetas y subcarpetas sin límite de
profundidad. **Añadir a álbum** conserva las referencias que ya existen.
Las antiguas subcarpetas de Uploads se eliminan del catálogo al actualizar la API,
conservando sus fotos en Galería y sus archivos originales. Las carpetas propias
que estaban en la raíz pasan a Álbumes personales.

En **Modo de acción → Borrar fotos**, Galería avisa de que se borrará el original y
todas sus referencias en el mapa, personas y álbumes. Desde un álbum se ofrecen
**Quitar solo de este álbum** y **Borrar la imagen de Galería**, con sus consecuencias.
Quitar una referencia conserva la imagen y el resto de sus asociaciones.

Galería se recorre mediante un deslizador de **años** y otro de **meses**. El segundo
permite avanzar también dentro de un mes con muchas fotos. La tira de miniaturas
es desplazable y representa toda la colección; solo monta el tramo visible.
Sus miniaturas de 24 px se distribuyen en ocho filas. El bloque de fotos ampliadas
queda centrado en la tira al navegar, al terminar de desplazarla y al cambiar su
anchura, incluso al principio y al final de la colección.
Al detenerse durante 220 ms, las 100 fotos de la posición elegida se amplían con
una animación, respetando la preferencia de movimiento reducido. Las fotos sin
fecha tienen su propia posición al final. Buscar filtra también la línea temporal.
Los demás álbumes, Personas y las zonas del mapa mantienen 100 fotos por página.

**Subir fotos** guarda los originales en Galería; desde un álbum añade también
una referencia, y desde IA permite crear su álbum. La selección se envía en lotes
de hasta 20 imágenes y 80 MB; cada archivo admite hasta 50 MB. Los archivos
idénticos se reutilizan por SHA-256. Los álbumes importados, si se solicitan,
se crean en Álbumes personales cuando el destino es Galería.

Las tarjetas mantienen **Favorito**. Solo se solicitan miniaturas cercanas a la
zona visible, con un máximo de dos peticiones simultáneas. Las fotos ampliadas
tienen prioridad sobre las miniaturas de 24 px de la tira. El visor muestra
primero la miniatura y después la vista grande, con opción de reintentar.
El visor permite pellizcar con dos dedos, arrastrar la imagen ampliada y hacer
zoom con el trackpad (incluidos los gestos de Safari). El doble toque/clic alterna
entre ampliar y ajustar. Los controles −, porcentaje y + ofrecen la misma función;
con el foco en la imagen, +/− amplían, 0 ajusta y las flechas desplazan mientras
haya zoom. El encuadre limita el movimiento a los bordes de la foto y se restablece
al cambiar de imagen. El zoom utiliza el JPEG existente, sin pedir conversiones.
Dos iconos compactos, **Original** y **JSON**, descargan el archivo original sin
recomprimir y los metadatos importados. El JSON solo aparece cuando hay metadatos.
Las descargas conservan el nombre de la foto; el original se sirve directamente
como archivo adjunto, sin cargarlo entero en memoria del navegador.
Al cambiar de página se desmontan las tarjetas anteriores; **Seleccionar esta página**
solo selecciona las fotos visibles y la selección se limpia al pasar de página.
Los datos ausentes
se indican expresamente. Al abrir una foto, el visor admite cerrar con Escape,
retroceder y avanzar con las flechas. **Modo de acción** permite seleccionar
varias fotos y añadir referencias a un álbum existente o crear uno en Álbumes
personales o dentro de otro álbum. La organización se guarda en SQLite; el archivo físico y su
ruta permanecen estables para conservar los favoritos de cada usuario.

Todas las tarjetas con coordenadas, incluidas las de Personas y las vistas previas
de importación, ofrecen **Ver en el mapa** junto al GPS. Abre un minimapa sin
abandonar la foto ni cambiar la selección. La miniatura marca su posición exacta
y queda centrada; la escala inicial se calcula con el tamaño del país. Puedes
ampliar, desplazar y pulsar **Volver al encuadre**. Escape, Atrás o la cruz cierran
solo el minimapa; durante una edición, primero cancelan los cambios sin guardar.
En el visor, las fotos sin GPS también ofrecen el mapa para añadir una ubicación.
Los límites de países se cargan al abrir el mapa y se consultan en el navegador;
el fondo usa OpenStreetMap, como el mapa general. Si no se identifica el país,
se utiliza un encuadre regional centrado en el punto.

El visor y los pasos de revisión por lotes muestran la **localidad y el país** junto
a las coordenadas. El minimapa también los muestra y los actualiza al cambiar la
posición; el país se traduce al idioma de la aplicación. Se consulta
[Photon](https://github.com/komoot/photon), un geocodificador de código abierto
basado en OpenStreetMap. Solo se envían latitud y longitud redondeadas a cuatro
decimales (unos 11 m), sin la imagen, su nombre ni las personas. La localidad es
la del elemento cercano que devuelve Photon; puede faltar o ser aproximada.

Las consultas se hacen al ver una foto o abrir su mapa, después de 400 ms sin
cambiar de posición, y no se lanzan para todas las tarjetas de la galería.
La Raspberry permite una consulta simultánea y como máximo una cada 1,1 s;
guarda los resultados durante 30 días en `PhotoCache/places.sqlite3` (un día si
no hay coincidencia). La caché no cambia la revisión del catálogo. Los errores
y límites del proveedor activan una pausa; nunca bloquean editar o pasar de foto.
La API pública de Photon admite un uso moderado y no garantiza disponibilidad.
`MINITV_PHOTON_URL` permite sustituir `https://photon.komoot.io` por una instancia
propia compatible, indicando su URL base, o desactivar las consultas con `off`.
Las coordenadas, la edición y el encuadre de país siguen funcionando sin ella.

**Mapa** utiliza OpenStreetMap y agrupa las fotos de Galería con GPS según la escala.
Solo se dibujan grupos dentro de la zona visible, con un máximo de 100 miniaturas;
si hay más, se agrupan sin descartar fotos. Cada pin contiene una miniatura y un contador; al pulsarlo aparece el mosaico de
esa zona. Acercar el mapa separa las agrupaciones. El pellizco del touchpad
(también en Safari) permite acercar y alejar de forma continua alrededor del cursor;
el desplazamiento normal con dos dedos sigue desplazando la página. También se
puede pellizcar la pantalla táctil o usar los botones +/−. Las fotos sin GPS se cuentan
aparte; las referencias de los álbumes no duplican puntos del mapa. El fondo requiere
Internet; las fotografías se sirven desde la Raspberry.

**Diviértete con la IA** contiene álbumes de originales. **Generar variantes**
solicita cuatro ediciones por original: LEGO, gomaespuma, Minecraft y Studio
Ghibli. Se envían a OpenAI únicamente al pulsar Generar, usando la clave del
Dashboard y la [API de edición de imágenes](https://developers.openai.com/api/reference/resources/images/methods/edit).
Requiere OpenAI activado, una cuenta con acceso al modelo y cuota de API. El
modelo predeterminado es `gpt-image-2`; el servidor permite configurar
`MINITV_PHOTO_IMAGE_MODEL`. La generación continúa al cerrar la pestaña. Las
variantes completadas se conservan y no vuelven a generarse al reintentar; una
interrupción del servicio requiere pulsar Generar pendientes. Una petición
interrumpida puede haber consumido cuota del proveedor aunque no se recibiera
su respuesta; no se reintenta automáticamente. El progreso y los errores se
muestran en el álbum. Las variantes nunca se convierten en nuevas entradas de
generación. Se respeta el límite de consultas configurado entre imágenes.

**Personas** agrupa caras con el detector HOG y la red neuronal ResNet de dlib en
la Raspberry, sin consultar iCloud ni subirlas a un servicio externo. Los nombres iniciales son Persona 1, Persona 2, etc.; se
pueden renombrar. Estos grupos provisionales siguen disponibles para revisarlos,
pero no aparecen como destino al identificar una cara o unir personas: los
selectores ofrecen únicamente nombres identificados y **Desconocido**. Los nombres
se ordenan alfabéticamente por su primera palabra; cuando coincide, aparece primero
la persona con más fotos distintas. Los apellidos solo desempatan si tienen el mismo
número de fotos. Esta regla se comparte entre el visor, las fusiones y el asistente
de revisión; **Desconocido** permanece al principio. Al corregir
una cara de un grupo provisional se abre la entrada de nombre nuevo; también puedes
elegir una identidad ya conocida. Las coincidencias son aproximadas: en Modo de acción,
**Quitar de esta persona** corrige una asociación sin borrar la foto. Los rasgos
faciales se guardan localmente en el catálogo y no se devuelven al navegador.
**Analizar** permite elegir el tamaño del lote, por defecto **100 originales pendientes**, incluidos
los importados con GPS que antes se omitían. Al terminar se detiene automáticamente;
**Analizar otro lote** permite elegir el tamaño del siguiente lote. Una franja superior muestra porcentaje,
fotos revisadas y errores, con **Pausar** y **Continuar analizando**, sin diálogo
bloqueante. Al pausar se interrumpe el proceso incluso en mitad de una foto, que
queda pendiente para reintentar; el avance ya guardado se conserva al cerrar
la página y queda pausado tras reiniciar la API. Las fotos nuevas añadidas durante
un lote se analizan en el siguiente. Las etiquetas de personas de Apple se
conservan como metadatos originales, pero no se utilizan en Personas. Las fotos
antes marcadas como `imported` también se analizan localmente. No se analizan las
variantes de IA. El modo de bajo consumo usa un núcleo, prioridad baja, fotos de
800 px y descansos entre imágenes; se pausa automáticamente a 75 °C.
Las carpetas se actualizan durante el análisis. Al entrar en una persona, su
nombre se edita directamente y **Elegir portada** permite pulsar cualquiera de
sus fotos, también usando búsqueda y paginación. La portada elegida permanece
fija al pasar el ratón, al añadir fotos o unir otras personas a esa carpeta y al
volver a abrir la biblioteca. Un nuevo análisis que no detecte la cara de la
portada tampoco elimina la elección. Las tarjetas
de Personas y la miniatura del editor muestran solo el recuadro de su cara,
conservando sus proporciones. Se usa la foto elegida como portada o la primera
del álbum que tenga un recuadro de esa persona cuando no hay una portada elegida.
Si la portada elegida aún no tiene recuadro, se muestra esa foto completa hasta
que se detecte o añada la cara, sin sustituirla por otra foto. Las portadas de Personas no
rotan al pasar el ratón. Si todavía no hay ningún recuadro, aparece un icono de
persona; abre una foto y pulsa **Detectar personas** para obtenerlo. La interfaz
indica si falta instalar el motor en la Raspberry y permite reintentar errores.

Si varios álbumes corresponden a la misma persona, usa **Unir con una persona
existente** dentro del álbum duplicado, elige el destino y pulsa **Unir personas**.
La pantalla explica qué nombres se unirán antes de guardar. Se abre el álbum de
destino con todas las fotos, sin repetir las compartidas; conserva su nombre y su
portada elegida (o hereda la del duplicado si no tenía una). Las caras trasladadas
quedan confirmadas y el álbum duplicado desaparece del listado.

El visor grande de Galería y Personas muestra rectángulos sobre todas las caras;
al entrar desde la carpeta de una persona se resalta su cara. Pulsa un rectángulo
o **Corregir persona** en el panel lateral para elegir un nombre existente o crear
uno nuevo. El formulario aparece junto al recuadro, también al terminar de dibujar
una cara nueva, y mantiene su tamaño al ampliar la imagen. La foto permanece
visible mientras se recorre la lista de personas. En móviles, la lista se muestra
en una franja compacta bajo la imagen con desplazamiento horizontal. **Quitar cara**
pide confirmación en el panel y retira solo ese recuadro y su asociación en esa
foto; conserva el original, las demás caras y la persona en otras fotos. Volver a
ejecutar la detección automática puede detectar de nuevo una cara retirada. Los números relacionan cada cara con su
recuadro; las detecciones antiguas sin recuadro también se pueden corregir en la
lista. El cambio afecta solo a esa cara en esa foto. Las correcciones se guardan
por cara y se conservan al repetir el análisis. Elegir **Desconocido** desvincula
esa cara de la identidad anterior y deja de usar sus rasgos como muestra de esa
persona; las otras caras y fotos de esa persona conservan sus asociaciones.
Desconocido agrupa caras sin identificar, no una identidad compartida.
**Detectar personas** vuelve a
analizar solo esa foto, con la posibilidad de pausarlo y sin ejecutar dos
detectores a la vez.

**Personas → Sin personas** muestra directamente las fotos revisadas sin caras
detectadas y una subcarpeta **Pendientes de validar** con las nuevas aún sin revisar.
No hay una carpeta ni una pestaña «Resto». Las fotos sin analizar o con errores
no aparecen en esta sección. **Modo edición**, junto al título del álbum,
permite seleccionar varias fotos para descargarlas en un ZIP o borrarlas de Galería.
Desde su visor, **Añadir cara**, en el panel del visor, permite dibujar un recuadro y
elegir una persona existente o crear una nueva, igual que en Galería. También se
puede volver a detectar personas. Si aparecen caras, la foto sale de esta
carpeta y entra en los grupos correspondientes; el original sigue en Galería.

También puedes activar **Añadir cara** pulsando **F** (de *face*) con el puntero
del ratón dentro de la imagen, sin hacer clic antes. El atajo no se activa en los
márgenes del visor ni mientras escribes, guardas o tienes un editor abierto;
respeta combinaciones como Ctrl+F y no reinicia un recuadro que estés dibujando.

Actualizar WebApp y DeviceApp juntos. Para HEIC y Personas, consulta la
[instalación del soporte de fotos](../DeviceApp/README.md#biblioteca-de-fotos).
La maqueta local guarda archivos, carpetas y metadatos importados en IndexedDB,
y permite probar el visor, los movimientos y los álbumes. Personas necesita el
motor local de la Raspberry. Si falta, se muestra el comando de instalación.
No lee EXIF de imágenes sin JSON ni simula reconocimiento facial o resultados de IA.

En **Personas**, el nombre de cada tarjeta permite entrar en la carpeta.
**Modo edición**, en el slider, despliega los controles de descargar,
eliminar y seleccionar con la misma animación que las películas.
**Unir** está en la barra de selección; cambiar su desplegable no aplica cambios. La barra permite actuar
sobre las personas marcadas; terminar la edición limpia la selección.
Las acciones muestran una confirmación con las personas afectadas y, al unir, el
destino. Eliminar una persona conserva los originales y pasa sus caras a
**Desconocido**. Esta carpeta fija solo admite descarga. Las descargas individuales
y conjuntas generan un ZIP de originales, sin duplicar fotos compartidas.

Los grupos provisionales llamados Persona 1, Persona 2, etc. se revisan en el
cuarto paso del asistente de análisis. Allí se les puede poner nombre o unirlos
con una identidad existente, conservando los cambios en el borrador hasta guardar.
Al pulsar la portada o el nombre de una persona reconocida se abre su ficha con
sus fotos. Desde allí, pulsar una foto abre el visor con el recuadro de su cara.

Pruebas: `node --test tests/photoLibrary.test.js`; desde la raíz,
`python -m unittest discover -s DeviceApp/tests -p 'test_photo_library.py'`.

### Importar desde Fotos del Mac

En **Fotos → Subir fotos → Desde Fotos del Mac**, abre **Preparar mis fotos en
el Mac**. Descarga `Importar-Fotos-MiniTV.command` y ejecuta el comando mostrado
en Terminal. Requiere Python 3.10 o posterior; instala OSXPhotos 0.77.2 en un
entorno aislado de `~/Library/Application Support/MiniTV/PhotosExporter`.
El asistente permite exportar las fotos seleccionadas o toda la fototeca y elegir
la carpeta de destino. Solo crea copias locales; la subida empieza al pulsar
**Importar** en la web. Espera a que Fotos sincronice originales, álbumes y personas
con iCloud. macOS puede pedir permiso a Terminal para acceder a Fotos.

La exportación usa [OSXPhotos](https://rhettbull.github.io/osxphotos/cli.html) y
acompaña cada imagen de un archivo `nombre.ext.minitv.json` con el volcado completo
de sus metadatos disponibles. Elige la carpeta completa en la web (también se
puede arrastrar), revisa miniaturas, tamaño, ubicación, personas y álbumes, y pon
nombre al destino. También se admiten los JSON de ExifTool/OSXPhotos nombrados
`nombre.ext.json` o `nombre.json`; se emparejan por ruta, sin adivinar asociaciones
ambiguas entre HEIC/JPG con el mismo nombre. Los JSON tienen un límite de 2 MB
por imagen. XMP, vídeos y formatos no compatibles se indican como omitidos.
Los valores numéricos no finitos (`NaN`, `Infinity`, `-Infinity`) del análisis
interno de Fotos se guardan como `null`. El importador también acepta estos
valores en exportaciones anteriores, sin necesidad de volver a copiar las fotos.

La importación del Mac **solo selecciona fotos con latitud y longitud válidas en
los archivos de metadatos**. Las coordenadas cero son válidas; las ubicaciones
ausentes, eliminadas, incompletas o fuera de rango se omiten antes de enviar las
imágenes. El resumen indica cuántas fotos se han descartado. Incluye los JSON del
asistente al elegir la carpeta; sin ellos no se puede confirmar la ubicación.
Este filtro también se aplica si eliges una exportación con JSON desde Archivos y carpetas.

Las fotos seleccionadas aparecen directamente en **Galería** y en **Mapa**.
No se recrean álbumes de Apple ni se inicia reconocimiento facial en esta importación.
Se conservan los bytes originales, las fechas y zonas horarias, la ubicación
corregida en Fotos, títulos, descripciones, etiquetas y el estado de favorita en Apple.
Los nombres de personas, identificadores y jerarquía de Apple siguen conservados
en el JSON completo, descargable desde el visor. Las subidas ordinarias de imágenes
sin JSON admiten fotos sin GPS en Galería, con referencias opcionales en álbumes.
No se reconstruye el motor de reconocimiento, Recuerdos ni toda la jerarquía de
carpetas de Apple. Los vídeos, RAW y el vídeo de Live Photos quedan fuera;
las versiones editadas compatibles se importan como imágenes independientes.
Revisa `export-report.csv` para detectar originales que iCloud no haya descargado.

La subida se puede pausar entre lotes y continuar mientras el diálogo siga
abierto. Tanto la lectura de la selección como la subida muestran el indicador
animado de MiniTV, contador y tiempo transcurrido. Al conocer el total aparece
el porcentaje; durante la subida cuenta fotos confirmadas por el servidor y
muestra por separado el envío del lote actual y la espera de guardado. Si pasan
30 segundos sin avances, el panel lo indica sin dar la operación por completada.
Ante un corte se reintenta el mismo lote con un identificador estable;
el servidor no lo duplica aunque se hubiera perdido su respuesta. Si cierras la
página, vuelve al álbum y selecciona otra vez la exportación: se detectan archivos
idénticos por SHA-256 **antes de transferir las imágenes**. Un worker del navegador
lee cada archivo en bloques de 2 MB, también sobre HTTP, y consulta las huellas
en lotes de hasta 20. Solo envía los archivos que faltan; los existentes reciben
sus metadatos sin reenviar la imagen. El nombre no determina si son iguales.
No se indexan retroactivamente subidas anteriores al importador con huellas.
Las fotos guardadas antes de un error permanecen
en su álbum. Actualiza WebApp y DeviceApp juntos antes de usar esta función.

Pruebas: `node --test tests/photo*.test.js` y,
desde la raíz, `python -m unittest discover -s DeviceApp/tests -p 'test_photo*.py'`.

### Importación desde Android

MiniTV Fotos para Android comparte el QR de Subidas → Fotos con la app iOS. Incluye cola persistente, subidas en segundo plano, detección de duplicados e informe CSV. Proyecto e instrucciones: [AndroidApp](../AndroidApp/README.md).
