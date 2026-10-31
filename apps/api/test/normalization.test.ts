import { describe, expect, it } from 'vitest';
import {
  normalizeEgyptPhone,
  normalizeKnownValue,
  normalizeText,
  stableRowHash,
} from '../src/imports/normalization';

describe('legacy normalization', () => {
  it('removes direction marks and normalizes known aliases', () => {
    expect(normalizeText('\u200F  Ahmed   Ali ')).toBe('Ahmed Ali');
    expect(normalizeKnownValue('Delivery Mode', 'Hypird')).toBe('HYBRID');
    expect(normalizeKnownValue('Payment Method', 'V. Cash')).toBe('VODAFONE_CASH');
  });

  it('normalizes Egyptian mobile numbers without treating them as identity keys', () => {
    expect(normalizeEgyptPhone('010 1234 5678')).toBe('+201012345678');
  });

  it('creates deterministic hashes independent of key insertion order', () => {
    expect(stableRowHash({ B: 2, A: 1 })).toBe(stableRowHash({ A: 1, B: 2 }));
  });
});
