import { describe, expect, it } from 'vitest';
import {
  passwordResetEmail,
  passwordResetWhatsapp,
  phoneOtpWhatsapp,
} from '../src/worker/security/security-message-template';

describe('security message templates', () => {
  it('escapes the reset link and renders English Cairo expiry', () => {
    const content = passwordResetEmail(
      'https://web.example/en/reset-password?token=<secret>&organizationCode=PLG',
      new Date('2026-08-11T10:00:00.000Z'),
      'en',
    );
    expect(content.subject).toBe('Reset your password');
    expect(content.html).toContain('13:00');
    expect(content.html).toContain('token=&lt;secret&gt;&amp;organizationCode=PLG');
    expect(content.html).not.toContain('token=<secret>');
  });

  it('renders security messages in the requested locale', () => {
    const email = passwordResetEmail(
      'https://web.example/en/reset-password?token=secret',
      new Date('2026-08-11T10:00:00.000Z'),
      'en',
    );
    expect(email.html).toContain('lang="en" dir="ltr"');
    expect(email.subject).toBe('Reset your password');
    expect(
      passwordResetWhatsapp(
        'https://web.example/en/reset-password#token=secret',
        new Date('2026-08-11T10:00:00.000Z'),
        'en',
      ),
    ).toContain('reset-password#token=secret');
    const arabic = passwordResetEmail(
      'https://web.example/ar/reset-password#token=secret',
      new Date('2026-08-11T10:00:00.000Z'),
      'ar',
    );
    expect(arabic.html).toContain('lang="ar" dir="rtl"');
    expect(arabic.subject).toBe('تغيير كلمة المرور');
    expect(phoneOtpWhatsapp('123456')).toContain('sign-in code');
  });
});
