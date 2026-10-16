import { test } from 'node:test';
import assert from 'node:assert/strict';
import safeJob from '../jobs/safeJob.js';
import jobState from '../jobs/jobState.js';

// Collects what the logger writes to stderr while `fn` runs.
async function stderrOf(fn) {
  const lines = [];
  const write = process.stderr.write;
  process.stderr.write = (chunk) => {
    lines.push(String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stderr.write = write;
  }
  return lines;
}

test('a job that throws is logged, and the next run goes ahead', async () => {
  let calls = 0;
  const run = safeJob('flaky-sync', () => {
    calls++;
    if (calls === 1) throw new Error('database is locked');
  });
  const logged = await stderrOf(() => run());
  assert.equal(logged.length, 1);
  assert.match(logged[0], /ERROR \[jobs\] The flaky-sync job failed\.\nError: database is locked/);
  assert.ok(jobState.report()['flaky-sync'].lastFailure);
  assert.equal(jobState.report()['flaky-sync'].lastSuccess, null);

  await run();
  assert.equal(calls, 2);
  assert.ok(jobState.report()['flaky-sync'].lastSuccess);
});

test('a rejected promise is caught the same way, and runs never overlap', async () => {
  let release;
  let calls = 0;
  const run = safeJob('flaky-async', () => {
    calls++;
    return new Promise((resolve, reject) => {
      release = () => reject(Object.assign(new Error('disk is full'), { code: 'SQLITE_FULL' }));
    });
  });
  const logged = await stderrOf(async () => {
    const first = run();
    // due again while the first is still waiting on its node: skipped, not stacked
    assert.equal(run(), first);
    assert.equal(calls, 1);
    release();
    await first;
    await jobState.idle();
  });
  assert.equal(logged.length, 1);
  assert.match(logged[0], /The flaky-async job failed\.\nError: disk is full/);
  assert.ok(jobState.report()['flaky-async'].lastFailure);
});

test('a job that keeps failing is logged once per window, not once per run', async () => {
  const run = safeJob('always-broken', () => {
    throw new Error('node unreachable');
  });
  const logged = await stderrOf(async () => {
    for (let i = 0; i < 20; i++) await run();
  });
  assert.equal(logged.length, 1);
});

test('the shutdown signal reaches the job', async () => {
  const stopping = new AbortController();
  let seen;
  const run = safeJob('sees-signal', (signal) => {
    seen = signal;
  }, { signal: stopping.signal });
  await run();
  stopping.abort();
  assert.equal(seen.aborted, true);
});
