import { vi, describe, it, expect, beforeEach } from 'vitest';
import { checkLineLimits } from '../src/checker';
import * as gitUtils from '../src/git-utils';
import * as lineCounter from '../src/line-counter';
import * as configValidator from '../src/config-validator';
import * as fs from 'fs';

vi.mock('../src/git-utils');
vi.mock('../src/line-counter');
vi.mock('../src/config-validator');
vi.mock('fs');

describe('Gate Orchestrator (checkLineLimits)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(fs, 'existsSync').mockReturnValue(true);
  });

  it('passes when all files are <= 300 lines or within baseline limits', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockReturnValue({
      exclusions: [],
      baseline: { 'legacy.ts': 500 },
    });
    vi.mocked(gitUtils.getTrackedFiles).mockReturnValue(['legacy.ts', 'new-file.ts']);
    vi.mocked(gitUtils.isBinaryFile).mockReturnValue(false);
    vi.mocked(lineCounter.countFileLines).mockImplementation((file) => {
      if (file.endsWith('legacy.ts')) return 450; // within limit 500
      return 200; // within limit 300
    });

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1); // legacy offender warning
    expect(result.warnings[0]).toContain("legacy.ts' is at 450 lines");
  });

  it('fails when a new file exceeds 300 lines', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockReturnValue({
      exclusions: [],
      baseline: {},
    });
    vi.mocked(gitUtils.getTrackedFiles).mockReturnValue(['new-file.ts']);
    vi.mocked(gitUtils.isBinaryFile).mockReturnValue(false);
    vi.mocked(lineCounter.countFileLines).mockReturnValue(301);

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "[LINE LIMIT VIOLATION] New/maintained file 'new-file.ts' has 301 lines, exceeding the 300-line maximum.",
    );
  });

  it('fails when a baseline offender grows beyond its recorded limit', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockReturnValue({
      exclusions: [],
      baseline: { 'legacy.ts': 400 },
    });
    vi.mocked(gitUtils.getTrackedFiles).mockReturnValue(['legacy.ts']);
    vi.mocked(gitUtils.isBinaryFile).mockReturnValue(false);
    vi.mocked(lineCounter.countFileLines).mockReturnValue(401);

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "[GROWTH VIOLATION] 'legacy.ts' grew to 401 lines (baseline limit: 400).",
    );
  });

  it('fails when a baseline path is missing from tracked files', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockReturnValue({
      exclusions: [],
      baseline: { 'legacy.ts': 400 },
    });
    vi.mocked(gitUtils.getTrackedFiles).mockReturnValue(['other.ts']);
    vi.mocked(gitUtils.isBinaryFile).mockReturnValue(false);
    vi.mocked(lineCounter.countFileLines).mockReturnValue(100);

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(false);
    expect(result.errors).toContain(
      "[STALE BASELINE] Baseline path 'legacy.ts' is not tracked by git.",
    );
  });

  it('warns (actionable info) and does not fail when a baseline offender shrinks to <= 300 lines', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockReturnValue({
      exclusions: [],
      baseline: { 'legacy.ts': 400 },
    });
    vi.mocked(gitUtils.getTrackedFiles).mockReturnValue(['legacy.ts']);
    vi.mocked(gitUtils.isBinaryFile).mockReturnValue(false);
    vi.mocked(lineCounter.countFileLines).mockReturnValue(290);

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.info).toContain(
      "[ACTION REQUIRED] 'legacy.ts' has reached 290 lines (<= 300). Remove it from the baseline.",
    );
  });

  it('fails when config loader throws a malformed config error', () => {
    vi.mocked(configValidator.loadAndValidateConfig).mockImplementation(() => {
      throw new Error('Config parse failed');
    });

    const result = checkLineLimits('dummy-root', 'dummy-config');
    expect(result.success).toBe(false);
    expect(result.errors[0]).toContain('[MALFORMED CONFIG] Config parse failed');
  });
});
