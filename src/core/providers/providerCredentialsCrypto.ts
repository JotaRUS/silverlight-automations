import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { env } from '../../config/env';
import { AppError } from '../errors/appError';

export interface EncryptedCredentialEnvelope {
  v: 1;
  iv: string;
  tag: string;
  ciphertext: string;
}

function resolveAesKey(): Buffer {
  return createHash('sha256').update(env.PROVIDER_ENCRYPTION_SECRET).digest();
}

function toBuffer(value: string, encoding: BufferEncoding): Buffer {
  try {
    return Buffer.from(value, encoding);
  } catch (error) {
    throw new AppError('Invalid encrypted credential payload', 500, 'provider_credentials_invalid', {
      reason: error instanceof Error ? error.message : 'unknown'
    });
  }
}

export function encryptProviderCredentials(credentials: Record<string, unknown>): EncryptedCredentialEnvelope {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', resolveAesKey(), iv);
  const plaintext = JSON.stringify(credentials);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: authTag.toString('base64'),
    ciphertext: encrypted.toString('base64')
  };
}

export function decryptProviderCredentials(
  envelope: unknown
): Record<string, unknown> {
  if (typeof envelope !== 'object' || envelope === null) {
    throw new AppError('Invalid encrypted credential payload', 500, 'provider_credentials_invalid');
  }

  const parsedEnvelope = envelope as Partial<EncryptedCredentialEnvelope>;
  if (parsedEnvelope.v !== 1 || !parsedEnvelope.iv || !parsedEnvelope.tag || !parsedEnvelope.ciphertext) {
    throw new AppError('Invalid encrypted credential envelope', 500, 'provider_credentials_invalid');
  }

  const decipher = createDecipheriv(
    'aes-256-gcm',
    resolveAesKey(),
    toBuffer(parsedEnvelope.iv, 'base64')
  );
  decipher.setAuthTag(toBuffer(parsedEnvelope.tag, 'base64'));

  const decrypted = Buffer.concat([
    decipher.update(toBuffer(parsedEnvelope.ciphertext, 'base64')),
    decipher.final()
  ]);

  const parsed = JSON.parse(decrypted.toString('utf8')) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new AppError('Invalid decrypted credential payload', 500, 'provider_credentials_invalid');
  }

  return parsed as Record<string, unknown>;
}

