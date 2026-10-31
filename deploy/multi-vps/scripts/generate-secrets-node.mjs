import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function randHex(bytes) {
  return randomBytes(bytes).toString('hex');
}

function randB64(bytes) {
  return randomBytes(bytes).toString('base64');
}

const baseDir = resolve(process.cwd(), 'deploy/multi-vps');

const PG_PASSWORD = randHex(32);
const PG_APP_PASSWORD = randHex(32);
const PG_MIGRATE_PASSWORD = randHex(32);
const PG_EXPORTER_PASSWORD = randHex(32);
const REDIS_PASSWORD = randHex(32);

const SESSION_PEPPER = randHex(32);
const QR_HMAC_SECRET = randHex(32);
const FILE_SIGNING_SECRET = randHex(32);
const MFA_ENCRYPTION_KEY = randHex(32);
const MFA_RECOVERY_PEPPER = randHex(32);
const PASSWORD_RESET_PEPPER = randHex(32);
const PHONE_OTP_PEPPER = randHex(32);
const ACTION_TOKEN_ENCRYPTION_KEY = randHex(32);
const OTP_CONNECTOR_INTERNAL_TOKEN = randHex(32);
const LEGACY_ARCHIVE_KEY = randHex(32);
const METRICS_TOKEN = randHex(32);

const GRAFANA_ADMIN_PASSWORD = randHex(16);
const WHATSAPP_KEY = randB64(32);
const PAYMOB_KEY = randB64(32);

// 1. VPS 1
const vps1Template = readFileSync(
  resolve(baseDir, 'vps1-frontend-monitoring/runtime.env.example'),
  'utf8',
);
const vps1Env = vps1Template
  .replace('METRICS_TOKEN=GENERATE_64_HEX_CHARS', `METRICS_TOKEN=${METRICS_TOKEN}`)
  .replace(
    'GRAFANA_ADMIN_PASSWORD=GENERATE_STRONG_PASSWORD',
    `GRAFANA_ADMIN_PASSWORD=${GRAFANA_ADMIN_PASSWORD}`,
  );
writeFileSync(resolve(baseDir, 'vps1-frontend-monitoring/runtime.env'), vps1Env, { mode: 0o600 });
console.log('Created VPS 1 runtime.env');

// 2. VPS 2
const vps2Template = readFileSync(
  resolve(baseDir, 'vps2-backend-worker/runtime.env.example'),
  'utf8',
);
const vps2Env = vps2Template
  .replaceAll('GENERATE_APP_PASSWORD', PG_APP_PASSWORD)
  .replaceAll('GENERATE_MIGRATE_PASSWORD', PG_MIGRATE_PASSWORD)
  .replaceAll('GENERATE_REDIS_PASSWORD', REDIS_PASSWORD)
  .replace('METRICS_TOKEN=GENERATE_METRICS_TOKEN', `METRICS_TOKEN=${METRICS_TOKEN}`)
  .replace(
    'ACTION_TOKEN_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS',
    `ACTION_TOKEN_ENCRYPTION_KEY=${ACTION_TOKEN_ENCRYPTION_KEY}`,
  )
  .replace('SESSION_PEPPER=GENERATE_64_HEX_CHARS', `SESSION_PEPPER=${SESSION_PEPPER}`)
  .replace('QR_HMAC_SECRET=GENERATE_64_HEX_CHARS', `QR_HMAC_SECRET=${QR_HMAC_SECRET}`)
  .replace(
    'FILE_SIGNING_SECRET=GENERATE_64_HEX_CHARS',
    `FILE_SIGNING_SECRET=${FILE_SIGNING_SECRET}`,
  )
  .replace('MFA_ENCRYPTION_KEY=GENERATE_64_HEX_CHARS', `MFA_ENCRYPTION_KEY=${MFA_ENCRYPTION_KEY}`)
  .replace(
    'MFA_RECOVERY_PEPPER=GENERATE_64_HEX_CHARS',
    `MFA_RECOVERY_PEPPER=${MFA_RECOVERY_PEPPER}`,
  )
  .replace(
    'PASSWORD_RESET_PEPPER=GENERATE_64_HEX_CHARS',
    `PASSWORD_RESET_PEPPER=${PASSWORD_RESET_PEPPER}`,
  )
  .replace('PHONE_OTP_PEPPER=GENERATE_64_HEX_CHARS', `PHONE_OTP_PEPPER=${PHONE_OTP_PEPPER}`)
  .replace(
    'OTP_CONNECTOR_INTERNAL_TOKEN=GENERATE_64_HEX_CHARS',
    `OTP_CONNECTOR_INTERNAL_TOKEN=${OTP_CONNECTOR_INTERNAL_TOKEN}`,
  )
  .replace('LEGACY_ARCHIVE_KEY=GENERATE_64_HEX_CHARS', `LEGACY_ARCHIVE_KEY=${LEGACY_ARCHIVE_KEY}`)
  .replace(
    'WHATSAPP_AUTH_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64',
    `WHATSAPP_AUTH_ENCRYPTION_KEY=${WHATSAPP_KEY}`,
  )
  .replace(
    'PAYMOB_CHECKOUT_ENCRYPTION_KEY=GENERATE_32_BYTES_BASE64',
    `PAYMOB_CHECKOUT_ENCRYPTION_KEY=${PAYMOB_KEY}`,
  );
writeFileSync(resolve(baseDir, 'vps2-backend-worker/runtime.env'), vps2Env, { mode: 0o600 });
console.log('Created VPS 2 runtime.env');

// 3. VPS 3
const vps3Template = readFileSync(
  resolve(baseDir, 'vps3-database-redis/runtime.env.example'),
  'utf8',
);
const vps3Env = vps3Template
  .replace('POSTGRES_PASSWORD=GENERATE_ADMIN_PASSWORD', `POSTGRES_PASSWORD=${PG_PASSWORD}`)
  .replace(
    'POSTGRES_APP_PASSWORD=GENERATE_APP_PASSWORD',
    `POSTGRES_APP_PASSWORD=${PG_APP_PASSWORD}`,
  )
  .replace(
    'POSTGRES_MIGRATE_PASSWORD=GENERATE_MIGRATE_PASSWORD',
    `POSTGRES_MIGRATE_PASSWORD=${PG_MIGRATE_PASSWORD}`,
  )
  .replace(
    'POSTGRES_EXPORTER_PASSWORD=GENERATE_EXPORTER_PASSWORD',
    `POSTGRES_EXPORTER_PASSWORD=${PG_EXPORTER_PASSWORD}`,
  )
  .replace('REDIS_PASSWORD=GENERATE_REDIS_PASSWORD', `REDIS_PASSWORD=${REDIS_PASSWORD}`);
writeFileSync(resolve(baseDir, 'vps3-database-redis/runtime.env'), vps3Env, { mode: 0o600 });
console.log('Created VPS 3 runtime.env');

console.log('\n=== Cluster Secrets Generated Successfully ===');
console.log(
  'Retrieve the Grafana administrator password from vps1-frontend-monitoring/runtime.env.',
);
