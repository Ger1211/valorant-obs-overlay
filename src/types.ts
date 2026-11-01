// Modelo de dominio. Se guardan solo partidas competitivas.

export type QueueType = 'competitive' | 'unrated' | 'other';

/**
 * Resultado explicito de una partida. 'unknown' existe para no mentir con datos
 * que tracker.gg devuelva con un valor inesperado: esas partidas se guardan pero
 * no suman a ninguno de los tres contadores.
 */
export type MatchResult = 'victory' | 'defeat' | 'draw' | 'unknown';

export interface CompetitiveMatch {
  matchId: string;
  gameStartTime: number;
  queue: QueueType;
  mapName: string;
  agentName: string;
  result: MatchResult;
  roundsWon: number;
  roundsLost: number;
  /** Tier interno 1..25 (0 = Unranked). */
  rankTier?: number;
  ingestedAt: number;
}

export interface ResultCounts {
  wins: number;
  losses: number;
  draws: number;
  /** Total de partidas competitivas contabilizadas (incluye resultados 'unknown'). */
  matches: number;
}

export interface OverlayInfo extends ResultCounts {
  riotId: string;
  riotTag: string;
  rankTier: number;
  rankName: string;
  rankIcon: string | null;
  lastMatchAt: number | null;
}
