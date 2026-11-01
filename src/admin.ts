import { timingSafeEqual } from 'node:crypto';
import express, { type Express, type Request, type Response } from 'express';
import { TrackerBlockedError, TrackerProfileNotFoundError } from './tracker/client.js';
import type { IngestMode, IngestResult } from './ingest.js';

export interface AdminAppOptions {
  /** Vacio = endpoint deshabilitado. */
  token: string;
  runIngest: (mode: IngestMode) => Promise<IngestResult>;
}

/**
 * Listener de administracion. Escucha en loopback y el tunel NO lo publica:
 * la escritura no es alcanzable desde internet ni con el token.
 */
export function createAdminApp(options: AdminAppOptions): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.post('/api/ingest', async (req: Request, res: Response) => {
    if (!options.token) {
      res.status(403).json({ error: 'ADMIN_DISABLED', message: 'Configura INGEST_TOKEN para habilitar la ingesta manual.' });
      return;
    }

    if (!tokenMatches(req.header('x-overlay-token'), options.token)) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return;
    }

    const mode: IngestMode = req.query.force === '1' ? 'full' : 'incremental';

    try {
      res.json(await options.runIngest(mode));
    } catch (error) {
      if (error instanceof TrackerBlockedError) {
        res.status(502).json({ error: 'TRACKER_BLOCKED', message: error.message });
        return;
      }
      if (error instanceof TrackerProfileNotFoundError) {
        res.status(404).json({ error: 'PROFILE_NOT_FOUND', message: error.message });
        return;
      }
      res.status(500).json({ error: 'INGEST_FAILED', message: (error as Error).message });
    }
  });

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  return app;
}

function tokenMatches(received: string | undefined, expected: string): boolean {
  if (!received) return false;

  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
