import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function encryptOtpChannelSecret(value: string, encodedKey: string, aad: string): string {
  const key = decodeKey(encodedKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(aad, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return [VERSION, iv, ciphertext, cipher.getAuthTag()]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptOtpChannelSecret(value: string, encodedKey: string, aad: string): string {
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error('OTP_CHANNEL_CIPHER_INVALID');
  const [, ivPart, ciphertextPart, tagPart] = parts;
  const iv = Buffer.from(ivPart!, 'base64url');
  const ciphertext = Buffer.from(ciphertextPart!, 'base64url');
  const tag = Buffer.from(tagPart!, 'base64url');
  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error('OTP_CHANNEL_CIPHER_INVALID');
  }
  const decipher = createDecipheriv('aes-256-gcm', decodeKey(encodedKey), iv, {
    authTagLength: 16,
  });
  decipher.setAAD(Buffer.from(aad, 'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

function decodeKey(value: string): Buffer {
  const key = Buffer.from(value, 'base64');
  if (key.length !== 32) throw new Error('WHATSAPP_AUTH_ENCRYPTION_KEY_INVALID');
  return key;
}
