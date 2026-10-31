import { describe, expect, it } from 'vitest';
import { managementRow } from '@/api/management/queries';
import { exportRefreshInterval } from '@/features/management/export-refresh';

describe('pending report refresh', () => {
  const rows = (status: string) => [managementRow('exports', { id: 'report', status })];
  it.each(['QUEUED', 'RUNNING'])('polls while an export is %s', (status) => {
    expect(exportRefreshInterval('exports', rows(status), null)).toBe(3000);
  });
  it.each(['AVAILABLE', 'FAILED', 'EXPIRED'])('stops at terminal status %s', (status) => {
    expect(exportRefreshInterval('exports', rows(status), null)).toBe(false);
  });
  it('does not retry an authentication error or poll unrelated directories', () => {
    expect(exportRefreshInterval('exports', rows('QUEUED'), new Error('Step up required'))).toBe(
      false,
    );
    expect(exportRefreshInterval('payments', rows('QUEUED'), null)).toBe(false);
    expect(exportRefreshInterval('exports', undefined, null)).toBe(false);
  });
});
