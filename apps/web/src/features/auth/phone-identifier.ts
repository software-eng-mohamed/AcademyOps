const EGYPT_COUNTRY_CODE = '+20';

const easternArabicDigits: Record<string, string> = {
  '٠': '0',
  '١': '1',
  '٢': '2',
  '٣': '3',
  '٤': '4',
  '٥': '5',
  '٦': '6',
  '٧': '7',
  '٨': '8',
  '٩': '9',
  '۰': '0',
  '۱': '1',
  '۲': '2',
  '۳': '3',
  '۴': '4',
  '۵': '5',
  '۶': '6',
  '۷': '7',
  '۸': '8',
  '۹': '9',
};

function latinDigits(value: string): string {
  return value.replace(/[٠-٩۰-۹]/g, (digit) => easternArabicDigits[digit] ?? '').replace(/\D/g, '');
}

export function normalizeEgyptPhoneLocalInput(value: string): string {
  let digits = latinDigits(value);
  if (digits.startsWith('0020')) digits = digits.slice(4);
  else if (digits.startsWith('20') && digits.length > 10) digits = digits.slice(2);
  if (digits.startsWith('0') && digits.length > 1) digits = digits.slice(1);
  return digits.slice(0, 10);
}

export function formatEgyptPhoneLocalInput(value: string): string {
  const digits = normalizeEgyptPhoneLocalInput(value);
  return [digits.slice(0, 2), digits.slice(2, 6), digits.slice(6, 10)].filter(Boolean).join(' ');
}

export function isValidEgyptPhoneLocalInput(value: string): boolean {
  return /^1[0125]\d{8}$/.test(normalizeEgyptPhoneLocalInput(value));
}

export function toEgyptPhoneIdentifier(value: string): string {
  return `${EGYPT_COUNTRY_CODE}${normalizeEgyptPhoneLocalInput(value)}`;
}
