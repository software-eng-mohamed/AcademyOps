import { describe, expect, it } from 'vitest';
import { validateEnvironment } from '../src/config/environment';

const required = {
  DATABASE_URL: 'postgresql://localhost/test',
  REDIS_URL: 'redis://localhost:6379',
  SESSION_PEPPER: 'session-pepper-at-least-32-bytes-long',
  QR_HMAC_SECRET: 'q'.repeat(40),
  FILE_SIGNING_SECRET: 'file-secret-at-least-32-bytes-long',
  MFA_ENCRYPTION_KEY: 'm'.repeat(40),
  MFA_RECOVERY_PEPPER: 'mfa-recovery-pepper-at-least-32-bytes',
  PASSWORD_RESET_PEPPER: 'password-reset-pepper-at-least-32-bytes',
  PHONE_OTP_PEPPER: 'phone-otp-pepper-at-least-32-bytes-long',
  ACTION_TOKEN_ENCRYPTION_KEY: 'action-token-encryption-at-least-32-bytes',
  WHATSAPP_AUTH_ENCRYPTION_KEY: Buffer.alloc(32, 5).toString('base64'),
};

const productionServices = {
  WEB_ORIGIN: 'https://academy.example.com',
  CLAMAV_MODE: 'clamd',
  CLAMAV_HOST: 'clamav',
  TRUSTED_PROXY_IP: '172.30.240.2',
  LEGACY_ARCHIVE_KEY: 'legacy-archive-key-at-least-32-bytes-long',
  METRICS_TOKEN: 'a'.repeat(64),
  OTP_CONNECTOR_INTERNAL_TOKEN: 'b'.repeat(64),
  OTP_CONNECTOR_URL: 'http://otp-connector:3002',
  PAYMOB_SECRET_KEY: 'paymob-secret',
  PAYMOB_PUBLIC_KEY: 'paymob-public',
  PAYMOB_HMAC_SECRET: 'paymob-hmac',
  PAYMOB_PAYMENT_METHOD_IDS: '1234',
  PAYMOB_NOTIFICATION_URL: 'https://api.example.com/api/v1/webhooks/paymob/transaction',
  PAYMOB_REDIRECTION_URL: 'https://academy.example.com/ar/dashboard/student',
  PAYMOB_CHECKOUT_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  SMTP_HOST: 'mail.example.com',
  SMTP_PORT: '587',
  SMTP_SECURE: 'false',
  SMTP_REQUIRE_TLS: 'true',
  SMTP_USERNAME: 'postal-user',
  SMTP_PASSWORD: 'postal-password',
  SMTP_FROM_EMAIL: 'no-reply@example.com',
  SMTP_FROM_NAME: 'AcademyOps',
  SMTP_RETURN_PATH: 'bounce@example.com',
  R2_ENDPOINT: 'https://r2.example.com',
  R2_ACCESS_KEY_ID: 'r2-access',
  R2_SECRET_ACCESS_KEY: 'r2-secret',
  R2_BUCKET: 'private-certificates',
};

const productionWorker = {
  NODE_ENV: 'production',
  SERVICE_ROLE: 'worker',
  DATABASE_URL: required.DATABASE_URL,
  REDIS_URL: required.REDIS_URL,
  WEB_ORIGIN: productionServices.WEB_ORIGIN,
  METRICS_TOKEN: productionServices.METRICS_TOKEN,
  OTP_CONNECTOR_INTERNAL_TOKEN: productionServices.OTP_CONNECTOR_INTERNAL_TOKEN,
  OTP_CONNECTOR_URL: 'http://otp-connector:3002',
  ACTION_TOKEN_ENCRYPTION_KEY: required.ACTION_TOKEN_ENCRYPTION_KEY,
  SMTP_HOST: productionServices.SMTP_HOST,
  SMTP_PORT: productionServices.SMTP_PORT,
  SMTP_SECURE: productionServices.SMTP_SECURE,
  SMTP_REQUIRE_TLS: productionServices.SMTP_REQUIRE_TLS,
  SMTP_USERNAME: productionServices.SMTP_USERNAME,
  SMTP_PASSWORD: productionServices.SMTP_PASSWORD,
  SMTP_FROM_EMAIL: productionServices.SMTP_FROM_EMAIL,
  SMTP_FROM_NAME: productionServices.SMTP_FROM_NAME,
  SMTP_RETURN_PATH: productionServices.SMTP_RETURN_PATH,
  R2_ENDPOINT: productionServices.R2_ENDPOINT,
  R2_ACCESS_KEY_ID: productionServices.R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY: productionServices.R2_SECRET_ACCESS_KEY,
  R2_BUCKET: productionServices.R2_BUCKET,
} as const;

