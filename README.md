# Valorant OBS Overlay

Overlay compacto para OBS (fuente **navegador**) con el **rango competitivo actual** y el acumulado de **victorias, derrotas y empates** de una cuenta de Valorant, usando sólo **partidas competitivas** de [tracker.gg](https://tracker.gg/valorant).

Pensado para mostrar el progreso en stream sin ocupar la pantalla: una tarjeta de ~300×88 px con fondo transparente.

- **Repo**: <https://github.com/Ger1211/valorant-obs-overlay>
- **Página pública**: <https://ger1211.github.io/valorant-obs-overlay/> (necesita `?api=<url-del-túnel>` para ver datos en vivo)


```
┌──────────────────────────────┐
│  [icon]  Diamond 3   11 W  4 L  1 D │
│          RANK                       │
└──────────────────────────────┘
```

La UI del overlay está en inglés. Los contadores son **W**ins, **L**osses y **D**raws (empates).

## Qué cuenta

- **Sólo partidas competitivas** (`Competitivo`). Unrated y otros modos se descartan al ingerir.
- **Todas las partidas de la cuenta**, sin ventana por día ni por acto.
- Los tres contadores son excluyentes: una partida es victoria, derrota, empate o `unknown`. Los `unknown` (resultado que tracker.gg devuelva raro) se guardan pero no suman a ninguno.
- El **rango** es el de la partida competitiva más reciente con rango conocido. Sin partidas, muestra `Unranked`.

## Requisitos

- **Node 20.12+** (probado en Node 24).
- **curl con fingerprint de navegador**, porque Cloudflare bloquea el `fetch` de Node y el curl común con `403`:
  - Windows: `curl.exe` (viene con el sistema).
  - Linux/Docker: [curl-impersonate](https://github.com/lexiforest/curl-impersonate) (`curl_chrome136`). Se puede apuntar con `TRACKER_CURL_BIN`.
- **Set completo de headers de navegador.** No alcanza con el TLS: con pocos headers tracker.gg responde `403` igual. El cliente manda `User-Agent`, `Accept`, `Accept-Language`, `Referer` y `Origin` de un XHR real (`src/tracker/client.ts`).
- La cuenta de Valorant debe tener las **stats públicas** (en el juego: Ajustes → General → desactivar "Ocultar historial de partidas").

## Levantarlo

```bash
npm install
cp .env.example .env      # en Windows: copy .env.example .env
npm run dev
```

Abrí <http://127.0.0.1:4001/>.

La primera ingesta puede tardar; el server la corre solo cada 20 segundos (`AUTO_INGEST_MS`).

## Configuración (`.env`)

| Variable | Default | Para qué |
| --- | --- | --- |
| `RIOT_ID` | — | Nombre de la cuenta, sin `#`. Ej. `LaLisa Hushoban` |
| `RIOT_TAG` | — | Tag de la cuenta, sin `#`. Ej. `KPOP` |
| `PORT` | `4001` | Listener público (sólo lectura). Es el único que se publica. |
| `ADMIN_PORT` | `4002` | Listener de administración (`POST /api/ingest`). **No publicar.** |
| `AUTO_INGEST_MS` | `20000` | Frecuencia de la ingesta automática. `0` la desactiva. |
| `PUBLIC_ORIGIN` | `*` | Origen autorizado a leer `/api/overlay` (dominio de Pages). |
| `INGEST_TOKEN` | vacío | Token del `POST`. Si está vacío, la ingesta manual queda deshabilitada. |
| `DATA_PATH` | `./data/matches.json` | Archivo de partidas. Borrarlo lo regenera en la próxima ingesta **completa**. |
| `TRACKER_CURL_BIN` | autodetectado | Binario curl a usar. |

## Agregarlo en OBS

1. En la escena: **Fuentes → `+` → Navegador**.
2. **URL**: `http://127.0.0.1:4001/`
3. **Ancho** `920`, **Alto** `280` (el doble del tamaño visual; la tarjeta ocupa el centro y el resto es transparente). Se puede poner cualquier tamaño: el overlay escala solo y el texto se re-renderiza a esa resolución, así que agrandarlo en la escena no lo pixela. Mínimo recomendado: **460 × 140**.
4. **Apagar fuente cuando no esté visible**: desactivado.
5. **Actualizar el navegador cuando la escena se active**: desactivado (la página se refresca sola cada 10 s).

No sirve abrir el HTML como **archivo local** (`file://`): el navegador de OBS bloquearía el pedido a tracker.gg por CORS y por el fingerprint TLS. Por eso hay un server local.

## Publicarlo en internet

**Página en GitHub Pages** (estática y siempre disponible):

1. Subí el repo a GitHub (tiene que ser **público** para Pages en el plan gratuito).
2. Settings → Pages → Source: **GitHub Actions**. El workflow `.github/workflows/pages.yml` publica `public/` en cada push a `main`.
3. La página queda en `https://<usuario>.github.io/<repo>/`.

**Datos en vivo con Cloudflare Tunnel** (desde tu PC):

```bash
winget install --id Cloudflare.cloudflared     # una vez
npm run tunnel                                  # cloudflared tunnel --url http://127.0.0.1:4001
```

Cloudflared imprime una URL `https://algo-random.trycloudflare.com`. Abrí:

```
https://<usuario>.github.io/<repo>/?api=https://algo-random.trycloudflare.com
```

Con un dominio propio se puede usar un **túnel nombrado** (`cloudflared tunnel create` + `route dns`) para tener URL fija en vez de una que cambia en cada reinicio.

Mientras la PC esté apagada la página carga igual, pero sin datos frescos (el overlay marca un punto ámbar cuando no puede leer la API).

## Seguridad

Lo que queda expuesto a internet es **un proceso, no la PC**: `cloudflared` es una conexión saliente a Cloudflare, no abre puertos en el router ni da acceso a la LAN.

- Los dos listeners escuchan en **`127.0.0.1`**, así que tampoco son alcanzables desde la red local.
- El listener público (`4001`) sirve **sólo** `public/` y dos rutas: `GET /api/overlay` y `GET /api/health`. Todo lo demás responde `404`, incluidos `/.env`, `/src/**` y `/data/**`.
- **No hay escritura pública**: `POST /api/ingest` vive en el listener `4002`, que el túnel no publica. Aunque alguien tenga el token, no puede alcanzarlo desde internet.
- Rate limit en memoria sobre `/api` (60 req/min por IP, usando `CF-Connecting-IP` detrás del túnel).
- `INGEST_TOKEN` va en `.env` (gitignored). Nunca se sirve al navegador.

## API

| Método | Ruta | Listener | Descripción |
| --- | --- | --- | --- |
| `GET` | `/api/overlay` | público | Datos del overlay (JSON). |
| `GET` | `/api/health` | público | `{ ok, lastIngestAt, ingestIntervalMs, matches }`. |
| `POST` | `/api/ingest` | admin | Ingesta manual. Header `x-overlay-token`. `?force=1` renormaliza todo lo existente. |

Respuesta de `/api/overlay`:

```json
{
  "riotId": "LaLisa Hushoban",
  "riotTag": "KPOP",
  "rankTier": 15,
  "rankName": "Platinum 3",
  "rankIcon": "/ranks/15.png",
  "wins": 12,
  "losses": 8,
  "draws": 0,
  "matches": 20,
  "lastMatchAt": 1760000000000
}
```

## Cómo funciona

```
tracker.gg ──(curl TLS)──► src/tracker/client.ts
                               │
                     src/ingest.ts (normaliza, sólo competitivas)
                               │
                    data/matches.json (store atómico)
                               │
        ┌──────────────────────┴──────────────────────┐
   :4001 público (sólo lectura)              :4002 admin (token)
        │                                            │
   public/index.html ── fetch cada 10 s        POST /api/ingest
```

- El **scheduler** (`src/scheduler.ts`) corre la ingesta cada 20 s por defecto, dentro del proceso del server. Vive ahí y no en la página porque OBS puede suspender el Browser Source; si el timer estuviera en el navegador, el contador se congelaría.
- Cada ciclo pide **una sola página** y corta en la primera partida ya guardada, así el costo es 1 request cada 20 s en vez de paginar el historial completo.
- Ante `403/429/503` aplica backoff (2 min y luego 10 min) en lugar de insistir: tracker.gg responde `429` cuando se le pega seguido, comprobado con el ciclo de 20 s.
- Los íconos salen de `public/ranks/<tier>.png` (26 archivos). Se regeneran con `npm run fetch-ranks`, que mapea por **nombre** de tier porque la API pública numera 3..27 y este proyecto normaliza 1..25.

## Tests y verificación

```bash
npm test            # node:test (normalización, contadores, scheduler, superficie pública)
npm run typecheck
npm run build       # compila a dist/ para npm start
```

## Limitaciones conocidas

- **tracker.gg es un endpoint no oficial y frágil.** Desde IPs de datacenter suele responder `403` aun con curl-impersonate; por eso el diseño corre el scraping en tu PC y publica sólo la lectura.
- **Empates**: se cuentan cuando tracker.gg informa un resultado `Draw`/`Tie`. Si la cuenta nunca tuvo uno, el contador queda en `0`.
- Si borrás `data/matches.json`, la próxima ingesta incremental reconstruye sólo lo que devuelva la primera página; para el historial completo usá `POST /api/ingest?force=1`.
