import { BadRequestException } from '@nestjs/common';

export function object(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(field);
  return value as Record<string, unknown>;
}
export function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) invalid(field);
  return value;
}
export function exactKeys(input: Record<string, unknown>, allowed: string[], field: string): void {
  const extras = Object.keys(input).filter((key) => !allowed.includes(key));
  if (extras.length) invalid(field, `Unexpected fields: ${extras.join(', ')}`);
}
export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) invalid(field);
  return value;
}
export function text(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.length > 500) invalid(field);
  return value.trim();
}
export function requiredText(value: unknown, field: string): string {
  const result = text(value, field);
  if (!result) invalid(field);
  return result;
}
export function nullableText(value: unknown, field: string): string | null {
  if (value === null) return null;
  const result = text(value, field);
  return result || null;
}
export function finite(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(field);
  return value;
}
export function money(value: unknown, field: string): number {
  const result = finite(value, field);
  if (result < 0 || Math.abs(Math.round(result * 100) - result * 100) > 1e-8) invalid(field);
  return result;
}
export function positiveMoney(value: unknown, field: string): number {
  const result = money(value, field);
  if (result <= 0) invalid(field);
  return result;
}
export function integer(value: unknown, field: string, minimum: number, maximum: number): number {
  const result = finite(value, field);
  if (!Number.isInteger(result) || result < minimum || result > maximum) invalid(field);
  return result;
}
export function ratio(value: unknown): number {
  const result = finite(value, 'attendanceRatio');
  if (result < 0 || result > 1) invalid('attendanceRatio');
  return result;
}
export function oneOf<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) invalid(field);
  return value as T;
}
export function iso(value: unknown, field: string): string {
  const result = requiredString(value, field);
  if (Number.isNaN(Date.parse(result))) invalid(field);
  return new Date(result).toISOString();
}
export function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
export function invalid(field: string, reason?: string): never {
  throw new BadRequestException({
    code: 'IMPORT_CORRECTION_INVALID',
    messageKey: 'imports.correctionInvalid',
    field,
    ...(reason ? { reason } : {}),
  });
}
