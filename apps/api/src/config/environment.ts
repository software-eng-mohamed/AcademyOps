import { z } from 'zod';
import { enforceInternalConnectorUrl, enforceSecureUrl } from './environment-url-policy';

const blankAsUndefined = (value: unknown): unknown => (value === '' ? undefined : value);
const optionalSecret = z.preprocess(blankAsUndefined, z.string().min(1).optional());
const optionalLongSecret = z.preprocess(blankAsUndefined, z.string().min(32).optional());
const optionalMetricsToken = z.preprocess(
  blankAsUndefined,
  z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/)
    .optional(),
);
const optionalUrl = z.preprocess(blankAsUndefined, z.string().url().optional());
const optionalPaymobMethodIds = z.preprocess(
  blankAsUndefined,
  z
    .string()
    .regex(/^\d+(,\d+)*$/)
    .optional(),
);
const base64EncryptionKey = z
  .string()
  .refine((value) => Buffer.from(value, 'base64').length === 32, {
    message: 'Encryption key must be 32-byte base64',
  });
const optionalBase64EncryptionKey = z.preprocess(blankAsUndefined, base64EncryptionKey.optional());
const optionalPaymobEncryptionKey = z.preprocess(blankAsUndefined, base64EncryptionKey.optional());
const optionalPath = z.preprocess(blankAsUndefined, z.string().min(1).optional());
const optionalEmail = z.preprocess(blankAsUndefined, z.string().email().optional());
const optionalPort = z.preprocess(
  blankAsUndefined,
  z.coerce.number().int().min(1).max(65_535).optional(),
);
const optionalBoolean = z.preprocess((value) => {
  if (value === '') return undefined;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}, z.boolean().optional());
