import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

function serviceBlock(source: string, name: string, next: string): string {
  const start = source.indexOf(`\n  ${name}:`);
  const end = source.indexOf(`\n  ${next}:`, start + 1);
  expect(start, `${name} service is missing`).toBeGreaterThanOrEqual(0);
  expect(end, `${next} boundary is missing`).toBeGreaterThan(start);
  return source.slice(start, end);
}

function finalServiceBlock(source: string, name: string, nextTopLevel: string): string {
  const start = source.indexOf(`\n  ${name}:`);
  const end = source.indexOf(`\n${nextTopLevel}:`, start + 1);
  expect(start, `${name} service is missing`).toBeGreaterThanOrEqual(0);
  expect(end, `${nextTopLevel} boundary is missing`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('VPS ingress and web runtime topology', () => {
  it('keeps the production origin off host ports and behind Cloudflare Tunnel', () => {
    const compose = read('deploy/vps/compose.yml');
    const tunnel = read('deploy/vps/compose.cloudflare.yml');
    const caddy = serviceBlock(compose, 'caddy', 'web');
    const cloudflared = finalServiceBlock(tunnel, 'cloudflared', 'secrets');

    expect(caddy).not.toMatch(/^\s+ports:/m);
    expect(caddy).toContain('ipv4_address: 172.30.240.2');
    expect(caddy).toContain('read_only: true');
    expect(cloudflared).not.toMatch(/^\s+ports:/m);
    expect(cloudflared).toContain('ipv4_address: 172.30.241.2');
    expect(cloudflared).not.toMatch(/networks:.*(?:data|monitoring)/);
    expect(compose).toContain('origin: { internal: true');
    const caddyfile = read('deploy/vps/Caddyfile');
    expect(caddyfile).toContain('trusted_proxies static 172.30.241.2/32');
    expect(caddyfile).toContain('client_ip_headers CF-Connecting-IP');
    expect(caddyfile).toContain('header_up X-Forwarded-For {client_ip}');
  });

  it('pins and confines cloudflared and mounts its token as a file secret', () => {
    const source = read('deploy/vps/compose.cloudflare.yml');
    const cloudflared = finalServiceBlock(source, 'cloudflared', 'secrets');

    expect(cloudflared).toContain(
      'cloudflare/cloudflared:2026.8.0@sha256:2535e54b16adf1d50630f99d0886471926c5ef3f6b328100ec6589f731c48969',
    );
    expect(cloudflared).toContain('--token-file');
    expect(cloudflared).toContain('/run/secrets/cloudflared_token');
    expect(cloudflared).not.toContain('TUNNEL_TOKEN');
    expect(cloudflared).toContain('cap_drop: [ALL]');
    expect(cloudflared).toContain('no-new-privileges:true');
    expect(cloudflared).toContain('read_only: true');
    expect(source).toContain('file: ./runtime/cloudflared-token');
  });

  it('provides matching build-time and runtime web boundaries', () => {
    const compose = read('deploy/vps/compose.yml');
    const dockerfile = read('deploy/Dockerfile.web');
    const example = read('deploy/vps/runtime.env.example');
    const validator = read('deploy/vps/scripts/validate-runtime-env.sh');
    const web = serviceBlock(compose, 'web', 'api-a');
    const runtimeStart = web.indexOf('\n    environment:');
    const build = web.slice(0, runtimeStart);
    const runtime = web.slice(runtimeStart);
    const required = ['API_ORIGIN', 'API_INTERNAL_URL', 'NEXT_PUBLIC_REALTIME_URL'];
    const publicAnalytics = [
      'NEXT_PUBLIC_POSTHOG_ENABLED',
      'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN',
      'NEXT_PUBLIC_POSTHOG_HOST',
      'NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT',
    ];

    for (const key of [...required, ...publicAnalytics]) {
      expect(build).toContain(`${key}:`);
      expect(runtime).toContain(`${key}:`);
    }
    expect(dockerfile).toContain('ARG NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT');
    expect(dockerfile).toContain('ENV NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT=');
    expect(example).toContain('NEXT_PUBLIC_OBSERVABILITY_ENVIRONMENT=production');
    expect(validator).toContain('"$origin/e"');
    expect(validator).toContain('caddy/optional/posthog.caddy');
    expect(runtime).toContain('API_INTERNAL_URL: ${PUBLIC_ORIGIN:');
    expect(runtime).toContain('/api/v1');
  });

  it('makes direct ingress an explicit synthetic-only overlay', () => {
    const base = read('deploy/vps/compose.yml');
    const synthetic = read('deploy/vps/compose.synthetic.yml');
    const productionCaddy = read('deploy/vps/Caddyfile');
    const syntheticCaddy = read('deploy/vps/Caddyfile.synthetic');
    const preflight = read('deploy/vps/scripts/preflight.sh');

    expect(base).not.toContain("'80:8080'");
    expect(synthetic).toContain("'80:8080'");
    expect(synthetic).toContain("'443:8443'");
    expect(productionCaddy).toContain(':8080 {');
    expect(productionCaddy).toContain('respond @internalMetrics 404');
    expect(syntheticCaddy).toContain('http_port 8080');
    expect(syntheticCaddy).toContain('https_port 8443');
    expect(preflight).toContain('-f compose.cloudflare.yml');
    expect(preflight).toContain('-f compose.synthetic.yml');
    expect(preflight.match(/caddy validate/g)).toHaveLength(2);
  });
});
