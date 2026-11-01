import { TrackerBlockedError } from './tracker/client.js';

/** Espera tras cada fallo consecutivo (el intervalo normal es el primer valor). */
export const BLOCKED_DELAYS_MS = [60_000, 300_000] as const;

export interface SchedulerOptions {
  /** Intervalo normal entre ciclos. 0 desactiva el scheduler. */
  intervalMs: number;
  run: () => Promise<void>;
  now?: () => number;
  /** Fuente de aleatoriedad 0..1 para el jitter. */
  random?: () => number;
  onError?: (error: unknown) => void;
}

export type TickOutcome = 'ran' | 'skipped-in-flight' | 'skipped-not-due';

export interface SchedulerStatus {
  enabled: boolean;
  intervalMs: number;
  nextRunAt: number;
  lastSuccessAt: number | null;
  lastError: string | null;
  failureStreak: number;
}

/**
 * Dispara la ingesta cada `intervalMs`. Vive en el proceso del server (no en la
 * pagina del overlay) para que OBS pueda suspender el Browser Source sin que se
 * congelen los datos. Nunca solapa dos ingestas y aplica backoff ante bloqueos.
 */
export class IngestScheduler {
  private readonly now: () => number;
  private readonly random: () => number;

  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;
  private failureStreak = 0;
  private nextRunAt = 0;
  private lastSuccessAt: number | null = null;
  private lastError: string | null = null;

  constructor(private readonly options: SchedulerOptions) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? Math.random;
  }

  get enabled(): boolean {
    return this.options.intervalMs > 0;
  }

  status(): SchedulerStatus {
    return {
      enabled: this.enabled,
      intervalMs: this.options.intervalMs,
      nextRunAt: this.nextRunAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      failureStreak: this.failureStreak,
    };
  }

  /** Espera hasta el proximo ciclo, con jitter de +-20%. */
  delayMs(): number {
    const base =
      this.failureStreak === 0
        ? this.options.intervalMs
        : (BLOCKED_DELAYS_MS[Math.min(this.failureStreak - 1, BLOCKED_DELAYS_MS.length - 1)] ?? 300_000);

    const jitter = 0.8 + this.random() * 0.4;
    return Math.max(0, Math.round(base * jitter));
  }

  async tick(): Promise<TickOutcome> {
    if (!this.enabled) return 'skipped-not-due';
    if (this.inFlight) return 'skipped-in-flight';
    if (this.now() < this.nextRunAt) return 'skipped-not-due';

    this.inFlight = true;
    try {
      await this.options.run();
      this.failureStreak = 0;
      this.lastSuccessAt = this.now();
      this.lastError = null;
    } catch (error) {
      this.failureStreak++;
      this.lastError = describeError(error);
      this.options.onError?.(error);
    } finally {
      this.inFlight = false;
      this.nextRunAt = this.now() + this.delayMs();
    }

    return 'ran';
  }

  start(): void {
    if (!this.enabled || this.timer) return;

    const loop = async (): Promise<void> => {
      await this.tick();
      this.timer = setTimeout(() => void loop(), Math.max(0, this.nextRunAt - this.now()));
    };

    this.nextRunAt = 0;
    this.timer = setTimeout(() => void loop(), 0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

function describeError(error: unknown): string {
  if (error instanceof TrackerBlockedError) return `TRACKER_BLOCKED:${error.status}`;
  return (error as Error)?.message ?? 'ERROR_DESCONOCIDO';
}
