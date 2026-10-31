import { randomBytes } from 'node:crypto';

if (process.env.NODE_ENV !== 'test')
  throw new Error('Test environment generation requires NODE_ENV=test');
for (const key of [
  'SESSION_PEPPER',
  'QR_HMAC_SECRET',
  'FILE_SIGNING_SECRET',
  'MFA_ENCRYPTION_KEY',
  'MFA_RECOVERY_PEPPER',
  'PASSWORD_RESET_PEPPER',
  'PHONE_OTP_PEPPER',
  'ACTION_TOKEN_ENCRYPTION_KEY',
  'LEGACY_ARCHIVE_KEY',
])
  console.log(`${key}=${randomBytes(32).toString('hex')}`);
console.log(`WHATSAPP_AUTH_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`);
