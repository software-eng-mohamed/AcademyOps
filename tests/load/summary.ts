import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import type { LoadConfiguration } from './config.js';
import { FIXTURE_MARKER } from './config.js';
import { SUMMARY_MARKER, type LoadSuite, type LoadSummary } from './gates.js';

export function percentile(samples: readonly number[], percentileValue: number): number | null {
  if (!samples.length) return null;
  const sorted = [...samples].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

export function resultPath(config: LoadConfiguration, suite: LoadSuite): string {
  return resolve(
    process.cwd(),
    `test-results/load/results/${suite}-${config.profileName}-r${config.runnerIndex}.json`,
  );
}

export function writeSummary(
  config: LoadConfiguration,
  suite: LoadSuite,
  passed: boolean,
  metrics: Record<string, number | null>,
): LoadSummary {
  const summary: LoadSummary = {
    marker: SUMMARY_MARKER,
    fixtureMarker: FIXTURE_MARKER,
    revision: config.revision,
    generatedAt: new Date().toISOString(),
    suite,
    profile: config.profileName,
    globalUsers: config.profile.users,
    localUsers: config.localUsers,
    targetOrigin: config.target.origin,
    runner: { index: config.runnerIndex, count: config.runnerCount },
    passed,
    metrics,
  };
  const path = resultPath(config, suite);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(summary, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return summary;
}
