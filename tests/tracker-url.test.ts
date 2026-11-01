import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchesUrl } from '../src/tracker/client.js';

const BASE = 'https://api.tracker.gg/api/v2/valorant/standard';

test('la URL de partidas pide forceCollect para evitar el cache de tracker.gg', () => {
  const url = matchesUrl(BASE, 'LaLisa Hushoban', 'KPOP');

  assert.match(url, /forceCollect=true/);
  assert.match(url, /playlist=competitive/);
  assert.match(url, /type=competitive/);
  assert.ok(url.startsWith(`${BASE}/matches/riot/`));
});

test('la URL de partidas codifica el Riot ID y el cursor', () => {
  const url = matchesUrl(BASE, 'LaLisa Hushoban', 'KPOP', 'cursor 1&x=2');

  assert.match(url, /LaLisa%20Hushoban%23KPOP/);
  assert.match(url, /next=cursor\+1%26x%3D2/);
});
