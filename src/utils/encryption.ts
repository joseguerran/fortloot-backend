import crypto from 'crypto';
import { config } from '../config';

/**
 * Encryption utility for sensitive data (device auth credentials)
 * Uses AES-256-GCM for authenticated encryption
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits
const AUTH_TAG_LENGTH = 16; // 128 bits
const SALT_LENGTH = 64;

/**
 * Get or generate encryption key from environment
 */
function getEncryptionKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;

  if (!envKey) {
    throw new Error(
      'ENCRYPTION_KEY not found in environment variables. Generate one with: openssl rand -hex 32'
    );
  }

  // Key should be 32 bytes (64 hex characters) for AES-256
  if (envKey.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be 32 bytes (64 hex characters)');
  }

  return Buffer.from(envKey, 'hex');
}

/**
 * Encrypt a string value
 * Returns: iv:authTag:encrypted (all in hex)
 */
export function encrypt(text: string): string {
  if (!text) {
    throw new Error('Cannot encrypt empty text');
  }

  try {
    const key = getEncryptionKey();

    // Generate random IV
    const iv = crypto.randomBytes(IV_LENGTH);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Get auth tag
    const authTag = cipher.getAuthTag();

    // Return format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Decrypt an encrypted value
 * Input format: iv:authTag:encrypted (all in hex)
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    throw new Error('Cannot decrypt empty data');
  }

  try {
    const key = getEncryptionKey();

    // Parse encrypted data
    const parts = encryptedData.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted data format. Expected: iv:authTag:encrypted');
    }

    const [ivHex, authTagHex, encryptedHex] = parts;

    // Convert from hex
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(encrypted);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate a secure random encryption key
 * Use this to generate ENCRYPTION_KEY for .env
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a value (one-way, for comparison only)
 * Useful for storing passwords or API keys
 */
export function hash(text: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const hash = crypto.pbkdf2Sync(text, salt, 100000, 64, 'sha512');

  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Verify a hashed value
 */
export function verifyHash(text: string, hashedValue: string): boolean {
  try {
    const [saltHex, originalHash] = hashedValue.split(':');
    const salt = Buffer.from(saltHex, 'hex');
    const hash = crypto.pbkdf2Sync(text, salt, 100000, 64, 'sha512');

    return hash.toString('hex') === originalHash;
  } catch {
    return false;
  }
}

/**
 * Check if a string is encrypted (matches our format)
 */
export function isEncrypted(value: string): boolean {
  if (!value || typeof value !== 'string') {
    return false;
  }

  const parts = value.split(':');
  if (parts.length !== 3) {
    return false;
  }

  // Check if all parts are valid hex strings of expected lengths
  const [iv, authTag, encrypted] = parts;

  const isValidHex = (str: string) => /^[0-9a-f]+$/i.test(str);

  return (
    isValidHex(iv) &&
    iv.length === IV_LENGTH * 2 && // hex is 2 chars per byte
    isValidHex(authTag) &&
    authTag.length === AUTH_TAG_LENGTH * 2 &&
    isValidHex(encrypted) &&
    encrypted.length > 0
  );
}

/**
 * Mask a sensitive value for display
 * Shows only first and last 4 characters
 */
export function maskValue(value: string, showChars = 4): string {
  if (!value || value.length <= showChars * 2) {
    return '***';
  }

  const start = value.substring(0, showChars);
  const end = value.substring(value.length - showChars);

  return `${start}${'*'.repeat(Math.max(8, value.length - showChars * 2))}${end}`;
}

export default {
  encrypt,
  decrypt,
  generateEncryptionKey,
  hash,
  verifyHash,
  isEncrypted,
  maskValue,
};
