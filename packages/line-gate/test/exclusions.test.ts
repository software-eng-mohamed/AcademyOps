import * as fs from 'fs';
import * as path from 'path';
import { describe, it, expect } from 'vitest';
import { isExcludedPath } from '../src/path-matcher';
import { isBinaryFile } from '../src/git-utils';

describe('Exclusions', () => {
  describe('Path Matcher', () => {
    const exclusions = [
      'packages/api-client/src/generated.ts',
      'packages/api-client/openapi.json',
      'pnpm-lock.yaml',
      'apps/api/prisma/migrations/**',
    ];

    it('matches exact paths', () => {
      expect(isExcludedPath('packages/api-client/src/generated.ts', exclusions)).toBe(true);
      expect(isExcludedPath('packages/api-client/openapi.json', exclusions)).toBe(true);
      expect(isExcludedPath('pnpm-lock.yaml', exclusions)).toBe(true);
      expect(isExcludedPath('packages/api-client/src/client.ts', exclusions)).toBe(false);
    });

    it('matches subdirectory wildcard patterns', () => {
      expect(
        isExcludedPath('apps/api/prisma/migrations/20231012_init/migration.sql', exclusions),
      ).toBe(true);
      expect(isExcludedPath('apps/api/prisma/migrations/other-file.sql', exclusions)).toBe(true);
      expect(isExcludedPath('apps/api/prisma/schema.prisma', exclusions)).toBe(false);
    });

    it('matches the directory itself for wildcards', () => {
      expect(isExcludedPath('apps/api/prisma/migrations', exclusions)).toBe(true);
      expect(isExcludedPath('apps/api/prisma/migrations/', exclusions)).toBe(true);
    });

    it('does not match sibling directory prefixes', () => {
      expect(isExcludedPath('apps/api/prisma/migrations-archive/file.sql', exclusions)).toBe(false);
      expect(isExcludedPath('apps/api/prisma/migrations-archive', exclusions)).toBe(false);
    });
  });

  describe('Binary File Detection', () => {
    it('detects a normal text file as non-binary', () => {
      const tempTxt = path.join(__dirname, 'temp-test-text.txt');
      fs.writeFileSync(tempTxt, 'This is a normal text file with CRLF\r\nand some lines.');

      try {
        expect(isBinaryFile(tempTxt)).toBe(false);
      } finally {
        if (fs.existsSync(tempTxt)) {
          fs.unlinkSync(tempTxt);
        }
      }
    });

    it('detects a file containing null byte as binary', () => {
      const tempBin = path.join(__dirname, 'temp-test-bin.bin');
      const buffer = Buffer.alloc(100);
      buffer.write('Hello World');
      buffer[20] = 0; // Insert a null byte
      fs.writeFileSync(tempBin, buffer);

      try {
        expect(isBinaryFile(tempBin)).toBe(true);
      } finally {
        if (fs.existsSync(tempBin)) {
          fs.unlinkSync(tempBin);
        }
      }
    });
  });
});
