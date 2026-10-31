import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { z } from 'zod';

const callbackScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);

const transactionSchema = z
  .object({
    amount_cents: callbackScalar,
    created_at: callbackScalar,
    currency: callbackScalar,
    error_occured: callbackScalar,
    has_parent_transaction: callbackScalar,
    id: callbackScalar,
    integration_id: callbackScalar,
    is_3d_secure: callbackScalar,
    is_auth: callbackScalar,
    is_capture: callbackScalar,
    is_refunded: callbackScalar,
    is_standalone_payment: callbackScalar,
    is_voided: callbackScalar,
    owner: callbackScalar,
    pending: callbackScalar,
    success: callbackScalar,
    order: z
      .object({
        id: callbackScalar,
        merchant_order_id: callbackScalar.optional(),
      })
      .passthrough(),
    source_data: z
      .object({
        pan: callbackScalar,
        sub_type: callbackScalar,
        type: callbackScalar,
      })
      .passthrough(),
  })
  .passthrough();

const callbackSchema = z
  .object({
    type: z.string().optional(),
    obj: transactionSchema,
  })
  .passthrough();

export type PaymobTransaction = z.infer<typeof transactionSchema>;
export type PaymobCallback = z.infer<typeof callbackSchema>;

const hmacFields = [
  'amount_cents',
  'created_at',
  'currency',
  'error_occured',
  'has_parent_transaction',
  'id',
  'integration_id',
  'is_3d_secure',
  'is_auth',
  'is_capture',
  'is_refunded',
  'is_standalone_payment',
  'is_voided',
  'order.id',
  'owner',
  'pending',
  'source_data.pan',
  'source_data.sub_type',
  'source_data.type',
  'success',
] as const;

export function parsePaymobCallback(input: unknown): PaymobCallback {
  return callbackSchema.parse(input);
}

export function paymobHmacMessage(transaction: PaymobTransaction): string {
  const values: Record<(typeof hmacFields)[number], z.infer<typeof callbackScalar> | undefined> = {
    amount_cents: transaction.amount_cents,
    created_at: transaction.created_at,
    currency: transaction.currency,
    error_occured: transaction.error_occured,
    has_parent_transaction: transaction.has_parent_transaction,
    id: transaction.id,
    integration_id: transaction.integration_id,
    is_3d_secure: transaction.is_3d_secure,
    is_auth: transaction.is_auth,
    is_capture: transaction.is_capture,
    is_refunded: transaction.is_refunded,
    is_standalone_payment: transaction.is_standalone_payment,
    is_voided: transaction.is_voided,
    'order.id': transaction.order.id,
    owner: transaction.owner,
    pending: transaction.pending,
    'source_data.pan': transaction.source_data.pan,
    'source_data.sub_type': transaction.source_data.sub_type,
    'source_data.type': transaction.source_data.type,
    success: transaction.success,
  };
  return hmacFields.map((field) => scalar(values[field])).join('');
}

export function signPaymobCallback(transaction: PaymobTransaction, secret: string): string {
  return createHmac('sha512', secret).update(paymobHmacMessage(transaction)).digest('hex');
}

export function verifyPaymobCallback(
  transaction: PaymobTransaction,
  suppliedHmac: string,
  secret: string,
): boolean {
  if (!/^[a-f\d]{128}$/i.test(suppliedHmac)) return false;
  const expected = Buffer.from(signPaymobCallback(transaction, secret), 'hex');
  const supplied = Buffer.from(suppliedHmac, 'hex');
  return expected.length === supplied.length && timingSafeEqual(expected, supplied);
}

export function paymobBoolean(value: unknown): boolean {
  return value === true || value === 1 || String(value).toLowerCase() === 'true';
}

export function egpToPiasters(amount: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) throw new Error('Invalid EGP amount');
  const [whole = '', fraction = ''] = amount.split('.');
  const result = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')));
  if (!Number.isSafeInteger(result) || result <= 0) throw new Error('Invalid EGP amount');
  return result;
}

export function encryptPaymobSecret(value: string, encodedKey: string): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((item) => item.toString('base64url')).join('.');
}

export function decryptPaymobSecret(value: string, encodedKey: string): string {
  const [ivValue, tagValue, encryptedValue, extra] = value.split('.');
  if (!ivValue || !tagValue || !encryptedValue || extra) throw new Error('Invalid ciphertext');
  const iv = Buffer.from(ivValue, 'base64url');
  const tag = Buffer.from(tagValue, 'base64url');
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(encodedKey), iv, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedValue, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

function decodeKey(encodedKey: string): Buffer {
  const key = Buffer.from(encodedKey, 'base64');
  if (key.length !== 32) throw new Error('PAYMOB_CHECKOUT_ENCRYPTION_KEY must be 32-byte base64');
  return key;
}

function scalar(value: z.infer<typeof callbackScalar> | undefined): string {
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return value === null || value === undefined ? '' : String(value);
}
