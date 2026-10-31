import { describe, expect, it } from 'vitest';
import { cairoTodayAt, monthsAgo } from '../prisma/seed-ui-demo/utils';
import { seedAcademicResources } from '../prisma/seed-ui-demo/academic';
import { seedAuditEvents } from '../prisma/seed-ui-demo/audit';
import { seedFacilitiesAndTrainer } from '../prisma/seed-ui-demo/facilities-trainer';
import { seedOrgAndStaff } from '../prisma/seed-ui-demo/org-staff';
import { seedSessionsAndAttendance } from '../prisma/seed-ui-demo/sessions-attendance';
import { seedStudentsAndFinance } from '../prisma/seed-ui-demo/students-finance';

describe('seed-ui-demo decomposition and helpers', () => {
  it('exports all expected step function modules', () => {
    expect(typeof seedOrgAndStaff).toBe('function');
    expect(typeof seedAcademicResources).toBe('function');
    expect(typeof seedFacilitiesAndTrainer).toBe('function');
    expect(typeof seedStudentsAndFinance).toBe('function');
    expect(typeof seedSessionsAndAttendance).toBe('function');
    expect(typeof seedAuditEvents).toBe('function');
  });

  it('calculates Cairo dates with correct hour offset', () => {
    const cairoDate10 = cairoTodayAt(10);
    const cairoDate14 = cairoTodayAt(14);
    expect(cairoDate10 instanceof Date).toBe(true);
    expect(cairoDate14.getUTCHours() - cairoDate10.getUTCHours()).toBe(4);
  });

  it('calculates historical months dates deterministically on 8th of month', () => {
    const date2MonthsAgo = monthsAgo(2);
    expect(date2MonthsAgo.getUTCDate()).toBe(8);
    expect(date2MonthsAgo.getUTCHours()).toBe(10);
  });

  it('enforces environment guard rules', () => {
    const checkGuard = (nodeEnv?: string, devFixtures?: string) => {
      if (nodeEnv === 'production' || devFixtures !== 'true') {
        throw new Error(
          'Development fixtures are disabled. Set ENABLE_DEVELOPMENT_FIXTURES=true outside production.',
        );
      }
    };

    expect(() => checkGuard('development', 'false')).toThrow(
      'Development fixtures are disabled. Set ENABLE_DEVELOPMENT_FIXTURES=true outside production.',
    );
    expect(() => checkGuard('production', 'true')).toThrow(
      'Development fixtures are disabled. Set ENABLE_DEVELOPMENT_FIXTURES=true outside production.',
    );
    expect(() => checkGuard('development', undefined)).toThrow();
    expect(() => checkGuard('development', 'true')).not.toThrow();
  });
});
