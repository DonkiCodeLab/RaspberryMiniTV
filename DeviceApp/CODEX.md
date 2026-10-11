# Codex desde el dashboard

La pestaña **Dashboard → Codex** permite conversar con Codex en la Raspberry,
consultar conversaciones anteriores, ver respuestas/comandos/cambios mientras se
ejecutan, responder preguntas, aprobar acciones individuales y detener una tarea.
El Mac no necesita estar encendido. Se necesita Internet para OpenAI.

## Instalación

Actualiza el backend y compila la web (`cd WebApp && npm run build`). En la
Raspberry, desde la raíz del proyecto:

```bash
sudo bash DeviceApp/install_codex_support.sh
```

Requiere un kernel Linux de 64 bits (aarch64 o x86_64), Node.js >=20 y npm accesibles a todos
los usuarios, git y Python >=3.9 con Flask (el utilizado por la API). El instalador
instala el paquete nativo oficial `@openai/codex` en `/opt/minitv-codex`; opcionalmente fija
una versión con `sudo MINITV_CODEX_VERSION=<versión> bash DeviceApp/install_codex_support.sh`.
El protocolo se ha comprobado con Codex CLI `0.154.0-alpha.6.2` y `0.162.1`. Se necesita una
versión que admita `account/login/start` con `chatgptDeviceCode`.

### Raspberry Pi OS de 32 bits con kernel de 64 bits

Esta combinación se detecta con `getconf LONG_BIT` (32), `dpkg --print-architecture`
(`armhf`) y `uname -m` (`aarch64`). El binario estático ARM64 de Codex arranca, pero
su filtro seccomp no admite ejecutar herramientas ARM32. Por eso el instalador
prepara herramientas Debian ARM64 en `/opt/minitv-codex/rootfs`, verificadas con la
clave de archivo oficial de Debian 13. No cambia la arquitectura del sistema ni
reinstala Raspberry Pi OS.

El lanzador usa Bubblewrap sin privilegios para montar ese entorno en modo de
solo lectura y exponer únicamente el directorio del usuario de Codex para
escritura. Dentro se ejecutan Codex, Python, Node y Git de 64 bits, con el
aislamiento de cada tarea todavía activo. Los archivos, credenciales y servicios
de la MiniTV no se montan en ese entorno. La primera instalación descarga varios
cientos de MB y tarda más; las siguientes reutilizan el entorno. Un kernel
realmente de 32 bits no es compatible con este instalador.

Guarda la **clave de administrador** que imprime el instalador. Abre la pestaña,
desbloquéala con esa clave y pulsa **Conectar ChatGPT**. Abre el enlace de OpenAI
en tu navegador e introduce el código mostrado. Tu cuenta debe tener acceso a
Codex; se aplican sus límites. Si el inicio mediante código está desactivado,
actívalo en la configuración de seguridad de ChatGPT o consulta al administrador
del espacio. No se utiliza ni modifica la clave del buscador IA del catálogo.

Documentación oficial: [App Server](https://learn.chatgpt.com/docs/app-server) y
[autenticación](https://learn.chatgpt.com/docs/auth).

## Separación y credenciales

- El backend conserva su usuario actual, pero lanza Codex como `minitv-codex`, sin
  grupos suplementarios, sudo ni credenciales heredadas de la API. Codex nunca se
  inicia como root. Solo se conecta mediante stdin/stdout; no abre un puerto propio.
- El instalador crea una copia Git independiente en
  `/var/lib/minitv-codex/workspace`, en la rama `codex/dashboard`. Parte del último
  commit de la instalación: los cambios sin commit y los archivos ignorados,
  contenido multimedia y claves no se copian. Reinstalar conserva el trabajo.
- La política de cada tarea permite escribir en esa copia; las ampliaciones que
  solicitan comandos o cambios se muestran al administrador. No se concede una
  aprobación permanente ni se ofrece ejecutar comandos arbitrarios de la web.
- `/etc/minitv-codex.json` pertenece a root, con permisos 0600. Contiene rutas y
  el hash scrypt de la clave. Las credenciales de OpenAI e historial viven en
  `/var/lib/minitv-codex/.codex`, separado del Mac y de las claves del catálogo.
- Además del PIN habitual, todas las operaciones privadas exigen una sesión de
  administrador de 8 horas. Se almacena en `sessionStorage` de esa pestaña; nunca
  se guarda la clave introducida. Hay un límite de cinco intentos por minuto.
  El botón **Bloquear panel** revoca esa sesión y permite que la tarea continúe.
- Para acceso fuera de la red de confianza utiliza HTTPS o una VPN. La API HTTP
  existente no cifra la clave, la sesión ni los mensajes durante el transporte.

## Trabajo e historial

Se ejecuta una sola tarea a la vez sobre esta copia, aunque abras varios navegadores.
Cerrar la pestaña no detiene la tarea. Al volver a desbloquearla se recuperan la
tarea y las aprobaciones pendientes. El historial lo guarda el propio Codex y se
puede reabrir tras reiniciar la API. La interfaz muestra las últimas 30
intervenciones de cada conversación y permite paginar la lista de conversaciones.

Reiniciar la API interrumpe las tareas activas; comprueba el historial antes de
reenviar un prompt. Un fallo o una tarea detenida se presenta como tal. Las
peticiones del protocolo aún no compatibles se rechazan, nunca se aprueban
automáticamente. El panel muestra los mensajes como texto, sin ejecutar HTML.

Los cambios **no se despliegan automáticamente**. Revisa la copia de desarrollo,
sus diferencias y pruebas antes de llevarlos al repositorio principal mediante tu
flujo Git habitual. La copia no se sincroniza automáticamente con nuevos commits
de la instalación, para conservar cualquier trabajo en curso. En esta versión no
hay botón de despliegue ni sincronización del historial del Mac.

## Recuperación

Para cambiar una clave olvidada, desde una terminal de la Raspberry:

```bash
sudo bash DeviceApp/install_codex_support.sh --reset-password
```

El reinicio de la API revoca todas las sesiones del panel. **Desconectar ChatGPT**
cierra la sesión de OpenAI sin borrar el historial ni los cambios. Los errores de
instalación se muestran en la pestaña; vuelve a ejecutar el instalador si falta el
binario o la copia Git. No compartas los archivos del directorio `.codex`.

Pruebas locales (sin consumir OpenAI):

```bash
python3 -m unittest discover -s DeviceApp/tests -p 'test_codex*.py'
cd WebApp
node --test tests/codex*.test.js
npm run build
```
