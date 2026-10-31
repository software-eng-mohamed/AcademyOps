import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loadAndValidateConfig } from '../src/config-validator';
import * as fs from 'fs';

vi.mock('fs');

describe('Config Validator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('successfully loads a valid configuration', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        exclusions: ['a.js'],
        baseline: { 'b.js': 350 },
      }),
    );

    const config = loadAndValidateConfig('dummy-path.json');
    expect(config.exclusions).toEqual(['a.js']);
    expect(config.baseline['b.js']).toBe(350);
  });

  it('fails if config file does not exist', () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);
    expect(() => loadAndValidateConfig('missing.json')).toThrow(/Configuration file is missing/);
  });

  it('fails if config file has invalid JSON', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue('{ invalid json }');
    expect(() => loadAndValidateConfig('invalid.json')).toThrow(/Configuration is malformed.*JSON/);
  });

  it('fails if exclusions are missing or not an array', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        baseline: {},
      }),
    );
    expect(() => loadAndValidateConfig('bad.json')).toThrow(
      /Missing or invalid 'exclusions' array/,
    );
  });

  it('fails if baseline counts are invalid', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        exclusions: [],
        baseline: { 'a.js': -10 },
      }),
    );
    expect(() => loadAndValidateConfig('bad.json')).toThrow(
      /Baseline count for 'a.js' must be a non-negative integer/,
    );
  });

  it('fails if a path is in both exclusions and baseline', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        exclusions: ['shared.js'],
        baseline: { 'shared.js': 400 },
      }),
    );
    expect(() => loadAndValidateConfig('bad.json')).toThrow(
      /cannot be in both exclusions and baseline/,
    );
  });

  it('fails if a path in baseline is matched by a wildcard exclusion pattern', () => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.readFileSync).mockReturnValue(
      JSON.stringify({
        exclusions: ['apps/api/prisma/migrations/**'],
        baseline: { 'apps/api/prisma/migrations/file.sql': 400 },
      }),
    );
    expect(() => loadAndValidateConfig('bad.json')).toThrow(
      /cannot be in both exclusions and baseline/,
    );
  });
});
