import { rankIcon, rankName } from './ranks.js';
import type { CompetitiveMatch, OverlayInfo, ResultCounts } from './types.js';

export interface OverlayProfile {
  riotId: string;
  riotTag: string;
}

/**
 * Cuenta victorias, derrotas y empates sobre todas las partidas competitivas
 * guardadas (sin ventana temporal). Los resultados 'unknown' suman a `matches`
 * pero no a ninguno de los tres contadores.
 */
export function countResults(matches: CompetitiveMatch[]): ResultCounts {
  const competitive = matches.filter((match) => match.queue === 'competitive');

  let wins = 0;
  let losses = 0;
  let draws = 0;

  for (const match of competitive) {
    if (match.result === 'victory') wins++;
    else if (match.result === 'defeat') losses++;
    else if (match.result === 'draw') draws++;
  }

  return { wins, losses, draws, matches: competitive.length };
}

/** Tier de la partida competitiva mas reciente que tenga rango conocido. */
export function currentRankTier(matches: CompetitiveMatch[]): number {
  const ranked = matches
    .filter((match) => match.queue === 'competitive' && typeof match.rankTier === 'number')
    .sort((a, b) => b.gameStartTime - a.gameStartTime);

  return ranked[0]?.rankTier ?? 0;
}

export function buildOverlayInfo(matches: CompetitiveMatch[], profile: OverlayProfile): OverlayInfo {
  const counts = countResults(matches);
  const tier = currentRankTier(matches);
  const latest = matches
    .filter((match) => match.queue === 'competitive')
    .sort((a, b) => b.gameStartTime - a.gameStartTime)[0];

  return {
    riotId: profile.riotId,
    riotTag: profile.riotTag,
    rankTier: tier,
    rankName: rankName(tier),
    rankIcon: rankIcon(tier),
    lastMatchAt: latest?.gameStartTime ?? null,
    ...counts,
  };
}
