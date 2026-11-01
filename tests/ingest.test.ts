import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { ingest, normalizeMatch, parseResult, rankTierFromName } from '../src/ingest.js';
import { MatchStore } from '../src/store.js';
import type { TrackerMatch, TrackerMatchesResponse } from '../src/tracker/types.js';

function rawMatch(options: {
  id: string;
  result?: string;
  mode?: string;
  tier?: string;
  timestamp?: string;
}): TrackerMatch {
  return {
    attributes: { id: options.id, mapId: '/Game/Maps/Ascent/Ascent' },
    metadata: {
      modeName: options.mode ?? 'Competitive',
      result: options.result ?? 'Victory',
      mapName: 'Ascent',
      timestamp: options.timestamp ?? '2026-10-30T20:00:00.000Z',
    },
    segments: [
      {
        type: 'overview',
        metadata: { agentName: 'Jett' },
        stats: {
          roundsWon: { value: 13 },
          roundsLost: { value: 9 },
          rank: { value: 1, metadata: { tierName: options.tier ?? 'Platinum 3' } },
        },
      },
    ],
  };
}

function fakeClient(pages: TrackerMatchesResponse[]) {
  let call = 0;
  return {
    get calls() {
      return call;
    },
    async getMatches(): Promise<TrackerMatchesResponse> {
      const page = pages[Math.min(call, pages.length - 1)];
      call++;
      return page ?? { data: { matches: [] } };
    },
  };
}

function tempStore(): MatchStore {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'valorant-overlay-'));
  return new MatchStore(path.join(dir, 'matches.json'));
}

test('parseResult mapea victoria, derrota y empate sin importar mayusculas', () => {
  assert.equal(parseResult('Victory'), 'victory');
  assert.equal(parseResult('Defeat'), 'defeat');
  assert.equal(parseResult('Draw'), 'draw');
  assert.equal(parseResult('draw'), 'draw');
  assert.equal(parseResult('Tie'), 'draw');
  assert.equal(parseResult('Cancelled'), 'unknown');
  assert.equal(parseResult(undefined), 'unknown');
});

test('rankTierFromName usa la escala interna 1..25', () => {
  assert.equal(rankTierFromName('Iron 1'), 1);
  assert.equal(rankTierFromName('Platinum 3'), 15);
  assert.equal(rankTierFromName('Radiant'), 25);
  assert.equal(rankTierFromName('Unranked'), 0);
  assert.equal(rankTierFromName('Challenger'), undefined);
});

test('normalizeMatch traduce la partida competitiva completa', () => {
  const match = normalizeMatch(rawMatch({ id: 'm1', result: 'Draw', tier: 'Diamond 2' }));
  assert.ok(match);
  assert.equal(match.matchId, 'm1');
  assert.equal(match.queue, 'competitive');
  assert.equal(match.result, 'draw');
  assert.equal(match.rankTier, 17);
  assert.equal(match.mapName, 'Ascent');
  assert.equal(match.agentName, 'Jett');
  assert.equal(match.roundsWon, 13);
  assert.equal(match.gameStartTime, Date.parse('2026-10-30T20:00:00.000Z'));
});

test('normalizeMatch devuelve null sin id', () => {
  assert.equal(normalizeMatch({ attributes: {}, segments: [] }), null);
});

test('ingest descarta partidas que no son competitivas y guarda el resto', async () => {
  const store = tempStore();
  const client = fakeClient([
    {
      data: {
        matches: [
          rawMatch({ id: 'comp-1', result: 'Victory' }),
          rawMatch({ id: 'unrated-1', mode: 'Unrated', result: 'Defeat' }),
          rawMatch({ id: 'comp-2', result: 'Draw' }),
        ],
      },
    },
  ]);

  const result = await ingest({ client, store, riotId: 'LaLisa Hushoban', riotTag: 'KPOP' }, { mode: 'full' });

  assert.equal(result.fetched, 3);
  assert.equal(result.added, 2);
  assert.equal(result.skipped, 1);
  assert.equal(store.list().length, 2);
  assert.deepEqual(
    store.list().map((m) => m.result).sort(),
    ['draw', 'victory'],
  );
});

test('ingest incremental corta en la primera partida ya guardada', async () => {
  const store = tempStore();
  store.upsertMany([
    {
      matchId: 'comp-known',
      gameStartTime: Date.parse('2026-10-29T20:00:00.000Z'),
      queue: 'competitive',
      mapName: 'Ascent',
      agentName: 'Jett',
      result: 'victory',
      roundsWon: 13,
      roundsLost: 5,
      rankTier: 15,
      ingestedAt: 1,
    },
  ]);

  const client = fakeClient([
    {
      data: {
        matches: [
          rawMatch({ id: 'comp-new', result: 'Victory', timestamp: '2026-10-31T20:00:00.000Z' }),
          rawMatch({ id: 'comp-known', result: 'Victory', timestamp: '2026-10-29T20:00:00.000Z' }),
          rawMatch({ id: 'comp-older', result: 'Defeat', timestamp: '2026-10-28T20:00:00.000Z' }),
        ],
        metadata: { next: 'cursor-2' },
      },
    },
  ]);

  const result = await ingest({ client, store, riotId: 'LaLisa Hushoban', riotTag: 'KPOP' }, { mode: 'incremental' });

  assert.equal(result.stoppedAtKnown, true);
  assert.equal(result.added, 1);
  assert.equal(result.pages, 1);
  assert.equal(result.fetched, 2, 'no sigue leyendo despues de la conocida');
  assert.equal(client.calls, 1, 'una sola pagina por ciclo');
});

