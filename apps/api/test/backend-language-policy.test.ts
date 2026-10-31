import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const arabicCodePoint = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/u;

describe('backend language policy', () => {
  it('keeps backend-generated source copy in English', async () => {
    const roots = [resolve('src'), resolve('../worker/src'), resolve('../otp-connector/src')];
    const files = (await Promise.all(roots.map(sourceFiles))).flat();
    const violations: string[] = [];
    for (const file of files) {
      if (arabicCodePoint.test(await readFile(file, 'utf8'))) violations.push(file);
    }
    expect(violations).toEqual([]);
  });
});

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map((entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) return sourceFiles(path);
      return Promise.resolve(/\.(?:[cm]?[jt]sx?)$/u.test(entry.name) ? [path] : []);
    }),
  );
  return nested.flat();
}
