import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../../..');

describe('production dependency audit command', () => {
  it('runs the audit before connector tests without mutating the ignore list', () => {
    const manifest = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>;
    };
    const command = manifest.scripts['audit:prod'];

    expect(command).toBe(
      'pnpm audit --prod --audit-level=moderate && pnpm --filter @academyops/otp-connector test',
    );
    expect(command).not.toMatch(/(?:^|\s)--ignore(?:\s|$)/);
  });

  it('does not suppress production dependency advisories', () => {
    const workspace = readFileSync(resolve(root, 'pnpm-workspace.yaml'), 'utf8');

    expect(workspace).not.toMatch(/ignoreGhsas:/);
  });
});
