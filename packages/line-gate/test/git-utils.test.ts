import { vi, describe, it, expect } from 'vitest';
import { getTrackedFiles } from '../src/git-utils';
import { execFileSync } from 'child_process';

vi.mock('child_process');

describe('Git Utils Tracked Files Parser', () => {
  it('parses NUL-terminated file paths correctly without trimming valid spaces', () => {
    // A string with trailing spaces in a filename and trailing NUL from git ls-files -z
    const mockOutput = 'src/index.ts\0src/spaced name.ts \0src/utils.ts\0';
    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const files = getTrackedFiles('dummy-cwd');
    expect(files).toEqual([
      'src/index.ts',
      'src/spaced name.ts ', // Trailing space preserved
      'src/utils.ts',
    ]);
  });

  it('normalizes Windows backslashes to forward slashes', () => {
    const mockOutput = 'src\\win-path.ts\0src/linux-path.ts\0';
    vi.mocked(execFileSync).mockReturnValue(mockOutput);

    const files = getTrackedFiles('dummy-cwd');
    expect(files).toEqual(['src/win-path.ts', 'src/linux-path.ts']);
  });

  it('returns empty array when git output is empty', () => {
    vi.mocked(execFileSync).mockReturnValue('');

    const files = getTrackedFiles('dummy-cwd');
    expect(files).toEqual([]);
  });
});
