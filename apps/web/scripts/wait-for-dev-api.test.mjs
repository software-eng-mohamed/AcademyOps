import assert from 'node:assert/strict';
import { test } from 'node:test';
import { waitForDevApi } from './wait-for-dev-api.mjs';

const url = new URL('http://localhost:3001/api/v1/health/ready');

function harness(fetchImpl, overrides = {}) {
  let clock = 0;
  const logs = [];
  const warnings = [];
  return {
    logs,
    warnings,
    options: {
      timeoutMs: 180_000,
      pollIntervalMs: 1_000,
      fetchImpl,
      now: () => clock,
      sleep: async (ms) => { clock += ms; },
      log: (message) => logs.push(message),
      warn: (message) => warnings.push(message),
      ...overrides,
    },
  };
}

test('starts immediately when the API is ready and releases its response body', async () => {
  let cancelled = false;
  const h = harness(async (target, options) => {
    assert.equal(target, url);
    assert.equal(options.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    return { ok: true, body: { cancel: async () => { cancelled = true; } } };
  });
  assert.equal(await waitForDevApi(url, h.options), true);
  assert.equal(cancelled, true);
  assert.equal(h.warnings.length, 0);
});

test('recovers from connection refusal and HTTP 503 during cold startup', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed');
    return { ok: calls === 3, status: 503 };
  });
  assert.equal(await waitForDevApi(url, h.options), true);
  assert.equal(calls, 3);
  assert.equal(h.warnings.length, 0);
});

test('a three-minute API timeout warns instead of rejecting and killing the workspace', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  });
  assert.equal(await waitForDevApi(url, h.options), false);
  assert.equal(calls, 180);
  assert.equal(h.warnings.length, 1);
  assert.match(h.warnings[0], /Starting Next.js without stopping the API or worker/);
  assert.ok(h.logs.some((line) => line.includes('API still starting (15s;')));
  assert.ok(!h.logs.some((line) => line.includes('API is ready')));
});

test('reports non-success status and does not poll past the grace period', async () => {
  let calls = 0;
  const h = harness(async () => { calls += 1; return { ok: false, status: 429 }; }, { timeoutMs: 1_500 });
  assert.equal(await waitForDevApi(url, h.options), false);
  assert.equal(calls, 2);
  assert.match(h.warnings[0], /HTTP 429/);
});

test('an unresponsive API request is aborted within the remaining grace period', async () => {
  let aborted = false;
  const h = harness(async (_url, { signal }) => new Promise((_resolve, reject) => {
    const keepAlive = setTimeout(() => reject(new Error('probe was not aborted')), 1_000);
    signal.addEventListener('abort', () => {
      clearTimeout(keepAlive);
      aborted = true;
      reject(signal.reason);
    }, { once: true });
  }), { timeoutMs: 20, now: Date.now, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) });
  assert.equal(await waitForDevApi(url, h.options), false);
  assert.equal(aborted, true);
  assert.match(h.warnings[0], /request timed out/);
});
