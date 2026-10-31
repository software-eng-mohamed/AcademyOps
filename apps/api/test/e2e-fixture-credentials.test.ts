import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const root = resolve(__dirname, '../../..');

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe('isolated E2E credential artifacts', () => {
  it.each(['absolute', 'relative'])(
    'reads, writes and cleans only the %s override',
    async (kind) => {
      const fixture = mkdtempSync(resolve(tmpdir(), 'plg-fixture-credentials-'));
      if (dirname(fixture) !== resolve(tmpdir()))
        throw new Error('Unexpected credential fixture path');
      const selectedPath = resolve(fixture, 'selected.json');
      const otherPath = resolve(fixture, 'other.json');
      writeFileSync(otherPath, 'untouched artifact');
      vi.stubEnv(
        'E2E_CREDENTIALS_FILE',
        kind === 'absolute' ? selectedPath : relative(root, selectedPath),
      );
      // Turbo strict mode omits USERNAME; protecting a credential must not depend on it.
      vi.stubEnv('USERNAME', undefined);
      vi.resetModules();
      try {
        const credentials = await import('../prisma/e2e-fixture/credentials.js');
        // Check the destination before writing: an ignored override must never touch live fixtures.
        expect(credentials.ARTIFACT_PATH).toBe(selectedPath);
        const artifact = await credentials.loadOrCreateArtifact();
        await credentials.writeArtifact(artifact);
        expect(JSON.parse(readFileSync(selectedPath, 'utf8'))).toEqual(artifact);
        expect(await credentials.loadOrCreateArtifact()).toEqual(artifact);
        await credentials.deleteArtifact();
        expect(existsSync(selectedPath)).toBe(false);
        expect(readFileSync(otherPath, 'utf8')).toBe('untouched artifact');
      } finally {
        rmSync(fixture, { recursive: true, force: true });
      }
    },
  );
});
