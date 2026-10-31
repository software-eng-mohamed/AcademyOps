import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const keyFromSecret = (secret: string) => createHash('sha256').update(secret).digest();

export function encryptLegacyArchive(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFromSecret(secret), iv, { authTagLength: 16 });
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return ['v1', iv, cipher.getAuthTag(), encrypted]
    .map((part) => (typeof part === 'string' ? part : part.toString('base64url')))
    .join('.');
}

export function decryptLegacyArchive(ciphertext: string, secret: string): string {
  const [version, iv, tag, encrypted, extra] = ciphertext.split('.');
  if (version !== 'v1' || !iv || !tag || !encrypted || extra)
    throw new Error('Invalid legacy archive ciphertext');
  const ivBytes = Buffer.from(iv, 'base64url');
  const tagBytes = Buffer.from(tag, 'base64url');
  if (ivBytes.length !== 12 || tagBytes.length !== 16)
    throw new Error('Invalid legacy archive ciphertext');
  const decipher = createDecipheriv('aes-256-gcm', keyFromSecret(secret), ivBytes, {
    authTagLength: 16,
  });
  decipher.setAuthTag(tagBytes);
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const legacyArchiveHash = (plaintext: string): string =>
  createHash('sha256').update(plaintext).digest('hex');
