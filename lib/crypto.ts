import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string (32 bytes / 256 bits).
// Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

function getKey(): Buffer {
  const hex = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex string');
  }
  return Buffer.from(hex, 'hex');
}

export interface EncryptedBlob {
  ciphertext: string; // hex
  iv: string;         // hex, 24 chars (12 bytes)
  authTag: string;    // hex, 32 chars (16 bytes)
}

export function encrypt(plaintext: string): EncryptedBlob {
  const key = getKey();
  const iv = randomBytes(12); // 96-bit IV recommended for GCM
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return {
    ciphertext: encrypted.toString('hex'),
    iv: iv.toString('hex'),
    authTag: cipher.getAuthTag().toString('hex'),
  };
}

export function decrypt(blob: EncryptedBlob): string {
  const key = getKey();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(blob.iv, 'hex'));
  decipher.setAuthTag(Buffer.from(blob.authTag, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}
