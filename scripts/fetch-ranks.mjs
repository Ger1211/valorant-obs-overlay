// Descarga los iconos de rango a public/ranks/<tier>.png
// Escala interna: 0 = Unranked, 1 = Iron 1 ... 25 = Radiant.
//
// OJO: la API publica numera los tiers 3..27 (IRON 1 = 3, RADIANT = 27), asi que
// el mapeo se hace SIEMPRE por nombre (tierName) y nunca por numero.
//
// Uso: npm run fetch-ranks

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ranks');
const API = 'https://valorant-api.com/v1/competitivetiers';

const TIER_BY_NAME = new Map([
  ['unranked', 0],
  ['iron 1', 1],
  ['iron 2', 2],
  ['iron 3', 3],
  ['bronze 1', 4],
  ['bronze 2', 5],
  ['bronze 3', 6],
  ['silver 1', 7],
  ['silver 2', 8],
  ['silver 3', 9],
  ['gold 1', 10],
  ['gold 2', 11],
  ['gold 3', 12],
  ['platinum 1', 13],
  ['platinum 2', 14],
  ['platinum 3', 15],
  ['diamond 1', 16],
  ['diamond 2', 17],
  ['diamond 3', 18],
  ['ascendant 1', 19],
  ['ascendant 2', 20],
  ['ascendant 3', 21],
  ['immortal 1', 22],
  ['immortal 2', 23],
  ['immortal 3', 24],
  ['radiant', 25],
]);

const normalize = (name) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

async function main() {
  console.log(`Consultando ${API}`);
  const response = await fetch(API);
  if (!response.ok) throw new Error(`valorant-api respondio ${response.status}`);

  const payload = await response.json();
  const sets = Array.isArray(payload?.data) ? payload.data : [];

  let best = null;
  for (const set of sets) {
    const icons = new Map();
    for (const tier of Array.isArray(set?.tiers) ? set.tiers : []) {
      const internal = TIER_BY_NAME.get(normalize(tier?.tierName));
      if (internal !== undefined && tier?.largeIcon) icons.set(internal, tier.largeIcon);
    }
    if (!best || icons.size > best.icons.size) best = { set, icons };
  }

  if (!best || best.icons.size === 0) throw new Error('Ningun set de rangos usable en la respuesta');

  await fs.mkdir(OUT_DIR, { recursive: true });

  const missing = [];
  for (const [tier, url] of [...best.icons.entries()].sort((a, b) => a[0] - b[0])) {
    const image = await fetch(url);
    if (!image.ok) {
      missing.push(tier);
      continue;
    }
    const buffer = Buffer.from(await image.arrayBuffer());
    await fs.writeFile(path.join(OUT_DIR, `${tier}.png`), buffer);
    console.log(`tier ${String(tier).padStart(2, ' ')} · ${path.basename(url).padEnd(14)} · ${(buffer.length / 1024).toFixed(1)} KB`);
  }

  console.log(`\n${best.icons.size} iconos en ${OUT_DIR}`);
  if (missing.length) console.warn(`Sin descargar: ${missing.join(', ')}`);
  if (best.icons.size < TIER_BY_NAME.size) {
    console.warn(`Aviso: el set cubre ${best.icons.size}/${TIER_BY_NAME.size} tiers (faltan iconos para algun tier).`);
  }
}

main().catch((error) => {
  console.error(`Error: ${error?.message ?? error}`);
  process.exit(1);
});
