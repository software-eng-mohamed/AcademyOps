import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directories = ['vps1-frontend-monitoring', 'vps2-backend-worker', 'vps3-database-redis'];

function shellPath() {
  if (process.platform !== 'win32') return '/bin/sh';
  const git = spawnSync('git', ['--exec-path'], { encoding: 'utf8' });
  assert.equal(git.status, 0, 'Git for Windows is required for the POSIX generator test');
  return resolve(git.stdout.trim(), '../../../usr/bin/sh.exe');
}

function values(text) {
  return new Map(
    text
      .split(/\r?\n/)
      .filter((line) => /^[A-Z][A-Z0-9_]*=/.test(line))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]),
  );
}

for (const variant of ['node', 'posix']) {
  test(`${variant} cluster generator keeps secrets in protected files and out of output`, () => {
    const fixture = mkdtempSync(join(tmpdir(), 'academyops-secret-output-'));
    assert.equal(dirname(fixture), resolve(tmpdir()), 'Unexpected secret fixture directory');
    try {
      const cluster = join(fixture, 'deploy/multi-vps');
      const templates = directories.map((directory) => {
        mkdirSync(join(cluster, directory), { recursive: true });
        const text = readFileSync(
          join(root, 'deploy/multi-vps', directory, 'runtime.env.example'),
          'utf8',
        );
        writeFileSync(join(cluster, directory, 'runtime.env.example'), text);
        return values(text);
      });
      const scriptName =
        variant === 'node' ? 'generate-secrets-node.mjs' : 'generate-cluster-secrets.sh';
      const script = join(cluster, 'scripts', scriptName);
      mkdirSync(dirname(script), { recursive: true });
      writeFileSync(
        script,
        readFileSync(join(root, 'deploy/multi-vps/scripts', scriptName), 'utf8').replaceAll(
          '\r\n',
          '\n',
        ),
      );
      const executable = variant === 'node' ? process.execPath : shellPath();
      const result = spawnSync(executable, [script], {
        cwd: fixture,
        encoding: 'utf8',
        timeout: 30_000,
        env: { ...process.env, PATH: [dirname(executable), process.env.PATH].join(delimiter) },
      });
      assert.equal(result.status, 0, `${variant} generator must complete successfully`);
      const output = `${result.stdout}\n${result.stderr}`;
      const generated = directories.map((directory, index) => {
        const file = join(cluster, directory, 'runtime.env');
        const environment = values(readFileSync(file, 'utf8'));
        if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
        for (const [name, template] of templates[index]) {
          if (!template.includes('GENERATE_')) continue;
          const secret = environment.get(name);
          assert.equal(Boolean(secret && !secret.includes('GENERATE_')), true, `${name} generated`);
          assert.equal(output.includes(secret), false, `${variant} output must not expose ${name}`);
        }
        return environment;
      });
      const [monitoring, backend, database] = generated;
      assert.equal(/^[a-f0-9]{32}$/.test(monitoring.get('GRAFANA_ADMIN_PASSWORD')), true);
      assert.equal(monitoring.get('METRICS_TOKEN') === backend.get('METRICS_TOKEN'), true);
      for (const [url, password] of [
        ['API_DATABASE_URL', 'POSTGRES_APP_PASSWORD'],
        ['WORKER_DATABASE_URL', 'POSTGRES_APP_PASSWORD'],
        ['MIGRATE_DATABASE_URL', 'POSTGRES_MIGRATE_PASSWORD'],
        ['REDIS_URL', 'REDIS_PASSWORD'],
      ]) {
        assert.equal(new URL(backend.get(url)).password === database.get(password), true);
      }
      assert.equal(
        output.includes('runtime.env'),
        true,
        'Output must identify the generated files',
      );
    } finally {
      rmSync(fixture, { recursive: true, force: true });
    }
  });
}
