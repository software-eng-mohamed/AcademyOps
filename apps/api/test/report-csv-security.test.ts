import { describe, expect, it } from 'vitest';
import { escapeCsvCell } from '../src/reporting/report-export-worker.service';

describe('report CSV injection protection', () => {
  it.each(['=1+1', '+cmd', '-2+3', '@SUM(A1)', ' =HYPERLINK("https://evil")', '\t@cmd'])(
    'neutralizes spreadsheet formulas including whitespace-prefixed payloads',
    (value) => {
      expect(escapeCsvCell(value)).toBe(`"'${value.replaceAll('"', '""')}"`);
    },
  );

  it('preserves ordinary text while escaping quotes', () => {
    expect(escapeCsvCell('safe "name"')).toBe('"safe ""name"""');
  });
});
