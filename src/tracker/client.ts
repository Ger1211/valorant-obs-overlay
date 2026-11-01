import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TrackerMatchesResponse, TrackerProfileResponse } from './types.js';

// Cliente de la API interna de tracker.gg.
//
// Cloudflare detecta el fingerprint TLS de undici (fetch de Node) y del curl
// comun, y responde 403. Por eso se usa un binario curl con fingerprint de
// navegador: curl.exe en Windows o curl-impersonate (curl_chrome136) en Linux,
// sobreescribible con TRACKER_CURL_BIN.
//
// Advertencia: endpoint no oficial y fragil; puede bloquearse o cambiar.

const execFileP = promisify(execFile);

const BASE = 'https://api.tracker.gg/api/v2/valorant/standard';
// Cloudflare no solo mira el TLS: con pocos headers devuelve 403 aunque el
// fingerprint sea de navegador. Este set es el que manda un XHR real a tracker.gg.
const REQUEST_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
  Referer: 'https://tracker.gg/',
  Origin: 'https://tracker.gg',
};

/** Cloudflare bloqueo la peticion (403/429/503) o el perfil es privado. */
export class TrackerBlockedError extends Error {
  constructor(readonly status: number) {
    super(
      `Tracker.gg bloqueo la peticion (HTTP ${status}). Puede ser anti-bot temporal o que la cuenta tenga las stats privadas.`,
    );
    this.name = 'TrackerBlockedError';
  }
}

/** El perfil no existe en tracker.gg. */
export class TrackerProfileNotFoundError extends Error {
  constructor() {
    super('Perfil no encontrado en tracker.gg. Verifica el Riot ID y que las stats sean publicas.');
    this.name = 'TrackerProfileNotFoundError';
  }
}

export interface TrackerClientOptions {
  curlBin?: string;
  /** Separacion minima entre requests para no disparar el anti-bot. */
  minGapMs?: number;
  /** Timeout por request. */
  timeoutMs?: number;
}

function defaultCurlBin(): string {
  const override = process.env.TRACKER_CURL_BIN;
  if (override) return override;
  if (process.platform === 'win32') return 'curl.exe';
  return 'curl_chrome136';
}

/**
 * URL de partidas competitivas.
 *
 * `forceCollect=true` NO es opcional: sin ese parametro tracker.gg devuelve una
 * copia cacheada y las partidas nuevas no aparecen (comprobado: 5 vs 6 partidas
 * para la misma cuenta). El endpoint de perfil usa el mismo truco.
 */
export function matchesUrl(
  base: string,
  riotId: string,
  riotTag: string,
  next?: string,
): string {
  const user = `${encodeURIComponent(riotId)}%23${encodeURIComponent(riotTag)}`;
  const params = new URLSearchParams({
    playlist: 'competitive',
    type: 'competitive',
    forceCollect: 'true',
  });
  if (next) params.set('next', next);
  return `${base}/matches/riot/${user}?${params.toString()}`;
}

export class TrackerClient {
  private lastRequest = 0;
  private readonly curlBin: string;
  private readonly minGapMs: number;
  private readonly timeoutMs: number;

  constructor(options: TrackerClientOptions = {}) {
    this.curlBin = options.curlBin ?? defaultCurlBin();
    this.minGapMs = options.minGapMs ?? 1300;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async rateLimit(): Promise<void> {
    const wait = Math.max(0, this.minGapMs - (Date.now() - this.lastRequest));
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    this.lastRequest = Date.now();
  }

  private async get<T>(url: string): Promise<T> {
    await this.rateLimit();
    const maxTime = String(Math.max(1, Math.round(this.timeoutMs / 1000)));

    let stdout: string;
    try {
      const headerArgs = Object.entries(REQUEST_HEADERS).flatMap(([name, value]) => ['-H', `${name}: ${value}`]);

      const result = await execFileP(
        this.curlBin,
        [
          '-s',
          '--max-time',
          maxTime,
          '-o',
          '-',
          '-w',
          '%{http_code}',
          ...headerArgs,
          '--compressed',
          url,
        ],
        { maxBuffer: 32 * 1024 * 1024 },
      );
      stdout = result.stdout;
    } catch (error) {
      const message = (error as Error).message ?? '';
      if (message.includes('ENOENT')) {
        throw new Error(
          `No se encontro el binario curl "${this.curlBin}". En Windows usar curl.exe; en Linux instalar curl-impersonate o setear TRACKER_CURL_BIN.`,
        );
      }
      throw error;
    }

    const status = Number(stdout.slice(-3));
    const body = stdout.slice(0, -3);

    if (status === 403 || status === 429 || status === 503) throw new TrackerBlockedError(status);
    if (status === 404) throw new TrackerProfileNotFoundError();
    if (status !== 200) throw new Error(`Tracker.gg respondio ${status}`);
    if (!body.trim()) throw new Error('Tracker.gg respondio un cuerpo vacio');

    return JSON.parse(body) as T;
  }

  private userPath(riotId: string, riotTag: string): string {
    return `${encodeURIComponent(riotId)}%23${encodeURIComponent(riotTag)}`;
  }

  /** Perfil con metadata de la cuenta (no se usa para el overlay, sirve de diagnostico). */
  async getProfile(riotId: string, riotTag: string): Promise<TrackerProfileResponse> {
    return this.get<TrackerProfileResponse>(`${BASE}/profile/riot/${this.userPath(riotId, riotTag)}`);
  }

  /** Partidas competitivas, paginadas con cursor. */
  async getMatches(
    riotId: string,
    riotTag: string,
    next?: string,
  ): Promise<TrackerMatchesResponse> {
    return this.get<TrackerMatchesResponse>(matchesUrl(BASE, riotId, riotTag, next));
  }
}
