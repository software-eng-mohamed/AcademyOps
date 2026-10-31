import { describe, expect, it } from 'vitest';
import { field, normalizeRecord, record, records, supportsSearch } from '@/api/academy/models';

describe('academy record normalization', () => {
  it('keeps API identity, status and concurrency versions without inventing values', () => {
    expect(
      normalizeRecord('students', {
        id: 'student-1',
        person: { name: 'Ada Lovelace', publicId: 'ST-001' },
        status: 'ACTIVE',
        version: 7,
      }),
    ).toMatchObject({
      id: 'student-1',
      name: 'Ada Lovelace',
      code: 'ST-001',
      status: 'ACTIVE',
      version: 7,
    });
    expect(
      normalizeRecord('versions', {
        id: 'version-1',
        code: 'HR-2',
        status: 'DRAFT',
        version: 2,
        recordVersion: 11,
      }).version,
    ).toBe(11);
  });

  it('rejects malformed records instead of rendering a fake row', () => {
    expect(() => normalizeRecord('students', { name: 'No identifier' })).toThrow(
      'Invalid academy record',
    );
  });

  it('reads nested fields defensively and exposes only searchable resources', () => {
    expect(field({ student: { person: { name: 'Grace' } } }, 'student.person.name')).toBe('Grace');
    expect(field({}, 'missing.path')).toBeUndefined();
    expect(record(null)).toEqual({});
    expect(records([null, { id: '1' }])).toEqual([{}, { id: '1' }]);
    expect(supportsSearch('leads')).toBe(true);
    expect(supportsSearch('registrations')).toBe(false);
  });
});
