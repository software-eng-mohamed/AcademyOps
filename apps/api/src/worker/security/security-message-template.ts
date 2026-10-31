import { escapeHtml } from '../notifications/session-notification-email';

export type SecurityEmailContent = { subject: string; html: string; text: string };
type SecurityMessageLocale = 'ar' | 'en';

export function passwordResetEmail(
  resetUrl: string,
  expiresAt: Date,
  locale: SecurityMessageLocale,
): SecurityEmailContent {
  const copy = passwordResetCopy[locale];
  const expiry = formatCairo(expiresAt, locale);
  const safeUrl = escapeHtml(resetUrl);
  const html = [
    `<div lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`,
    `<h1>${escapeHtml(copy.heading)}</h1>`,
    `<p>${escapeHtml(copy.instruction)}</p>`,
    `<p><a href="${safeUrl}">${escapeHtml(copy.action)}</a></p>`,
    `<p>${escapeHtml(copy.expiryLabel)}: ${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(copy.ignored)}</p>`,
    '</div>',
  ].join('');
  const text = [
    copy.instruction,
    `${copy.action}: ${resetUrl}`,
    `${copy.expiryLabel}: ${expiry}`,
    copy.ignored,
  ].join('\n');
  return { subject: copy.subject, html, text };
}

export function phoneOtpEmail(
  code: string,
  expiresAt: Date,
  locale: SecurityMessageLocale,
): SecurityEmailContent {
  const copy = phoneOtpCopy[locale];
  const expiry = formatCairo(expiresAt, locale);
  const safeCode = escapeHtml(code);
  const html = [
    `<div lang="${locale}" dir="${locale === 'ar' ? 'rtl' : 'ltr'}">`,
    `<h1>${escapeHtml(copy.heading)}</h1>`,
    `<p>${escapeHtml(copy.instruction)}</p>`,
    `<p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; margin: 16px 0;">${safeCode}</p>`,
    `<p>${escapeHtml(copy.expiryLabel)}: ${escapeHtml(expiry)}</p>`,
    `<p>${escapeHtml(copy.warning)}</p>`,
    '</div>',
  ].join('');
  const text = [
    copy.instruction,
    `${copy.codeLabel}: ${code}`,
    `${copy.expiryLabel}: ${expiry}`,
    copy.warning,
  ].join('\n');
  return { subject: copy.subject, html, text };
}

export function phoneOtpWhatsapp(code: string): string {
  return `Your AcademyOps sign-in code is: ${code}. It expires in 5 minutes. Do not share it.`;
}

export function passwordResetWhatsapp(
  resetUrl: string,
  expiresAt: Date,
  locale: SecurityMessageLocale,
): string {
  const copy = passwordResetCopy[locale];
  return [
    copy.whatsappInstruction,
    resetUrl,
    `${copy.expiryLabel}: ${formatCairo(expiresAt, locale)}.`,
    copy.ignored,
  ].join('\n');
}

const passwordResetCopy = {
  ar: {
    action:
      '\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    expiryLabel:
      '\u062a\u0646\u062a\u0647\u064a \u0635\u0644\u0627\u062d\u064a\u0629 \u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637 \u0641\u064a',
    heading:
      '\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    ignored:
      '\u0625\u0630\u0627 \u0644\u0645 \u062a\u0637\u0644\u0628 \u0647\u0630\u0627 \u0627\u0644\u062a\u063a\u064a\u064a\u0631\u060c \u064a\u0645\u0643\u0646\u0643 \u062a\u062c\u0627\u0647\u0644 \u0627\u0644\u0631\u0633\u0627\u0644\u0629.',
    instruction:
      '\u0627\u0633\u062a\u062e\u062f\u0645 \u0627\u0644\u0631\u0627\u0628\u0637 \u0627\u0644\u062a\u0627\u0644\u064a \u0644\u0627\u062e\u062a\u064a\u0627\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 \u062c\u062f\u064a\u062f\u0629.',
    subject:
      '\u062a\u063a\u064a\u064a\u0631 \u0643\u0644\u0645\u0629 \u0627\u0644\u0645\u0631\u0648\u0631',
    whatsappInstruction:
      '\u063a\u064a\u0651\u0631 \u0643\u0644\u0645\u0629 \u0645\u0631\u0648\u0631 AcademyOps \u0628\u0627\u0633\u062a\u062e\u062f\u0627\u0645 \u0647\u0630\u0627 \u0627\u0644\u0631\u0627\u0628\u0637:',
  },
  en: {
    action: 'Reset password',
    expiryLabel: 'This link expires at',
    heading: 'Reset your password',
    ignored: 'If you did not request this, you can ignore this message.',
    instruction: 'Use the following link to choose a new password.',
    subject: 'Reset your password',
    whatsappInstruction: 'Reset your AcademyOps password using this link:',
  },
} as const;

const phoneOtpCopy = {
  ar: {
    codeLabel: '\u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642',
    expiryLabel:
      '\u062a\u0646\u062a\u0647\u064a \u0635\u0644\u0627\u062d\u064a\u0629 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0641\u064a',
    heading: '\u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642',
    instruction:
      '\u0627\u0633\u062a\u062e\u062f\u0645 \u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062a\u0627\u0644\u064a \u0644\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644 \u0625\u0644\u0649 AcademyOps:',
    subject:
      '\u0631\u0645\u0632 \u0627\u0644\u062a\u062d\u0642\u0642 \u0627\u0644\u062e\u0627\u0635 \u0628\u0643',
    warning:
      '\u0644\u0627 \u062a\u0634\u0627\u0631\u0643 \u0647\u0630\u0627 \u0627\u0644\u0631\u0645\u0632 \u0645\u0639 \u0623\u064a \u0634\u062e\u0635.',
  },
  en: {
    codeLabel: 'Verification code',
    expiryLabel: 'This code expires at',
    heading: 'Verification code',
    instruction: 'Use the following verification code to sign in to AcademyOps:',
    subject: 'Your AcademyOps verification code',
    warning: 'Do not share this code with anyone.',
  },
} as const;

function formatCairo(value: Date, locale: SecurityMessageLocale): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG' : 'en-GB', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'full',
    timeStyle: 'short',
  }).format(value);
}
