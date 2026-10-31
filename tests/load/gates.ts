import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURE_MARKER, LOAD_MARKER, PROFILES, type LoadConfiguration } from './config.js';

export const SUMMARY_MARKER = 'plg-synthetic-load-summary-v1';
export const GATE_MARKER = 'plg-synthetic-load-gate-v1';
export type LoadSuite = 'http' | 'realtime';

export interface LoadSummary {
  marker: string;
  fixtureMarker: string;
  revision: string;
  generatedAt: string;
  suite: LoadSuite;
  profile: string;
  globalUsers: number;
  localUsers: number;
  targetOrigin: string;
  runner: { index: number; count: number };
  passed: boolean;
  metrics: Record<string, number | null>;
}

export interface LoadGate {
  marker: string;
  fixtureMarker: string;
  revision: string;
  generatedAt: string;
  targetOrigin: string;
  profile: string;
  runnerCount: number;
  passed: boolean;
  suites: Record<LoadSuite, { runners: number; passed: boolean }>;
}

export function previousProfile(profile: string): string | null {
  const names = Object.keys(PROFILES);
  const index = names.indexOf(profile);
  if (index < 0) throw new Error(`Unknown profile ${profile}.`);
  return index === 0 ? null : names[index - 1]!;
}

export function assertPreviousGate(
  environment: NodeJS.ProcessEnv,
  config: LoadConfiguration,
): void {
  const expected = previousProfile(config.profileName);
  if (!expected) return;
  const path = environment.E2E_LOAD_PREVIOUS_GATE?.trim();
  if (!path) throw new Error(`Profile ${config.profileName} requires a passing ${expected} gate.`);
  const gate = JSON.parse(readFileSync(resolve(path), 'utf8')) as LoadGate;
  const maxAgeMinutes = Number(environment.E2E_LOAD_GATE_MAX_AGE_MINUTES || '360');
  if (!Number.isFinite(maxAgeMinutes) || maxAgeMinutes < 1 || maxAgeMinutes > 1_440) {
    throw new Error('E2E_LOAD_GATE_MAX_AGE_MINUTES must be from 1 through 1440.');
  }
  const ageMs = Date.now() - Date.parse(gate.generatedAt);
  if (
    gate.marker !== GATE_MARKER ||
    gate.fixtureMarker !== FIXTURE_MARKER ||
    gate.revision !== config.revision ||
    !Number.isFinite(ageMs) ||
    ageMs < 0 ||
    ageMs > maxAgeMinutes * 60_000 ||
    gate.targetOrigin !== config.target.origin ||
    gate.profile !== expected ||
    gate.passed !== true ||
    gate.suites?.http?.passed !== true ||
    gate.suites.realtime?.passed !== true
  ) {
    throw new Error('Previous gate is missing, failed, or belongs to another target/profile.');
  }
}

export function parseSummary(raw: string): LoadSummary {
  const value = JSON.parse(raw) as LoadSummary;
  if (
    value.marker !== SUMMARY_MARKER ||
    value.fixtureMarker !== FIXTURE_MARKER ||
    !/^(?:local-worktree|[a-f0-9]{7,64})$/i.test(value.revision) ||
    !Number.isFinite(Date.parse(value.generatedAt)) ||
    !['http', 'realtime'].includes(value.suite) ||
    !PROFILES[value.profile] ||
    value.globalUsers !== PROFILES[value.profile]?.users ||
    value.targetOrigin !== new URL(value.targetOrigin).origin ||
    !Number.isInteger(value.runner?.index) ||
    !Number.isInteger(value.runner.count) ||
    value.runner.index < 0 ||
    value.runner.index >= value.runner.count ||
    typeof value.passed !== 'boolean'
  ) {
    throw new Error('Load summary contract is invalid.');
  }
  return value;
}

export function aggregateGate(summaries: LoadSummary[]): LoadGate {
  if (!summaries.length) throw new Error('At least one summary is required.');
  const first = summaries[0]!;
  const runnerCount = first.runner.count;
  for (const item of summaries) {
    const summaryAgeMs = Date.now() - Date.parse(item.generatedAt);
    if (
      item.profile !== first.profile ||
      item.targetOrigin !== first.targetOrigin ||
      item.revision !== first.revision ||
      item.runner.count !== runnerCount ||
      !Number.isFinite(summaryAgeMs) ||
      summaryAgeMs < 0 ||
      summaryAgeMs > 6 * 60 * 60 * 1_000
    ) {
      throw new Error('Summaries from different runs cannot share a gate.');
    }
  }
  const suiteResult = (suite: LoadSuite) => {
    const found = summaries.filter((item) => item.suite === suite);
    const runners = new Set(found.map((item) => item.runner.index));
    return {
      runners: runners.size,
      passed:
        found.length === runnerCount &&
        runners.size === runnerCount &&
        found.every((item) => item.passed),
    };
  };
  const suites = { http: suiteResult('http'), realtime: suiteResult('realtime') };
  return {
    marker: GATE_MARKER,
    fixtureMarker: FIXTURE_MARKER,
    revision: first.revision,
    generatedAt: new Date().toISOString(),
    targetOrigin: first.targetOrigin,
    profile: first.profile,
    runnerCount,
    passed: suites.http.passed && suites.realtime.passed,
    suites,
  };
}

export function expectedArtifactMarker(): string {
  return LOAD_MARKER;
}
