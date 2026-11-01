import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type { OverlayInfo } from './types.js';

export interface RateLimitOptions {
  windowMs: number;
  max: number;
}

export interface PublicAppOptions {
  getOverlay: () => OverlayInfo;
  /** Carpeta servida como estaticos. Solo debe incluir la pagina del overlay. */
  publicDir: string;
  /** Origen autorizado a leer la API (dominio de GitHub Pages). '*' por defecto. */
  publicOrigin?: string;
  rateLimit?: RateLimitOptions;
  /** Datos extra para /api/health. Nunca debe incluir detalles sensibles. */
  health?: () => Record<string, unknown>;
  now?: () => number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Listener publico: solo lectura. Nada de escritura, administracion ni archivos
 * fuera de `publicDir` es alcanzable desde aca.
 */
export function createPublicApp(options: PublicAppOptions): Express {
  const app = express();
  const now = options.now ?? Date.now;
  const limit = options.rateLimit ?? { windowMs: 60_000, max: 60 };
  const buckets = new Map<string, Bucket>();

  app.disable('x-powered-by');
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });

  app.use('/api', (req: Request, res: Response, next: NextFunction) => {
    const key = clientKey(req);
    const current = buckets.get(key);
    const timestamp = now();

    if (!current || current.resetAt <= timestamp) {
      buckets.set(key, { count: 1, resetAt: timestamp + limit.windowMs });
      next();
      return;
    }

    if (current.count >= limit.max) {
      res.status(429).json({ error: 'RATE_LIMITED' });
      return;
    }

    current.count++;
    next();
  });

  app.get('/api/overlay', (_req: Request, res: Response) => {
    res.setHeader('Access-Control-Allow-Origin', options.publicOrigin ?? '*');
    res.setHeader('Vary', 'Origin');
    res.setHeader('Cache-Control', 'no-store');
    res.json(options.getOverlay());
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ ok: true, ...(options.health?.() ?? {}) });
  });

  app.use(express.static(options.publicDir, { dotfiles: 'deny', index: 'index.html', extensions: false }));

  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: 'NOT_FOUND' });
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[publico] error inesperado:', (error as Error)?.message);
    // Sin stack ni rutas del disco en la respuesta.
    res.status(500).json({ error: 'INTERNAL' });
  });

  return app;
}

/**
 * Detras del tunel todos los requests llegan desde 127.0.0.1, asi que el limite
 * se agrupa por CF-Connecting-IP cuando existe.
 */
function clientKey(req: Request): string {
  const forwarded = req.header('cf-connecting-ip');
  if (forwarded) return forwarded;
  return req.ip ?? 'desconocido';
}
