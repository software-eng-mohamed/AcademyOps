import * as fs from 'fs';

/**
 * Counts the physical lines in a string content.
 * Empty files return 0 lines.
 * Normalizes CRLF to LF so they are counted identically.
 */
export function countLines(content: string): number {
  if (content.length === 0) {
    return 0;
  }
  const normalized = content.replace(/\r\n/g, '\n');
  let lfCount = 0;
  for (let i = 0; i < normalized.length; i++) {
    if (normalized[i] === '\n') {
      lfCount++;
    }
  }
  return normalized.endsWith('\n') ? lfCount : lfCount + 1;
}

/**
 * Reads a file's content and counts its physical lines.
 */
export function countFileLines(filePath: string): number {
  const content = fs.readFileSync(filePath, 'utf8');
  return countLines(content);
}