test('ingest full renormaliza una partida existente', async () => {  const store = tempStore();
  await ingest(
    {
      client: fakeClient([{ data: { matches: [rawMatch({ id: 'comp-1', result: 'Victory' })] } }]),
      store,
      riotId: 'LaLisa Hushoban',
      riotTag: 'KPOP',
    },
    { mode: 'full' },
  );

  const result = await ingest(
    {
      client: fakeClient([{ data: { matches: [rawMatch({ id: 'comp-1', result: 'Draw' })] } }]),
      store,
      riotId: 'LaLisa Hushoban',
      riotTag: 'KPOP',
    },
    { mode: 'full' },
  );

  assert.equal(result.added, 0);
  assert.equal(result.updated, 1);
  assert.equal(store.get('comp-1')?.result, 'draw');
});

function storedMatch(id: string, timestamp: string) {
  return {
    matchId: id,
    gameStartTime: Date.parse(timestamp),
    queue: 'competitive' as const,
    mapName: 'Ascent',
    agentName: 'Jett',
    result: 'victory' as const,
    roundsWon: 13,
    roundsLost: 5,
    rankTier: 18,
    ingestedAt: 1,
  };
}

test('ingest incremental sigue paginando si la pagina vino entera nueva', async () => {
  const store = tempStore();
  store.upsertMany([storedMatch('known-1', '2026-10-20T20:00:00.000Z')]);

  // Pagina 1: 5 partidas nuevas (todas desconocidas) y hay mas historial.
  // Pagina 2: la primera es la ya guardada -> corta ahi.
  const client = fakeClient([
    {
      data: {
        matches: [1, 2, 3, 4, 5].map((n) =>
          rawMatch({ id: `n${n}`, result: 'Victory', timestamp: `2026-10-31T2${n}:00:00.000Z` }),
        ),
        metadata: { next: 'cursor-2' },
      },
    },
    {
      data: {
        matches: [
          rawMatch({ id: 'known-1', result: 'Victory', timestamp: '2026-10-20T20:00:00.000Z' }),
          rawMatch({ id: 'vieja-1', result: 'Defeat', timestamp: '2026-10-19T20:00:00.000Z' }),
        ],
        metadata: { next: 'cursor-3' },
      },
    },
  ]);

  const result = await ingest({ client, store, riotId: 'LaLisa Hushoban', riotTag: 'KPOP' }, { mode: 'incremental' });

  assert.equal(result.pages, 2, 'no se conforma con la primera pagina si vino llena de novedades');
  assert.equal(result.added, 5);
  assert.equal(result.stoppedAtKnown, true);
  assert.equal(result.fetched, 6, 'corta en la conocida, no sigue leyendo la pagina 2');
  assert.equal(store.list().length, 6);
});

test('ingest full recorre todo el historial hasta que no hay next', async () => {
  const store = tempStore();
  const page = (from: number, next?: string) => ({
    data: {
      matches: [from, from + 1].map((n) =>
        rawMatch({ id: `p${from}-${n}`, result: 'Victory', timestamp: `2026-10-0${n}T20:00:00.000Z` }),
      ),
      metadata: next ? { next } : {},
    },
  });

  const client = fakeClient([
    page(1, 'c2'),
    page(2, 'c3'),
    page(3, 'c4'),
    page(4, 'c5'),
    page(5),
  ]);

  const result = await ingest({ client, store, riotId: 'LaLisa Hushoban', riotTag: 'KPOP' }, { mode: 'full' });

  assert.equal(result.pages, 5);
  assert.equal(result.added, 10);
  assert.equal(result.stoppedAtKnown, false);
  assert.equal(client.calls, 5);
});

test('ingest respeta el tope de paginas pedido', async () => {
  const store = tempStore();
  const page = (from: number, next: string) => ({
    data: {
      matches: [rawMatch({ id: `t${from}`, result: 'Victory', timestamp: `2026-10-0${from}T20:00:00.000Z` })],
      metadata: { next },
    },
  });

  const client = fakeClient([page(1, 'c2'), page(2, 'c3'), page(3, 'c4')]);

  const result = await ingest(
    { client, store, riotId: 'LaLisa Hushoban', riotTag: 'KPOP' },
    { mode: 'incremental', maxPages: 2 },
  );

  assert.equal(result.pages, 2);
  assert.equal(result.added, 2);
});
