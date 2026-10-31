import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('single VPS production blueprint', () => {
  it('keeps database bootstrap, migration, runtime, and monitoring roles separate', () => {
    const environment = read('deploy/vps/runtime.env.example');
    const initializer = read('deploy/vps/postgres/init-observability.sh');

    expect(environment).toContain('POSTGRES_USER=plg_bootstrap');
    expect(environment).toMatch(/API_DATABASE_URL=postgresql:\/\/plg_app:/);
    expect(environment).toMatch(/WORKER_DATABASE_URL=postgresql:\/\/plg_app:/);
    expect(environment).toMatch(/DIRECT_URL=postgresql:\/\/plg_migrate:/);
    expect(environment).toMatch(/POSTGRES_EXPORTER_DSN=postgresql:\/\/plg_monitor:/);
    expect(initializer).toContain(
      'CREATE ROLE plg_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    );
    expect(initializer).toContain(
      'CREATE ROLE plg_migrate LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION',
    );
    expect(initializer).toContain('ALTER ROLE plg_monitor SET default_transaction_read_only = on');
  });

  it('scrapes authenticated metrics internally while Caddy hides the endpoint', () => {
    const caddy = read('deploy/vps/Caddyfile');
    const prometheus = read('deploy/vps/prometheus/prometheus.yml');
    const runtime = read('deploy/vps/runtime.env.example');
    const deny = caddy.indexOf('respond @internalMetrics 404');
    const proxy = caddy.indexOf('@backend path /api/* /socket.io /socket.io/*');

    expect(deny).toBeGreaterThan(0);
    expect(proxy).toBeGreaterThan(deny);
    expect(prometheus).toContain('metrics_path: /api/v1/internal/metrics');
    expect(prometheus).toContain('credentials: __METRICS_TOKEN__');
    expect(prometheus).toContain('targets: [api-a:3001, api-b:3001]');
    expect(runtime).toContain('METRICS_TOKEN=SET_ME');
  });

  it('runs a pinned private ClamAV service with persistent signatures and readiness', () => {
    const clamav = read('deploy/vps/compose.clamav.yml');
    const compose = read('deploy/vps/compose.yml');
    const preflight = read('deploy/vps/scripts/preflight.sh');
    const workerEnvironment = compose.slice(
      compose.indexOf('x-worker-environment:'),
      compose.indexOf('x-api-environment:'),
    );

    expect(clamav).toMatch(/image: clamav\/clamav:1\.4\.3_base@sha256:[a-f0-9]{64}/);
    expect(clamav).toContain('CLAMD_CONF_StreamMaxLength: 10M');
    expect(clamav).toContain('clamav-signatures:/var/lib/clamav');
    expect(clamav).toContain('/usr/local/bin/clamdcheck.sh');
    expect(clamav).not.toMatch(/^\s+ports:/m);
    expect(compose).toContain('CLAMAV_MODE: clamd');
    expect(workerEnvironment).not.toContain('CLAMAV_');
    expect(preflight).toContain('-f compose.clamav.yml');
    expect(preflight).toContain('at least 16 GiB RAM');
  });
});
