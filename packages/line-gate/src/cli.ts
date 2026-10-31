import * as path from 'path';
import { checkLineLimits } from './checker';

function runCli(): void {
  // Resolve paths deterministically relative to this file
  const workspaceRoot = path.resolve(__dirname, '../../..');
  const configPath = path.join(workspaceRoot, 'packages/line-gate/config.json');

  console.log(`[LINE GATE] Running physical-line-limit gate check...`);
  console.log(`[LINE GATE] Workspace root: ${workspaceRoot}`);
  console.log(`[LINE GATE] Configuration:  ${configPath}\n`);

  const result = checkLineLimits(workspaceRoot, configPath);

  // Sort messages to ensure deterministic output ordering
  const sortedErrors = [...result.errors].sort();
  const sortedWarnings = [...result.warnings].sort();
  const sortedInfo = [...result.info].sort();

  if (sortedInfo.length > 0) {
    console.log('Action Items:');
    sortedInfo.forEach((msg) => console.log(`  ${msg}`));
    console.log('');
  }

  if (sortedWarnings.length > 0) {
    console.log(`Warnings (${sortedWarnings.length} legacy offenders):`);
    sortedWarnings.forEach((msg) => console.log(`  ${msg}`));
    console.log('');
  }

  if (sortedErrors.length > 0) {
    console.error(`ERROR: Gate failed with ${sortedErrors.length} validation errors:`);
    sortedErrors.forEach((msg) => console.error(`  ${msg}`));
    process.exit(1);
  }

  console.log(`[SUCCESS] Physical-line gate passed! Total checked files: ${result.totalChecked}`);
  process.exit(0);
}

runCli();
