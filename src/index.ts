import fs from 'node:fs';
import path from 'node:path';
import { createAdminApp } from './admin.js';
import { createPublicApp } from './api.js';
import { ingest, type IngestMode } from './ingest.js';
import { buildOverlayInfo } from './overlay.js';
import { IngestScheduler } from './scheduler.js';
import { MatchStore } from './store.js';
import { TrackerClient } from './tracker/client.js';

const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile)) process.loadEnvFile(envFile);

function env(name: string, fallback: string): string {
  const value = process.env[name];
  return value === undefined || value === '' ? fallback : value;
}

// Loopback fijo: ni la LAN ni el router ven estos puertos. El tunel publica PORT.
const HOST = '127.0.0.1';

const PORT = Number(env('PORT', '4001'));
const ADMIN_PORT = Number(env('ADMIN_PORT', '4002'));
const AUTO_INGEST_MS = Number(env('AUTO_INGEST_MS', '20000'));
const DATA_PATH = path.resolve(env('DATA_PATH', './data/matches.json'));
const PUBLIC_DIR = path.resolve(env('PUBLIC_DIR', './public'));
const PUBLIC_ORIGIN = env('PUBLIC_ORIGIN', '*');
const INGEST_TOKEN = env('INGEST_TOKEN', '');
const RIOT_ID = env('RIOT_ID', '');
const RIOT_TAG = env('RIOT_TAG', '');
const hasProfile = Boolean(RIOT_ID && RIOT_TAG);

const store = new MatchStore(DATA_PATH);
const client = new TrackerClient();
const profile = { riotId: RIOT_ID, riotTag: RIOT_TAG };

async function runIngest(mode: IngestMode) {
  if (!hasProfile) {
    throw new Error('Falta RIOT_ID y RIOT_TAG. Copia .env.example a .env y completalos.');
  }
  return ingest({ client, store, riotId: RIOT_ID, riotTag: RIOT_TAG }, { mode });
}

const scheduler = new IngestScheduler({
  intervalMs: Number.isFinite(AUTO_INGEST_MS) ? AUTO_INGEST_MS : 0,
  run: async () => {
    const result = await runIngest('incremental');
    if (result.added > 0) {
      console.log(`[ingesta] ${result.added} partida(s) nueva(s) · ${store.list().length} en total`);
    }
  },
  onError: (error) => {
    console.warn(`[ingesta] ${(error as Error)?.message ?? error}`);
  },
});

const publicApp = createPublicApp({
  getOverlay: () => buildOverlayInfo(store.list(), profile),
  publicDir: PUBLIC_DIR,
  publicOrigin: PUBLIC_ORIGIN,
  health: () => {
    const status = scheduler.status();
    return { lastIngestAt: status.lastSuccessAt, ingestIntervalMs: status.intervalMs, matches: store.list().length };
  },
});

const adminApp = createAdminApp({ token: INGEST_TOKEN, runIngest });

publicApp.listen(PORT, HOST, () => {
  console.log(`Overlay (publico, solo lectura): http://${HOST}:${PORT}/`);
});

adminApp.listen(ADMIN_PORT, HOST, () => {
  const state = INGEST_TOKEN ? 'habilitada con token' : 'deshabilitada (falta INGEST_TOKEN)';
  console.log(`Admin (local, no publicado):      http://${HOST}:${ADMIN_PORT}/api/ingest — ${state}`);
});

if (!hasProfile) {
  console.warn('[aviso] Define RIOT_ID y RIOT_TAG en .env: sin eso no hay ingesta.');
} else if (scheduler.enabled) {
  scheduler.start();
  console.log(`[ingesta] automatica cada ${scheduler.status().intervalMs} ms`);
} else {
  console.log('[ingesta] automatica desactivada (AUTO_INGEST_MS=0)');
}

function shutdown(): void {
  scheduler.stop();
  console.log('Cerrando...');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
