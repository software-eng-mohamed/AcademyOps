import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname, '../../..');
const read = (path: string): string => readFileSync(resolve(root, path), 'utf8');

describe('isolated WhatsApp Web OTP connector deployment', () => {
  it('pins Chromium, disables downloads, and includes the browser compatibility patch', () => {
    const dockerfile = read('deploy/Dockerfile.otp-connector');
    const workspace = read('pnpm-workspace.yaml');
    expect(dockerfile).toContain(
      'ghcr.io/puppeteer/puppeteer:25.16.0@sha256:956a72e3d523c76606efaad23392fbe33950370189f749715222c7427f57392b',
    );
    expect(dockerfile).toContain('PUPPETEER_SKIP_DOWNLOAD=true');
    expect(dockerfile).toContain('USER pptruser');
    expect(workspace).toContain('puppeteer: false');
    expect(workspace).toContain('whatsapp-web.js@1.34.7: patches/whatsapp-web.js@1.34.7.patch');
    expect(workspace).not.toContain('extract-zip@');
  });

  it('has no public port or application data credentials', () => {
    const compose = read('deploy/vps/compose.whatsapp.yml');
    const connector = serviceBlock(compose, 'otp-connector', 'networks');
    expect(connector).not.toMatch(/^\s+ports:/m);
    expect(connector).not.toMatch(/DATABASE_URL|REDIS_URL|SMTP_|R2_|PAYMOB_|SESSION_PEPPER/);
    expect(connector).toContain('read_only: true');
    expect(connector).toContain('cap_drop: [ALL]');
    expect(connector).toContain('no-new-privileges:true');
    expect(connector).toContain('/tmp:size=512m,uid=10042,gid=10042,mode=0700');
    expect(connector).toContain('otp-connector-session:/sessions');
    expect(compose).toContain('otp-connector:\n    internal: true');
  });

  it('shares one private token and blocks connector control at both public proxies', () => {
    const compose = read('deploy/vps/compose.whatsapp.yml');
    const productionCaddy = read('deploy/vps/Caddyfile');
    const syntheticCaddy = read('deploy/vps/Caddyfile.synthetic');
    const runtime = read('deploy/vps/runtime.env.example');
    expect(compose.match(/^\s+OTP_CONNECTOR_INTERNAL_TOKEN:/gm) ?? []).toHaveLength(4);
    expect(compose).toContain('OTP_CONNECTOR_URL: http://otp-connector:3002');
    for (const caddy of [productionCaddy, syntheticCaddy]) {
      expect(caddy.indexOf('respond @internalOtpConnector 404')).toBeLessThan(
        caddy.indexOf('@backend path'),
      );
    }
    expect(runtime).toContain('OTP_CONNECTOR_INTERNAL_TOKEN=SET_ME');
  });

  it('attests, scans, deploys, and waits for the connector image', () => {
    const workflow = read('.github/workflows/ci.yml');
    const imageWorkflow = read('.github/workflows/otp-connector-image.yml');
    const manifest = read('deploy/vps/scripts/create-release-manifest.sh');
    const bundle = read('deploy/vps/scripts/create-release-bundle.sh');
    const deploy = read('deploy/vps/scripts/deploy-release.sh');
    expect(workflow).toContain('plg-academy-otp-connector:${{ github.sha }}');
    expect(imageWorkflow).toContain('image-ref: plg-academy-otp-connector:${{ github.sha }}');
    expect(manifest).toContain('OTP_CONNECTOR_IMAGE_ID=');
    expect(bundle).toContain('"plg-otp-connector:$source_sha"');
    expect(deploy).toContain('-f compose.whatsapp.yml');
    expect(deploy).toContain('wait_service_healthy otp-connector');
  });
});

function serviceBlock(source: string, name: string, nextTopLevel: string): string {
  const start = source.indexOf(`\n  ${name}:`);
  const end = source.indexOf(`\n${nextTopLevel}:`, start + 1);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}
