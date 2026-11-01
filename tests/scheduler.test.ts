import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IngestScheduler } from '../src/scheduler.js';
import { TrackerBlockedError } from '../src/tracker/client.js';

/** Scheduler con reloj controlado y jitter neutro (random 0.5 => factor 1). */
function makeScheduler(options: { intervalMs?: number; run: () => Promise<void> }) {
  const clock = { now: 1_000_000 };
  const scheduler = new IngestScheduler({
    intervalMs: options.intervalMs ?? 20_000,
    run: options.run,
    now: () => clock.now,
    random: () => 0.5,
  });
  return { scheduler, clock };
}

test('tick corre la ingesta y respeta el intervalo', async () => {
  let runs = 0;
  const { scheduler, clock } = makeScheduler({
    run: async () => {
      runs++;
    },
  });

  assert.equal(await scheduler.tick(), 'ran');
  assert.equal(runs, 1);

  assert.equal(await scheduler.tick(), 'skipped-not-due');
  assert.equal(runs, 1);

  clock.now += 20_000;
  assert.equal(await scheduler.tick(), 'ran');
  assert.equal(runs, 2);
});

test('nunca solapa dos ingestas', async () => {
  let release: (() => void) | undefined;
  let runs = 0;

  const { scheduler, clock } = makeScheduler({
    run: async () => {
      runs++;
      await new Promise<void>((resolve) => {
        release = resolve;
      });
    },
  });

  const first = scheduler.tick();
  clock.now += 20_000;
  assert.equal(await scheduler.tick(), 'skipped-in-flight');
  assert.equal(runs, 1);

  release?.();
  assert.equal(await first, 'ran');
});

test('ante un bloqueo de tracker el siguiente intento se aleja', async () => {
  let runs = 0;
  const { scheduler, clock } = makeScheduler({
    run: async () => {
      runs++;
      throw new TrackerBlockedError(429);
    },
  });

  await scheduler.tick();
  assert.equal(runs, 1);
  assert.equal(scheduler.status().failureStreak, 1);
  assert.equal(scheduler.status().nextRunAt, clock.now + 120_000);
  assert.match(String(scheduler.status().lastError), /TRACKER_BLOCKED/);

  clock.now += 20_000;
  assert.equal(await scheduler.tick(), 'skipped-not-due', 'no reintenta a los 20 s');

  clock.now += 100_000;
  assert.equal(await scheduler.tick(), 'ran');
  assert.equal(scheduler.status().failureStreak, 2);
  assert.equal(scheduler.status().nextRunAt, clock.now + 600_000, 'segundo fallo: 10 minutos');
});

test('un ciclo exitoso limpia el backoff', async () => {
  let shouldFail = true;
  const { scheduler, clock } = makeScheduler({
    run: async () => {
      if (shouldFail) throw new TrackerBlockedError(403);
    },
  });

  await scheduler.tick();
  assert.equal(scheduler.status().failureStreak, 1);

  shouldFail = false;
  clock.now += 120_000;
  await scheduler.tick();

  assert.equal(scheduler.status().failureStreak, 0);
  assert.equal(scheduler.status().lastError, null);
  assert.equal(scheduler.status().nextRunAt, clock.now + 20_000);
});

test('intervalMs 0 deja el scheduler apagado', async () => {
  let runs = 0;
  const { scheduler } = makeScheduler({
    intervalMs: 0,
    run: async () => {
      runs++;
    },
  });

  scheduler.start();
  assert.equal(scheduler.enabled, false);
  assert.equal(await scheduler.tick(), 'skipped-not-due');
  assert.equal(runs, 0);
});
