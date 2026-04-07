# RaspberryPiWEB

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

- `RaspberryPiWEB/`: frontend React para navegadores.
- `RaspberryPiTV/control_api.py`: backend HTTP en la Raspberry.
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
RaspberryPiWEB/
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
cd RaspberryPiWEB
npm install
npm run dev
```

Por defecto intenta usar la misma URL origen del navegador. Si durante desarrollo quieres apuntar a otra Raspberry:

```bash
VITE_RASPBERRY_API_BASE_URL=http://192.168.1.50:5050 npm run dev
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

