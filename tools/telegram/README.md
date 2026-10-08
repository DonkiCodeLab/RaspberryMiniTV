# Descargas de Telegram

Python 3.9 o posterior. Utiliza tu cuenta y los chats a los que ya tienes acceso.
Lista documentos (incluidos ZIP, vídeos y audio enviados como documentos).
No descarga fotos enviadas como fotos ni extrae los ZIP.

## Preparación en macOS

```sh
cd /Users/donkikochan/Documents/GitHub/TvSimpsonsApp/tools/telegram
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

Obtén `api_id` y `api_hash` en https://my.telegram.org, apartado
**API development tools**. El script los solicita por terminal; también admite
las variables `TG_API_ID` y `TG_API_HASH`. Se pueden guardar en el archivo `.env`
de esta misma carpeta como `TG_API_ID=valor` y `TG_API_HASH=valor`, una por línea,
sin comillas. El script lo carga automáticamente, incluso desde otra carpeta.
Las variables exportadas en la terminal tienen prioridad. El archivo está excluido
de Git; usa `chmod 600 .env` para que solo tu usuario pueda leerlo y modificarlo.
En el primer inicio Telegram solicitará
tu teléfono, código de acceso y contraseña de verificación en dos pasos, si tienes.
No compartas las credenciales, códigos ni el archivo `data/cuenta.session`:
la sesión permite acceder a tu cuenta. `data/` está excluido de Git.

## Uso

1. Encuentra el ID del grupo o canal:

   ```sh
   python descargar.py chats
   ```

2. Los temas internos no aparecen en `chats`. Para verlos por nombre:

   ```sh
   python descargar.py temas --chat=-1002130477987
   python descargar.py temas --chat=-1002130477987 --contiene "Game Boy"
   ```

   Copia el número de `tema=...` de la consola que quieras descargar.
   Sustituye el ID de ejemplo siguiente por el real y previsualiza los ZIP:

   ```sh
   python descargar.py listar --chat=-1001234567890 --extension zip --limite 30
   ```

   Cada línea incluye `tema=ID`. Identifica el tema por sus archivos. Para obtener
   el ID exacto de un tema concreto también puedes copiar desde Telegram el enlace
   a un mensaje de ese tema y localizar ese mensaje en el listado. El tema General
   se representa con 1; en chats sin temas se usa también 1 para organizar archivos.
   Sin `--limite` se recorre todo el historial, lo que puede tardar.

3. Previsualiza y después descarga el tema elegido (123 es otro ejemplo):

   ```sh
   python descargar.py listar --chat=-1001234567890 --tema 123 --extension zip
   python descargar.py descargar --chat=-1001234567890 --tema 123 --extension zip
   ```

También puedes usar `--contiene Europe`, `--extension zip,7z` y
`--destino /Volumes/Disco/Telegram`. Sin `--tema` procesa todos los temas.
`--limite` cuenta coincidencias, incluidos archivos ya descargados; quítalo
para completar toda la tanda. El orden es del mensaje más reciente al más antiguo.
Al seleccionar un tema distinto de General, se consulta directamente su historial.
Para General o todos los temas se recorre el historial del grupo.
El script muestra el destino absoluto, el progreso por archivo (porcentaje, MB y
velocidad), un resumen de archivos nuevos y omitidos, y un aviso de actividad
cada 15 segundos durante esperas. Las pausas automáticas de Telegram también
se muestran. Tras actualizar el script, detén la ejecución anterior con Ctrl+C
y repite el comando para cargar los cambios.

Los archivos se guardan en `data/descargas/ID_CHAT/tema_ID/`, con IDs delante
del nombre para evitar colisiones. Un registro SQLite permite omitir los
archivos completados al repetir el comando y comprueba su tamaño, sin calcular
un hash de integridad. Si interrumpes una descarga, ese archivo se reinicia
desde cero en la siguiente ejecución; los completados se conservan. Telegram
puede imponer pausas que el cliente respeta automáticamente. No ejecutes varias
instancias simultáneas con la misma sesión o destino.

Si hay un archivo final sin registro válido (por ejemplo, por un cierre entre
guardar y registrar), se informa de un conflicto sin sobrescribirlo: mueve ese
archivo antes de reintentar. Los errores individuales se muestran y el proceso
continúa; al terminar devuelve código 1 si hubo errores.

Referencias: [API de Telegram](https://core.telegram.org/api/obtaining_api_id) y
[Telethon](https://docs.telethon.dev/en/stable/modules/client.html).
