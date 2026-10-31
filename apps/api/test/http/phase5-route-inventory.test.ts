import { describe, expect, it } from 'vitest';
import {
  assertPhase5Inventory,
  phase5RouteEvidence,
  releaseRouteInventory,
} from './phase5-route-evidence';
import { releaseScenarioEvidence, releaseScenarioNames } from './release-route-accounting';

describe('Phase 5 successful HTTP route complement', () => {
  it('is an exact, unique 60-operation complement of the 221-operation API', () => {
    expect(() => assertPhase5Inventory()).not.toThrow();
    expect(phase5RouteEvidence.filter(({ terminal }) => terminal === 'SUCCESS')).toHaveLength(60);
    expect(
      phase5RouteEvidence.filter(({ terminal }) => terminal === 'UNAVAILABLE_BY_DESIGN'),
    ).toHaveLength(0);
  });

  it('maps all 221 operations to successful HTTP scenarios', () => {
    const inventory = releaseRouteInventory();
    expect(inventory).toHaveLength(221);
    expect(new Set(inventory.map(({ key }) => key)).size).toBe(221);
    expect(Object.fromEntries(sourceCounts(inventory))).toEqual({
      'baseline-identity-platform': 9,
      'business-chain': 20,
      domain: 66,
      'finance-paymob': 56,
      imports: 10,
      'phase5-iam': 24,
      'phase5-learning': 28,
      'phase5-platform': 8,
    });
    const scenarioRoutes = releaseScenarioNames.flatMap((scenario) =>
      releaseScenarioEvidence(scenario),
    );
    expect(scenarioRoutes).toHaveLength(221);
    expect(new Set(scenarioRoutes.map(({ key }) => key)).size).toBe(221);
    expect(scenarioRoutes.filter(({ terminal }) => terminal === 'SUCCESS')).toHaveLength(221);
    expect(
      scenarioRoutes.filter(({ terminal }) => terminal === 'UNAVAILABLE_BY_DESIGN'),
    ).toHaveLength(0);
  });
});

function sourceCounts(inventory: ReturnType<typeof releaseRouteInventory>) {
  const counts = new Map<string, number>();
  for (const { source } of inventory) counts.set(source, (counts.get(source) ?? 0) + 1);
  return [...counts.entries()].sort(([left], [right]) => left.localeCompare(right));
}
