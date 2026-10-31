import { describe, it, expect } from 'vitest';
import { countLines } from '../src/line-counter';

describe('Line Counter', () => {
  it('returns 0 for empty content', () => {
    expect(countLines('')).toBe(0);
  });

  it('counts a single line without newline', () => {
    expect(countLines('hello')).toBe(1);
  });

  it('counts a single line with LF newline', () => {
    expect(countLines('hello\n')).toBe(1);
  });

  it('counts a single line with CRLF newline identically', () => {
    expect(countLines('hello\r\n')).toBe(1);
  });

  it('counts multiple lines with mixed CRLF and LF', () => {
    expect(countLines('line1\nline2\r\nline3')).toBe(3);
  });

  it('counts blank lines correctly', () => {
    expect(countLines('\n')).toBe(1);
    expect(countLines('\n\n')).toBe(2);
    expect(countLines('\r\n\r\n')).toBe(2);
    expect(countLines('a\n\nb')).toBe(3);
  });

  it('handles complex final-newline sequences', () => {
    expect(countLines('a\n\n')).toBe(2);
    expect(countLines('a\r\n\r\n')).toBe(2);
    expect(countLines('a\n\nb\n')).toBe(3);
  });
});
