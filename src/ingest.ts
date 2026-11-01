import type { TrackerMatch } from './tracker/types.js';
import type { MatchResult, CompetitiveMatch, QueueType } from './types.js';
import type { MatchStore } from './store.js';

export type IngestMode = 'incremental' | 'full';

export interface IngestDeps {
  /** Se inyecta para poder testear sin red. */
  client: { getMatches(riotId: string, riotTag: string, next?: string): Promise<{ data?: { matches?: TrackerMatch[]; metadata?: { next?: string } } }> };
  store: MatchStore;
  riotId: string;
  riotTag: string;
}

export interface IngestOptions {
  /**
   * incremental: avanza mientras las paginas vengan enteras de partidas nuevas
   * y corta en la primera ya guardada. full: recorre todo el historial para
   * renormalizar lo existente.
   */
  mode?: IngestMode;
  /** Tope de seguridad de paginas (tracker.gg devuelve ~5 partidas por pagina). */
  maxPages?: number;
}

export interface IngestResult {
  fetched: number;
  added: number;
  updated: number;
  skipped: number;
  pages: number;
  stoppedAtKnown: boolean;
}

const RANK_BY_NAME: Record<string, number> = {
  unranked: 0,
  'iron 1': 1,
  'iron 2': 2,
  'iron 3': 3,
  'bronze 1': 4,
  'bronze 2': 5,
  'bronze 3': 6,
  'silver 1': 7,
  'silver 2': 8,
  'silver 3': 9,
  'gold 1': 10,
  'gold 2': 11,
  'gold 3': 12,
  'platinum 1': 13,
  'platinum 2': 14,
  'platinum 3': 15,
  'diamond 1': 16,
  'diamond 2': 17,
  'diamond 3': 18,
  'ascendant 1': 19,
  'ascendant 2': 20,
  'ascendant 3': 21,
  'immortal 1': 22,
  'immortal 2': 23,
  'immortal 3': 24,
  radiant: 25,
};

/** Traduce el nombre del tier ("Platinum 3") a la escala interna 1..25. */
export function rankTierFromName(tierName: string | undefined): number | undefined {
  if (!tierName) return undefined;
  const key = tierName.trim().toLowerCase().replace(/\s+/g, ' ');
  return RANK_BY_NAME[key];
}

/**
 * Traduce metadata.result de tracker.gg. Cualquier valor que no sea victoria,
 * derrota o empate queda como 'unknown' para no contaminar los contadores.
 */
export function parseResult(raw: string | undefined): MatchResult {
  const value = (raw ?? '').trim().toLowerCase();
  if (value === 'victory' || value === 'win') return 'victory';
  if (value === 'defeat' || value === 'loss') return 'defeat';
  if (value === 'draw' || value === 'tie') return 'draw';
  return 'unknown';
}

function queueFromMode(modeName: string | undefined): QueueType {
  const mode = (modeName ?? '').toLowerCase();
  if (mode.includes('competitive')) return 'competitive';
  if (mode.includes('unrated')) return 'unrated';
  return 'other';
}

function statValue(match: TrackerMatch, key: string): number {
  const segment = match.segments?.find((s) => s.type === 'overview');
  const stat = segment?.stats?.[key];
  return typeof stat?.value === 'number' ? stat.value : 0;
}

function rankTierFromMatch(match: TrackerMatch): number | undefined {
  const segment = match.segments?.find((s) => s.type === 'overview');
  const tierName = segment?.stats?.['rank']?.metadata?.['tierName'];
  return typeof tierName === 'string' ? rankTierFromName(tierName) : undefined;
}

function agentNameFromMatch(match: TrackerMatch): string {
  const segment = match.segments?.find((s) => s.type === 'overview');
  const agent = segment?.metadata?.['agentName'];
  return typeof agent === 'string' ? agent : '';
}

function timestampFromMatch(match: TrackerMatch): number {
  const raw = match.metadata?.timestamp;
  if (!raw) return Date.now();
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? Date.now() : parsed;
}

/** Normaliza una partida de tracker.gg. Devuelve null si no tiene id. */
export function normalizeMatch(raw: TrackerMatch): CompetitiveMatch | null {
  const matchId = raw.attributes?.id;
  if (!matchId) return null;

  return {
    matchId,
    gameStartTime: timestampFromMatch(raw),
    queue: queueFromMode(raw.metadata?.modeName),
    mapName: raw.metadata?.mapName ?? raw.attributes?.mapId ?? 'Desconocido',
    agentName: agentNameFromMatch(raw),
    result: parseResult(raw.metadata?.result),
    roundsWon: statValue(raw, 'roundsWon'),
    roundsLost: statValue(raw, 'roundsLost'),
    rankTier: rankTierFromMatch(raw),
    ingestedAt: Date.now(),
  };
}

/**
 * Ingesta de partidas competitivas.
 *
 * tracker.gg devuelve ~5 partidas por pagina y exige pedir `next` para seguir.
 * - incremental (lo que corre cada 20 s): avanza pagina por pagina MIENTRAS
 *   todas vengan siendo nuevas, y corta en la primera partida ya guardada. Asi
 *   un burst de partidas entre dos ciclos no deja huecos, y en el caso normal
 *   (todo conocido en la pagina 1) cuesta un solo request.
 * - full (?force=1): recorre el historial completo hasta que no haya `next`.
 */
export async function ingest(deps: IngestDeps, options: IngestOptions = {}): Promise<IngestResult> {
  const mode: IngestMode = options.mode ?? 'incremental';
  const maxPages = options.maxPages ?? (mode === 'incremental' ? 10 : 50);

  let next: string | undefined;
  let pages = 0;
  let fetched = 0;
  let skipped = 0;
  let stoppedAtKnown = false;
  const collected: CompetitiveMatch[] = [];

  do {
    const page = await deps.client.getMatches(deps.riotId, deps.riotTag, next);
    pages++;

    let foundKnown = false;

    for (const raw of page.data?.matches ?? []) {
      fetched++;
      const match = normalizeMatch(raw);

      if (!match) {
        skipped++;
        continue;
      }
      if (match.queue !== 'competitive') {
        skipped++;
        continue;
      }
      if (deps.store.has(match.matchId)) {
        // En incremental, todo lo que sigue es mas viejo y ya esta guardado.
        // En full se sigue recorriendo para renormalizar lo existente.
        if (mode === 'incremental') {
          foundKnown = true;
          stoppedAtKnown = true;
          break;
        }
      }

      collected.push(match);
    }

    if (foundKnown) break;
    next = page.data?.metadata?.next;
  } while (next && pages < maxPages);

  const { added, updated } = deps.store.upsertMany(collected);
  await deps.store.flush();

  return { fetched, added, updated, skipped, pages, stoppedAtKnown };
}
