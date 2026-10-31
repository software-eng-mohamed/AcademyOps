import { execFileSync } from 'child_process';
import * as fs from 'fs';

/**
 * Gets tracked and nonignored new files, with normalized path separators.
 */
export function getTrackedFiles(cwd: string): string[] {
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      {
        cwd,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
      },
    );
    if (!output) {
      return [];
    }
    const parts = output.split('\0');
    if (parts.length > 0 && parts[parts.length - 1] === '') {
      parts.pop();
    }
    return [...new Set(parts.map((file) => file.replace(/\\/g, '/')))];
  } catch (error) {
    throw new Error(`Failed to run git ls-files: ${(error as Error).message}`);
  }
}

/**
 * Checks if a file is binary by scanning the first 8KB for null bytes.
 */
export function isBinaryFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }
  try {
    const stats = fs.statSync(filePath);
    if (stats.isDirectory()) {
      return false;
    }
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(8000);
    const bytesRead = fs.readSync(fd, buffer, 0, 8000, 0);
    fs.closeSync(fd);

    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }
  } catch {
    // If we fail to read, assume not binary or let check fail elsewhere
  }
  return false;
}