describe('environment validation', () => {
  it('allows Paymob to remain disabled in a copied .env.example', () => {
    const environment = validateEnvironment({
      ...required,
      PAYMOB_SECRET_KEY: '',
      PAYMOB_PUBLIC_KEY: '',
      PAYMOB_HMAC_SECRET: '',
      PAYMOB_PAYMENT_METHOD_IDS: '',
      PAYMOB_CHECKOUT_ENCRYPTION_KEY: '',
    });
    expect(environment.PAYMOB_SECRET_KEY).toBeUndefined();
    expect(environment.PAYMOB_PAYMENT_METHOD_IDS).toBeUndefined();
  });

  it('rejects a Paymob checkout encryption key that is not exactly 32 bytes', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        PAYMOB_CHECKOUT_ENCRYPTION_KEY: Buffer.from('too-short').toString('base64'),
      }),
    ).toThrow();
  });

  it('requires complete encrypted SMTP configuration in the production worker', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        SERVICE_ROLE: 'worker',
        SMTP_HOST: undefined,
        SMTP_USERNAME: undefined,
        SMTP_PASSWORD: undefined,
        SMTP_FROM_EMAIL: undefined,
        SMTP_RETURN_PATH: undefined,
      }),
    ).toThrow(/SMTP_HOST/);
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        SERVICE_ROLE: 'worker',
        SMTP_SECURE: 'false',
        SMTP_REQUIRE_TLS: 'false',
      }),
    ).toThrow(/must use implicit TLS or require STARTTLS/);
    expect(
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        SERVICE_ROLE: 'worker',
      }).SMTP_FROM_EMAIL,
    ).toBe('no-reply@example.com');
  });

  it('allows SMTP to remain disabled outside production', () => {
    const environment = validateEnvironment({
      ...required,
      NODE_ENV: 'test',
      SMTP_HOST: '',
      SMTP_USERNAME: '',
      SMTP_PASSWORD: '',
      SMTP_FROM_EMAIL: '',
    });
    expect(environment.SMTP_HOST).toBeUndefined();
    expect(environment.SMTP_FROM_EMAIL).toBeUndefined();
  });

  it('requires one shared metrics token for every production service role', () => {
    for (const serviceRole of ['api', 'worker'] as const) {
      expect(() =>
        validateEnvironment({
          ...required,
          ...productionServices,
          NODE_ENV: 'production',
          SERVICE_ROLE: serviceRole,
          METRICS_TOKEN: undefined,
        }),
      ).toThrow(/METRICS_TOKEN/);
    }
  });

  it('accepts only a 64-character hexadecimal metrics token', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        METRICS_TOKEN: 'not-a-deployment-token-at-least-32-bytes-long',
      }),
    ).toThrow(/METRICS_TOKEN/);
  });

  it('does not require worker-only SMTP credentials in the production API', () => {
    const api = validateEnvironment({
      ...required,
      ...productionServices,
      NODE_ENV: 'production',
      SERVICE_ROLE: 'api',
      SMTP_HOST: undefined,
      SMTP_USERNAME: undefined,
      SMTP_PASSWORD: undefined,
      SMTP_FROM_EMAIL: undefined,
      SMTP_RETURN_PATH: undefined,
    });
    expect(api.SERVICE_ROLE).toBe('api');
  });

  it('never permits the production API to disable malware scanning', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        SERVICE_ROLE: 'api',
        CLAMAV_MODE: 'disabled',
      }),
    ).toThrow(/CLAMAV_MODE/);
  });

  it('requires an exact 32-byte WhatsApp auth encryption key', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        WHATSAPP_AUTH_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64'),
      }),
    ).toThrow(/Encryption key/);
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        WHATSAPP_AUTH_ENCRYPTION_KEY: undefined,
      }),
    ).toThrow(/WHATSAPP_AUTH_ENCRYPTION_KEY/);
  });

  it('rejects insecure production origins, incomplete storage, and reused secrets', () => {
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        WEB_ORIGIN: 'http://academy.example.com/path',
      }),
    ).toThrow(/WEB_ORIGIN/);
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        R2_BUCKET: undefined,
      }),
    ).toThrow(/R2_BUCKET/);
    expect(() =>
      validateEnvironment({
        ...required,
        ...productionServices,
        NODE_ENV: 'production',
        QR_HMAC_SECRET: required.SESSION_PEPPER,
      }),
    ).toThrow(/must not reuse SESSION_PEPPER/);
  });

  it('accepts a production worker with no API-only secrets', () => {
    const worker = validateEnvironment(productionWorker);
    expect(worker.SERVICE_ROLE).toBe('worker');
    expect(worker.SESSION_PEPPER).toBeUndefined();
    expect(worker.QR_HMAC_SECRET).toBeUndefined();
    expect(worker.FILE_SIGNING_SECRET).toBeUndefined();
    expect(worker.MFA_ENCRYPTION_KEY).toBeUndefined();
    expect(worker.MFA_RECOVERY_PEPPER).toBeUndefined();
    expect(worker.PASSWORD_RESET_PEPPER).toBeUndefined();
    expect(worker.PHONE_OTP_PEPPER).toBeUndefined();
    expect(worker.WHATSAPP_AUTH_ENCRYPTION_KEY).toBeUndefined();
    expect(worker.OTP_CONNECTOR_URL).toBe('http://otp-connector:3002');
  });

  it('accepts only the private connector service origin in production workers', () => {
    for (const OTP_CONNECTOR_URL of [
      'https://otp-connector:3002',
      'http://attacker.example.com:3002',
      'http://otp-connector:3002/path',
      'http://user:pass@otp-connector:3002',
    ]) {
      expect(() => validateEnvironment({ ...productionWorker, OTP_CONNECTOR_URL })).toThrow(
        /OTP_CONNECTOR_URL/,
      );
    }
  });
});
