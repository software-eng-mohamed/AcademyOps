import { describe, expect, it } from 'vitest';
import {
  cairoDayRange,
  cairoWallTimeToIso,
  instantToCairoDateTimeLocal,
  isCairoWallTime,
} from '@/lib/cairo-time';

describe('Cairo wall-clock conversion', () => {
  it('uses Cairo winter and summer offsets independent of the workstation zone', () => {
    expect(cairoWallTimeToIso('2026-01-15T18:00')).toBe('2026-01-15T16:00:00.000Z');
    expect(cairoWallTimeToIso('2026-09-08T18:00')).toBe('2026-09-08T15:00:00.000Z');
    expect(instantToCairoDateTimeLocal('2026-09-08T15:00:00.000Z')).toBe('2026-09-08T18:00');
  });

  it('builds exact Cairo calendar-day bounds, including daylight-saving changes', () => {
    expect(cairoDayRange('2026-09-08')).toEqual({
      from: '2026-09-07T21:00:00.000Z',
      to: '2026-09-08T20:59:59.999Z',
    });
    expect(cairoDayRange('2026-04-24')).toEqual({
      from: '2026-04-23T22:00:00.000Z',
      to: '2026-04-24T20:59:59.999Z',
    });
    expect(cairoDayRange('2026-10-29')).toEqual({
      from: '2026-10-28T21:00:00.000Z',
      to: '2026-10-29T21:59:59.999Z',
    });
  });

  it('rejects nonexistent, ambiguous, and malformed Cairo wall times', () => {
    expect(isCairoWallTime('2026-04-24T00:30')).toBe(false);
    expect(isCairoWallTime('2026-10-29T23:30')).toBe(false);
    expect(isCairoWallTime('2026-02-30T12:00')).toBe(false);
    expect(() => cairoWallTimeToIso('2026-04-24T00:30')).toThrow('ambiguous Cairo wall time');
  });
});
