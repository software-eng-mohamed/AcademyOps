import assert from 'node:assert/strict';
import { recordedHttpTestRoutes } from './http-route-recorder';
import { releaseRouteInventory, type ReleaseRouteEvidence } from './phase5-route-evidence';

export const releaseScenarioNames = [
  'identity',
  'business',
  'domain',
  'finance',
  'paymob',
  'imports',
  'iam',
  'learning',
  'platform',
] as const;

export type ReleaseScenarioName = (typeof releaseScenarioNames)[number];

const paymobRouteKeys = new Set([
  'POST /api/v1/installments/{id}/paymob-checkout',
  'POST /api/v1/webhooks/paymob/transaction',
]);

export function releaseScenarioEvidence(scenario: ReleaseScenarioName): ReleaseRouteEvidence[] {
  const inventory = releaseRouteInventory();
  switch (scenario) {
    case 'identity':
      return inventory.filter(({ source }) => source === 'baseline-identity-platform');
    case 'business':
      return inventory.filter(({ source }) => source === 'business-chain');
    case 'domain':
      return inventory.filter(({ source }) => source === 'domain');
    case 'imports':
      return inventory.filter(({ source }) => source === 'imports');
    case 'iam':
      return inventory.filter(({ source }) => source === 'phase5-iam');
    case 'learning':
      return inventory.filter(({ source }) => source === 'phase5-learning');
    case 'platform':
      return inventory.filter(({ source }) => source === 'phase5-platform');
    case 'paymob':
      return inventory.filter(({ key }) => paymobRouteKeys.has(key));
    case 'finance':
      return inventory.filter(
        ({ key, source }) => source === 'finance-paymob' && !paymobRouteKeys.has(key),
      );
  }
}

export function assertRecordedReleaseScenario(scenario: ReleaseScenarioName): {
  routeKeys: string[];
  extraRouteKeys: string[];
} {
  const expected = releaseScenarioEvidence(scenario)
    .map(({ key }) => key)
    .sort();
  const recorded = recordedHttpTestRoutes();
  assert.deepEqual(recorded.unmatched, [], `Unmatched HTTP requests in ${scenario} scenario`);
  const observed = new Set(recorded.observed);
  const missing = expected.filter((key) => !observed.has(key));
  assert.deepEqual(missing, [], `Missing request-derived HTTP evidence for ${scenario}`);
  const expectedSet = new Set(expected);
  return {
    routeKeys: expected,
    extraRouteKeys: recorded.observed.filter((key) => !expectedSet.has(key)),
  };
}
