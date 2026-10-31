import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { aggregateGate, parseSummary } from '../gates.js';

const argumentsAfterCommand = process.argv.slice(2);
const paths =
  argumentsAfterCommand[0] === '--' ? argumentsAfterCommand.slice(1) : argumentsAfterCommand;
if (!paths.length) throw new Error('Pass every HTTP and realtime runner summary for one profile.');
const summaries = paths.map((path) => parseSummary(readFileSync(resolve(path), 'utf8')));
const gate = aggregateGate(summaries);
const output = resolve(process.cwd(), `test-results/load/gates/gate-${gate.profile}.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(gate, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
chmodSync(output, 0o600);
console.log(`Sanitized ${gate.passed ? 'passing' : 'failed'} gate written to ${output}.`);
if (!gate.passed) process.exitCode = 1;
