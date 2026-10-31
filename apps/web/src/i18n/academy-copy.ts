import type { Locale } from '@/lib/locales';
import { arPart1 } from './academy-copy.ar-1';
import { arPart2 } from './academy-copy.ar-2';
import { enPart1 } from './academy-copy.en-1';
import { enPart2 } from './academy-copy.en-2';
import { demoErrorCopy } from './demo-error-copy';

const en = { ...enPart1, ...enPart2, ...demoErrorCopy.en };
export type AcademyCopy = { [K in keyof typeof en]: string };
export type AcademyCopyKey = keyof AcademyCopy;
const ar: AcademyCopy = { ...arPart1, ...arPart2, ...demoErrorCopy.ar };
export function getAcademyCopy(locale: Locale): AcademyCopy {
  return locale === 'ar' ? ar : en;
}
export function academyLabel(copy: AcademyCopy, key: string) {
  return copy[key as AcademyCopyKey] ?? key;
}
