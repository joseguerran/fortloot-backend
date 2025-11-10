import bcrypt from 'bcrypt';
import crypto from 'crypto';

/**
 * Password hashing and validation utilities
 */

const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random API key
 */
export function generateApiKey(): string {
  // Generate a 32-byte random string
  const randomBytes = crypto.randomBytes(32);

  // Convert to base64 and make it URL-safe
  return randomBytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Validate password strength
 * Returns null if valid, error message if invalid
 */
export function validatePasswordStrength(password: string): string | null {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }

  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }

  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }

  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }

  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
    return 'Password must contain at least one special character';
  }

  return null;
}

/**
 * Generate a secure random password
 */
export function generateSecurePassword(length: number = 16): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';

  const allChars = uppercase + lowercase + numbers + special;

  let password = '';

  // Ensure at least one of each type
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];

  // Fill the rest randomly
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }

  // Shuffle the password
  return password
    .split('')
    .sort(() => Math.random() - 0.5)
    .join('');
}

export default {
  hashPassword,
  verifyPassword,
  generateApiKey,
  validatePasswordStrength,
  generateSecurePassword,
};
