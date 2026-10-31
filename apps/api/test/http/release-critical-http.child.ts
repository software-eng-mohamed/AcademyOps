import { runImportsHttpScenario } from './imports-http.scenario';
import { runPaymobHttpScenario } from './paymob-http.scenario';
import { runBusinessChainHttpScenario } from './business-chain-http.scenario';
import { runFinanceHttpScenario } from './finance-http.scenario';
import { runDomainHttpScenario } from './domain-http.scenario';
import { runIamHttpScenario } from './iam-http.scenario';
import { runLearningHttpScenario } from './learning-http.scenario';
import { runPlatformHttpScenario } from './platform-http.scenario';
import { runIdentityHttpScenario } from './identity-http.scenario';
import {
  assertRecordedReleaseScenario,
  releaseScenarioNames,
  type ReleaseScenarioName,
} from './release-route-accounting';

const scenarioRunners: Record<ReleaseScenarioName, () => Promise<void>> = {
  identity: runIdentityHttpScenario,
  paymob: runPaymobHttpScenario,
  imports: runImportsHttpScenario,
  business: runBusinessChainHttpScenario,
  finance: runFinanceHttpScenario,
  domain: runDomainHttpScenario,
  iam: runIamHttpScenario,
  learning: runLearningHttpScenario,
  platform: runPlatformHttpScenario,
};

const operationLabels: Record<ReleaseScenarioName, string> = {
  identity: 'identityOperations',
  paymob: 'paymobOperations',
  imports: 'importOperations',
  business: 'businessOperations',
  finance: 'financeOperations',
  domain: 'domainOperations',
  iam: 'iamPhase5Operations',
  learning: 'learningPhase5Operations',
  platform: 'platformPhase5Operations',
};

async function main(): Promise<void> {
  const requested = process.argv[2];
  if (!releaseScenarioNames.includes(requested as ReleaseScenarioName)) {
    throw new Error(`Expected one of: ${releaseScenarioNames.join(', ')}`);
  }
  const scenario = requested as ReleaseScenarioName;
  await scenarioRunners[scenario]();
  const coverage = assertRecordedReleaseScenario(scenario);
  console.log(
    JSON.stringify({
      [operationLabels[scenario]]: coverage.routeKeys.length,
      routeKeys: coverage.routeKeys,
      extraRouteKeys: coverage.extraRouteKeys,
    }),
  );
  process.exit(0);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
