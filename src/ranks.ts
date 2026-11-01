// Escala interna de rangos: 0 = Unranked, 1 = Iron 1 ... 25 = Radiant.
// Se usa esta numeracion (y no la de la API publica, que va 3..27) porque es la
// que devuelve tracker.gg en metadata.tierName.

export const RANK_TIERS: Record<number, string> = {
  0: 'Unranked',
  1: 'Iron 1',
  2: 'Iron 2',
  3: 'Iron 3',
  4: 'Bronze 1',
  5: 'Bronze 2',
  6: 'Bronze 3',
  7: 'Silver 1',
  8: 'Silver 2',
  9: 'Silver 3',
  10: 'Gold 1',
  11: 'Gold 2',
  12: 'Gold 3',
  13: 'Platinum 1',
  14: 'Platinum 2',
  15: 'Platinum 3',
  16: 'Diamond 1',
  17: 'Diamond 2',
  18: 'Diamond 3',
  19: 'Ascendant 1',
  20: 'Ascendant 2',
  21: 'Ascendant 3',
  22: 'Immortal 1',
  23: 'Immortal 2',
  24: 'Immortal 3',
  25: 'Radiant',
};

/** Nombre legible del tier. */
export function rankName(tier: number): string {
  return RANK_TIERS[tier] ?? RANK_TIERS[0]!;
}

/** Ruta del icono empaquetado en public/ranks. null si el tier no existe. */
export function rankIcon(tier: number): string | null {
  if (!(tier in RANK_TIERS)) return null;
  return `/ranks/${tier}.png`;
}
