import fs from 'node:fs';
import path from 'node:path';
import type { CompetitiveMatch } from './types.js';

export interface UpsertSummary {
  added: number;
  updated: number;
}

/**
 * Persistencia simple en un JSON. Sin migraciones ni formato heredado: el
 * archivo se puede borrar y regenerar con una ingesta completa desde tracker.gg.
 * La escritura es atomica (tmp + rename) para que un corte no deje datos a medias.
 */
export class MatchStore {
  private readonly matches = new Map<string, CompetitiveMatch>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {
    this.load();
  }

  get path(): string {
    return this.filePath;
  }

  private load(): void {
    if (!fs.existsSync(this.filePath)) return;

    const raw = fs.readFileSync(this.filePath, 'utf8').trim();
    if (!raw) return;

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error(`El archivo de datos no contiene una lista de partidas: ${this.filePath}`);
    }

    for (const item of parsed as CompetitiveMatch[]) {
      if (item?.matchId) this.matches.set(item.matchId, item);
    }
  }

  has(matchId: string): boolean {
    return this.matches.has(matchId);
  }

  get(matchId: string): CompetitiveMatch | undefined {
    return this.matches.get(matchId);
  }

  /** Partidas ordenadas de la mas nueva a la mas vieja. */
  list(): CompetitiveMatch[] {
    return [...this.matches.values()].sort((a, b) => b.gameStartTime - a.gameStartTime);
  }

  upsertMany(matches: CompetitiveMatch[]): UpsertSummary {
    let added = 0;
    let updated = 0;

    for (const match of matches) {
      if (this.matches.has(match.matchId)) updated++;
      else added++;
      this.matches.set(match.matchId, match);
    }

    return { added, updated };
  }

  /** Escribe el archivo completo. Serializado: dos llamadas nunca se pisan. */
  flush(): Promise<void> {
    const snapshot = this.list();

    this.writeChain = this.writeChain.then(() => {
      const dir = path.dirname(this.filePath);
      fs.mkdirSync(dir, { recursive: true });

      const tmp = `${this.filePath}.tmp`;
      fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, this.filePath);
    });

    return this.writeChain;
  }
}
