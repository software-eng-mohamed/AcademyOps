import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');
const shell = [
  process.env.PLG_TEST_POSIX_SHELL,
  'sh',
  ...(process.platform === 'win32'
    ? ['C:\\Program Files\\Git\\bin\\sh.exe', 'C:\\Program Files\\Git\\usr\\bin\\sh.exe']
    : []),
].find((candidate) => candidate && spawnSync(candidate, ['-c', 'exit 0']).status === 0);

const renderAlertmanager = (value: string, allowLocal = false) => {
  const fixture = mkdtempSync(resolve(tmpdir(), 'plg-alert-render-'));
  try {
    const environment = resolve(fixture, 'runtime.env');
    const output = resolve(fixture, 'alertmanager.yml');
    writeFileSync(environment, `ALERT_WEBHOOK_URL=${value}\n`);
    const result = spawnSync(
      shell!,
      [resolve(root, 'deploy/vps/scripts/render-alertmanager-config.sh'), environment, output],
      {
        env: {
          ...process.env,
          PATH: process.env.PATH,
          PLG_ALLOW_LOCAL_ALERT_RECEIVER: allowLocal ? 'local-container' : '',
        },
        encoding: 'utf8',
      },
    );
    return {
      result,
      output: result.status === 0 ? readFileSync(output, 'utf8') : '',
    };
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
};

describe('stage 5 external alert delivery and current runbooks', () => {
  it('wires Prometheus through a pinned, egress-limited Alertmanager', () => {
    const compose = read('deploy/vps/compose.monitoring.yml');
    const prometheus = read('deploy/vps/prometheus/prometheus.yml');
    const manager = read('deploy/vps/alertmanager/alertmanager.yml');
    const alerts = read('deploy/vps/prometheus/alerts.yml');
    const preflight = read('deploy/vps/scripts/preflight.sh');

    expect(compose).toMatch(/prom\/alertmanager:v0\.28\.1@sha256:[0-9a-f]{64}/);
    expect(compose).toContain('networks: [monitoring, egress]');
    expect(compose).toContain('127.0.0.1:9093:9093');
    expect(prometheus).toContain('targets: [alertmanager:9093]');
    expect(manager).toContain("url: '__ALERT_WEBHOOK_URL__'");
    expect(manager).toContain('send_resolved: true');
    expect(alerts).toContain('PostgresOffsiteBackupMissing');
    expect(alerts).toContain('PostgresOffsiteBackupStale');
    expect(preflight).toContain('render-alertmanager-config.sh');
    expect(preflight).toContain('check-config /etc/alertmanager/alertmanager.yml');
  });

  it.runIf(Boolean(shell))('renders HTTPS safely and gates the disposable HTTP receiver', () => {
    const renderer = read('deploy/vps/scripts/render-alertmanager-config.sh');
    const secure = renderAlertmanager('https://alerts.example.test/hooks/a?x=1&y=2');
    expect(secure.result.status, secure.result.stderr).toBe(0);
    expect(secure.output).toContain("url: 'https://alerts.example.test/hooks/a?x=1&y=2'");
    expect(secure.output).not.toContain('__ALERT_WEBHOOK_URL__');

    expect(renderer).toContain('PLG_ALLOW_LOCAL_ALERT_RECEIVER');
    expect(renderer).toContain('local-container');
    const rejected = renderAlertmanager('http://external.invalid/alerts');
    expect(rejected.result.status, rejected.result.stderr).toBe(1);
  });

  it('provides an internal-only local delivery drill and an off-host failure runbook', () => {
    const drill = read('deploy/vps/scripts/test-alertmanager-delivery.sh');
    const external = read('deploy/vps/external-monitoring.md');

    expect(drill).toContain('docker network create --internal');
    expect(drill).toContain('PostgresOffsiteBackupStale');
    expect(drill).toContain('plg-alert-receiver-');
    expect(external).toContain('at least two probe regions');
    expect(external).toContain('/api/v1/health/live');
    expect(external).toContain('/health');
    expect(external).toContain('outside the VPS');
    expect(external).toContain('PostgresOffsiteBackupMissing');
    expect(external).toContain('PostgresOffsiteBackupStale');
  });

  it('marks the old roadmap historical and documents the implemented OTP connector', () => {
    const deployment = read('docs/deployment.md');
    const status = read('docs/implementation-status.md');
    const roadmap = read('docs/completion-roadmap.md');

    expect(deployment).toContain('wait for the connector to report available');
    expect(deployment).not.toContain('OTP_CONNECTOR_NOT_CONFIGURED');
    expect(status).toContain('isolated `whatsapp-web.js` connector');
    expect(status).not.toContain('phone OTP remains intentionally');
    expect(roadmap).toContain('Historical planning snapshot');
    expect(roadmap).toMatch(/must not\s+> be used for current release acceptance/);
  });

  it('keeps the maintained base Compose file inside the physical line gate', () => {
    expect(read('deploy/vps/compose.yml').split(/\r?\n/).length - 1).toBeLessThanOrEqual(300);
  });
});
