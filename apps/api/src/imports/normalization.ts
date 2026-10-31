import { createHash } from 'node:crypto';
import type { XlsxScalar } from './xlsx-reader';

const invisibleMarks = /[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g;

export function normalizeText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (!['string', 'number', 'boolean', 'bigint'].includes(typeof value)) return null;
  const normalized = `${value as string | number | boolean | bigint}`
    .replace(invisibleMarks, '')
    .replace(/\s+/g, ' ')
    .trim();
  return normalized || null;
}

export function normalizeEmail(value: unknown): string | null {
  return normalizeText(value)?.toLowerCase() ?? null;
}

export function normalizeEgyptPhone(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) return null;
  let digits = text.replace(/[^\d+]/g, '');
  if (digits.startsWith('0020')) digits = `+20${digits.slice(4)}`;
  else if (digits.startsWith('20') && !digits.startsWith('+')) digits = `+${digits}`;
  else if (digits.startsWith('01')) digits = `+2${digits}`;
  else if (/^1\d{9}$/.test(digits)) digits = `+20${digits}`;
  return /^\+20\d{10}$/.test(digits) ? digits : text;
}

export function normalizeKnownValue(header: string, value: XlsxScalar): XlsxScalar {
  if (typeof value === 'object' && value !== null) return value;
  const key = header.toLowerCase().replace(/[^a-z]/g, '');
  if (key.includes('email')) return normalizeEmail(value);
  if (key.includes('phone') || key.includes('mobile')) return normalizeEgyptPhone(value);
  const text = normalizeText(value);
  if (!text) return null;
  const aliases: Record<string, string> = {
    hypird: 'HYBRID',
    hybrid: 'HYBRID',
    'v. cash': 'VODAFONE_CASH',
    'v.cash': 'VODAFONE_CASH',
    'vodafone cash': 'VODAFONE_CASH',
  };
  return (
    aliases[text.toLowerCase()] ??
    (typeof value === 'number' || typeof value === 'boolean' ? value : text)
  );
}

export function stableRowHash(values: Record<string, unknown>): string {
  const ordered = Object.fromEntries(Object.entries(values).sort(([a], [b]) => a.localeCompare(b)));
  return createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}
