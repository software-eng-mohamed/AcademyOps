import { describe, expect, it } from 'vitest';
import {
  contextLabel,
  formatCurrency,
  formatPercentage,
  formatSignedPercent,
  presentationLabel,
} from '@/features/dashboard/overview/formatters';

describe('dashboard overview presentation', () => {
  it('formats owner financial values and real percentage changes with the selected locale', () => {
    expect(formatCurrency('128000.00', 'EGP', 'en')).toMatch(/128,000/);
    expect(formatPercentage('0.875', 'en')).toBe('87.5%');
    expect(formatSignedPercent(0.125, 'en')).toBe('+12.5%');
  });

  it('maps backend presentation codes while preserving unknown codes', () => {
    expect(presentationLabel({ REFUND: 'Refund' }, 'REFUND')).toBe('Refund');
    expect(presentationLabel({ REFUND: 'Refund' }, 'NEW_TYPE')).toBe('NEW_TYPE');
    expect(contextLabel({ studentName: 'Mariam Hassan' }, 'Enrollment')).toBe('Mariam Hassan');
    expect(contextLabel({}, 'Enrollment')).toBe('Enrollment');
  });
});
