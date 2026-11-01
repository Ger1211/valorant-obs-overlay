// Escala interna de rangos: 0 = Unranked, 1 = Iron 1 ... 25 = Radiant.
// Se usa esta numeracion (y no la de la API publica, que va 3..27) porque es la
// que devuelve tracker.gg en metadata.tierName.

export const RANK_TIERS: Record<number, string> = {
  0: 'Sin clasificar',
  1: 'Hierro 1',
  2: 'Hierro 2',
  3: 'Hierro 3',
  4: 'Bronce 1',
  5: 'Bronce 2',
  6: 'Bronce 3',
  7: 'Plata 1',
  8: 'Plata 2',
  9: 'Plata 3',
  10: 'Oro 1',
  11: 'Oro 2',
  12: 'Oro 3',
  13: 'Platino 1',
  14: 'Platino 2',
  15: 'Platino 3',
  16: 'Diamante 1',
  17: 'Diamante 2',
  18: 'Diamante 3',
  19: 'Ascendente 1',
  20: 'Ascendente 2',
  21: 'Ascendente 3',
  22: 'Inmortal 1',
  23: 'Inmortal 2',
  24: 'Inmortal 3',
  25: 'Radiante',
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
