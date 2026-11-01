import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildOverlayInfo, countResults, currentRankTier } from '../src/overlay.js';
import type { CompetitiveMatch, MatchResult, QueueType } from '../src/types.js';

function match(options: {
  id: string;
  result: MatchResult;
  queue?: QueueType;
  tier?: number;
  at?: number;
}): CompetitiveMatch {
  return {
    matchId: options.id,
    gameStartTime: options.at ?? 1_760_000_000_000,
    queue: options.queue ?? 'competitive',
    mapName: 'Ascent',
    agentName: 'Jett',
    result: options.result,
    roundsWon: 13,
    roundsLost: 7,
    rankTier: options.tier,
    ingestedAt: 1,
  };
}

test('countResults separa victorias, derrotas y empates', () => {
  const counts = countResults([
    match({ id: '1', result: 'victory' }),
    match({ id: '2', result: 'victory' }),
    match({ id: '3', result: 'victory' }),
    match({ id: '4', result: 'defeat' }),
    match({ id: '5', result: 'defeat' }),
    match({ id: '6', result: 'draw' }),
  ]);

  assert.deepEqual(counts, { wins: 3, losses: 2, draws: 1, matches: 6 });
});

test('countResults no suma resultados desconocidos a ningun contador', () => {
  const counts = countResults([
    match({ id: '1', result: 'victory' }),
    match({ id: '2', result: 'unknown' }),
  ]);

  assert.equal(counts.wins + counts.losses + counts.draws, 1);
  assert.equal(counts.matches, 2);
});

test('countResults ignora partidas que no son competitivas', () => {
  const counts = countResults([
    match({ id: '1', result: 'victory' }),
    match({ id: '2', result: 'defeat', queue: 'unrated' }),
    match({ id: '3', result: 'defeat', queue: 'other' }),
  ]);

  assert.deepEqual(counts, { wins: 1, losses: 0, draws: 0, matches: 1 });
});

test('currentRankTier toma el rango de la partida competitiva mas reciente', () => {
  const tier = currentRankTier([
    match({ id: 'vieja', result: 'victory', tier: 10, at: 1_000 }),
    match({ id: 'nueva', result: 'defeat', tier: 15, at: 3_000 }),
    match({ id: 'media', result: 'draw', tier: 12, at: 2_000 }),
  ]);

  assert.equal(tier, 15);
});

test('currentRankTier es 0 (Unranked) sin partidas con rango', () => {
  assert.equal(currentRankTier([match({ id: '1', result: 'victory' })]), 0);
  assert.equal(currentRankTier([]), 0);
});

test('buildOverlayInfo arma el payload que consume el overlay', () => {
  const info = buildOverlayInfo(
    [
      match({ id: '1', result: 'victory', tier: 15, at: 1_000 }),
      match({ id: '2', result: 'draw', tier: 15, at: 2_000 }),
    ],
    { riotId: 'LaLisa Hushoban', riotTag: 'KPOP' },
  );

  assert.equal(info.rankTier, 15);
  assert.equal(info.rankName, 'Platino 3');
  assert.equal(info.rankIcon, '/ranks/15.png');
  assert.equal(info.wins, 1);
  assert.equal(info.draws, 1);
  assert.equal(info.losses, 0);
  assert.equal(info.lastMatchAt, 2_000);
});