const optionalSmtpHost = z.preprocess(
  blankAsUndefined,
  z
    .string()
    .trim()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/)
    .optional(),
);
const optionalHeaderText = z.preprocess(
  blankAsUndefined,
  z
    .string()
    .trim()
    .min(1)
    .max(100)
    .refine((value) => !/[\r\n]/.test(value))
    .optional(),
);
const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    SERVICE_ROLE: z.enum(['api', 'worker']).default('api'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
    WORKER_METRICS_PORT: z.coerce.number().int().min(1).max(65535).default(9464),
    CLAMAV_MODE: z.enum(['disabled', 'clamd']).optional(),
    CLAMAV_HOST: optionalSmtpHost,
    CLAMAV_PORT: z.coerce.number().int().min(1).max(65_535).default(3_310),
    CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(500).max(15_000).default(5_000),
    TRUSTED_PROXY_IP: z.ipv4().optional(),
    WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().min(1),
    SESSION_PEPPER: optionalLongSecret,
    QR_HMAC_SECRET: optionalLongSecret,
    FILE_SIGNING_SECRET: optionalLongSecret,
    MFA_ENCRYPTION_KEY: optionalLongSecret,
    MFA_RECOVERY_PEPPER: optionalLongSecret,
    METRICS_TOKEN: optionalMetricsToken,
    OTP_CONNECTOR_INTERNAL_TOKEN: optionalMetricsToken,
    OTP_CONNECTOR_URL: optionalUrl,
    PASSWORD_RESET_PEPPER: optionalLongSecret,
    PHONE_OTP_PEPPER: optionalLongSecret,
    ACTION_TOKEN_ENCRYPTION_KEY: z.string().min(32),
    WHATSAPP_AUTH_ENCRYPTION_KEY: optionalBase64EncryptionKey,
    LEGACY_ARCHIVE_KEY: z.string().min(32).optional(),
    PAYMOB_BASE_URL: z.string().url().default('https://accept.paymob.com'),
    PAYMOB_SECRET_KEY: optionalSecret,
    PAYMOB_PUBLIC_KEY: optionalSecret,
    PAYMOB_HMAC_SECRET: optionalSecret,
    PAYMOB_PAYMENT_METHOD_IDS: optionalPaymobMethodIds,
    PAYMOB_NOTIFICATION_URL: optionalUrl,
    PAYMOB_REDIRECTION_URL: optionalUrl,
    PAYMOB_CHECKOUT_ENCRYPTION_KEY: optionalPaymobEncryptionKey,
    SMTP_HOST: optionalSmtpHost,
    SMTP_PORT: optionalPort.default(587),
    SMTP_SECURE: optionalBoolean.default(false),
    SMTP_REQUIRE_TLS: optionalBoolean.default(true),
    SMTP_TLS_SERVERNAME: optionalSmtpHost,
    SMTP_USERNAME: optionalSecret,
    SMTP_PASSWORD: optionalSecret,
    SMTP_FROM_EMAIL: optionalEmail,
    SMTP_FROM_NAME: optionalHeaderText.default('AcademyOps'),
    SMTP_RETURN_PATH: optionalEmail,
    R2_ENDPOINT: optionalUrl,
    R2_ACCESS_KEY_ID: optionalSecret,
    R2_SECRET_ACCESS_KEY: optionalSecret,
    R2_BUCKET: optionalSecret,
    PRIVATE_FILE_STORAGE_ROOT: optionalPath,
  })
  .superRefine((environment, context) => {
    if (environment.NODE_ENV !== 'production') return;
    const required = [
      'R2_ENDPOINT',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
      'R2_BUCKET',
    ] as const;
    for (const field of required) {
      if (environment[field]) continue;
      context.addIssue({
        code: 'custom',
        path: [field],
        message: `${field} is required in production`,
      });
    }
    if (!environment.METRICS_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['METRICS_TOKEN'],
        message: 'METRICS_TOKEN is required in production',
      });
    }
    if (!environment.OTP_CONNECTOR_INTERNAL_TOKEN) {
      context.addIssue({
        code: 'custom',
        path: ['OTP_CONNECTOR_INTERNAL_TOKEN'],
        message: 'OTP_CONNECTOR_INTERNAL_TOKEN is required in production',
      });
    }
    if (environment.SERVICE_ROLE === 'worker') {
      const smtpRequired = [
        'SMTP_HOST',
        'SMTP_USERNAME',
        'SMTP_PASSWORD',
        'SMTP_FROM_EMAIL',
        'SMTP_RETURN_PATH',
      ] as const;
      for (const field of smtpRequired) {
        if (environment[field]) continue;
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for the production worker`,
        });
      }
      if (!environment.SMTP_SECURE && !environment.SMTP_REQUIRE_TLS) {
        context.addIssue({
          code: 'custom',
          path: ['SMTP_REQUIRE_TLS'],
          message: 'Production SMTP must use implicit TLS or require STARTTLS',
        });
      }
      if (!environment.OTP_CONNECTOR_URL) {
        context.addIssue({
          code: 'custom',
          path: ['OTP_CONNECTOR_URL'],
          message: 'OTP_CONNECTOR_URL is required for the production worker',
        });
      } else {
        enforceInternalConnectorUrl(environment.OTP_CONNECTOR_URL, context);
      }
    }
    if (!!environment.SMTP_USERNAME !== !!environment.SMTP_PASSWORD) {
      context.addIssue({
        code: 'custom',
        path: ['SMTP_PASSWORD'],
        message: 'SMTP_USERNAME and SMTP_PASSWORD must be configured together',
      });
    }
    if (environment.SERVICE_ROLE === 'api') {
      const apiRequired = [
        'SESSION_PEPPER',
        'QR_HMAC_SECRET',
        'FILE_SIGNING_SECRET',
        'MFA_ENCRYPTION_KEY',
        'MFA_RECOVERY_PEPPER',
        'PASSWORD_RESET_PEPPER',
        'PHONE_OTP_PEPPER',
        'WHATSAPP_AUTH_ENCRYPTION_KEY',
        'LEGACY_ARCHIVE_KEY',
        'PAYMOB_SECRET_KEY',
        'PAYMOB_PUBLIC_KEY',
        'PAYMOB_HMAC_SECRET',
        'PAYMOB_PAYMENT_METHOD_IDS',
        'PAYMOB_NOTIFICATION_URL',
        'PAYMOB_REDIRECTION_URL',
        'PAYMOB_CHECKOUT_ENCRYPTION_KEY',
        'CLAMAV_HOST',
        'TRUSTED_PROXY_IP',
      ] as const;
      for (const field of apiRequired) {
        if (environment[field]) continue;
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} is required for the production API`,
        });
      }
      if (environment.CLAMAV_MODE !== 'clamd') {
        context.addIssue({
          code: 'custom',
          path: ['CLAMAV_MODE'],
          message: 'CLAMAV_MODE must be clamd for the production API',
        });
      }
    }
    enforceSecureUrl(environment.WEB_ORIGIN, 'WEB_ORIGIN', true, context);
    enforceSecureUrl(environment.PAYMOB_BASE_URL, 'PAYMOB_BASE_URL', false, context);
    if (new URL(environment.PAYMOB_BASE_URL).hostname !== 'accept.paymob.com') {
      context.addIssue({
        code: 'custom',
        path: ['PAYMOB_BASE_URL'],
        message: 'PAYMOB_BASE_URL must use the official accept.paymob.com host',
      });
    }
    if (environment.PAYMOB_NOTIFICATION_URL) {
      enforceSecureUrl(
        environment.PAYMOB_NOTIFICATION_URL,
        'PAYMOB_NOTIFICATION_URL',
        false,
        context,
      );
    }
    if (environment.PAYMOB_REDIRECTION_URL) {
      enforceSecureUrl(
        environment.PAYMOB_REDIRECTION_URL,
        'PAYMOB_REDIRECTION_URL',
        false,
        context,
      );
    }
    if (environment.R2_ENDPOINT) {
      enforceSecureUrl(environment.R2_ENDPOINT, 'R2_ENDPOINT', false, context);
    }
    const secretFields = [
      'SESSION_PEPPER',
      'QR_HMAC_SECRET',
      'FILE_SIGNING_SECRET',
      'MFA_ENCRYPTION_KEY',
      'MFA_RECOVERY_PEPPER',
      'METRICS_TOKEN',
      'OTP_CONNECTOR_INTERNAL_TOKEN',
      'PASSWORD_RESET_PEPPER',
      'PHONE_OTP_PEPPER',
      'ACTION_TOKEN_ENCRYPTION_KEY',
      'WHATSAPP_AUTH_ENCRYPTION_KEY',
      'LEGACY_ARCHIVE_KEY',
    ] as const;
    const seen = new Map<string, string>();
    for (const field of secretFields) {
      const value = environment[field];
      if (!value) continue;
      const duplicate = seen.get(value);
      if (duplicate) {
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must not reuse ${duplicate}`,
        });
      } else {
        seen.set(value, field);
      }
    }
  });

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}
