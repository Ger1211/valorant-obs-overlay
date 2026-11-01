import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPublicApp } from '../src/api.js';
import type { OverlayInfo } from '../src/types.js';

const PUBLIC_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');

const overlay: OverlayInfo = {
  riotId: 'LaLisa Hushoban',
  riotTag: 'KPOP',
  rankTier: 15,
  rankName: 'Platinum 3',
  rankIcon: '/ranks/15.png',
  wins: 3,
  losses: 2,
  draws: 1,
  matches: 6,
  lastMatchAt: 1_760_000_000_000,
};

async function withServer<T>(
  app: http.RequestListener,
  fn: (base: string) => Promise<T>,
): Promise<T> {
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  try {
    return await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

function publicApp(rateLimit?: { windowMs: number; max: number }) {
  return createPublicApp({
    getOverlay: () => overlay,
    publicDir: PUBLIC_DIR,
    publicOrigin: 'https://usuario.github.io',
    rateLimit,
    health: () => ({ lastIngestAt: 1_760_000_000_000, matches: 6 }),
  });
}

test('el overlay expone solo el dato publico y con CORS', async () => {
  await withServer(publicApp(), async (base) => {
    const response = await fetch(`${base}/api/overlay`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://usuario.github.io');
    assert.equal(response.headers.get('x-powered-by'), null);

    const body = (await response.json()) as OverlayInfo;
    assert.equal(body.rankName, 'Platinum 3');
    assert.deepEqual({ wins: body.wins, losses: body.losses, draws: body.draws }, { wins: 3, losses: 2, draws: 1 });
    assert.equal(JSON.stringify(body).includes('puuid'), false);
  });
});

test('la escritura no existe en el listener publico', async () => {
  await withServer(publicApp(), async (base) => {
    const response = await fetch(`${base}/api/ingest`, { method: 'POST' });
    assert.equal(response.status, 404);
  });
});

test('no se sirven archivos fuera de public/', async () => {
  await withServer(publicApp(), async (base) => {
    for (const route of ['/.env', '/src/index.ts', '/data/matches.json', '/package.json']) {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 404, `${route} deberia ser 404`);
    }
  });
});

test('la pagina del overlay se sirve en la raiz', async () => {
  await withServer(publicApp(), async (base) => {
    const response = await fetch(`${base}/`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /overlay\.js/);
    assert.match(html, /id="wins"/);
  });
});

test('health no filtra detalles del error de ingesta', async () => {
  await withServer(publicApp(), async (base) => {
    const body = (await (await fetch(`${base}/api/health`)).json()) as Record<string, unknown>;
    assert.equal(body.ok, true);
    assert.equal('lastIngestError' in body, false);
  });
});

test('el rate limit corta el abuso del listener publico', async () => {
  await withServer(publicApp({ windowMs: 60_000, max: 2 }), async (base) => {
    assert.equal((await fetch(`${base}/api/overlay`)).status, 200);
    assert.equal((await fetch(`${base}/api/overlay`)).status, 200);
    assert.equal((await fetch(`${base}/api/overlay`)).status, 429);
  });
});
