/**
 * Encryption Service
 * Encrypts and decrypts sensitive data at rest
 */

import crypto from "crypto";

function getEncryptionKeyFromEnv(): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error(
      "CRITICAL: ENCRYPTION_KEY environment variable is not set. " +
      "The application cannot start without a secure encryption key. " +
      "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  if (key.length < 16) {
    throw new Error(
      "CRITICAL: ENCRYPTION_KEY must be at least 16 characters long for security."
    );
  }
  return key;
}

let _encryptionKey: string | null = null;
function getEncryptionKeySafe(): string {
  if (!_encryptionKey) {
    _encryptionKey = getEncryptionKeyFromEnv();
  }
  return _encryptionKey;
}

const ALGORITHM = "aes-256-cbc";

/**
 * Derive a proper 32-byte key from the encryption key
 */
function getEncryptionKey(): Buffer {
  const key = getEncryptionKeySafe();
  if (key.length === 32) {
    return Buffer.from(key);
  }
  // Hash the key to get 32 bytes
  return crypto.createHash("sha256").update(key).digest();
}

/**
 * Encrypt sensitive data
 */
export function encrypt(data: string): string {
  try {
    const key = getEncryptionKey();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(data, "utf-8", "hex");
    encrypted += cipher.final("hex");

    // Return IV + encrypted data
    return iv.toString("hex") + ":" + encrypted;
  } catch (error) {
    console.error("Encryption error:", error);
    throw error;
  }
}

/**
 * Decrypt sensitive data
 */
export function decrypt(encrypted: string): string {
  try {
    const key = getEncryptionKey();
    const [ivHex, encryptedHex] = encrypted.split(":");
    const iv = Buffer.from(ivHex, "hex");

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf-8");
    decrypted += decipher.final("utf-8");

    return decrypted;
  } catch (error) {
    console.error("Decryption error:", error);
    throw error;
  }
}

/**
 * Generate a random encryption key (for setup)
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Hash data for comparison (one-way)
 */
export function hashData(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * Encrypt JSON object
 */
export function encryptJson<T extends Record<string, any>>(data: T): T {
  const encrypted: T = {} as T;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && (key.includes("phone") || key.includes("email") || key.includes("secret"))) {
      encrypted[key as keyof T] = encrypt(value) as T[keyof T];
    } else {
      encrypted[key as keyof T] = value;
    }
  }
  return encrypted;
}

/**
 * Decrypt JSON object
 */
export function decryptJson<T extends Record<string, any>>(data: T): T {
  const decrypted: T = {} as T;
  for (const [key, value] of Object.entries(data)) {
    if (typeof value === "string" && (key.includes("phone") || key.includes("email") || key.includes("secret"))) {
      try {
        decrypted[key as keyof T] = decrypt(value) as T[keyof T];
      } catch {
        decrypted[key as keyof T] = value as T[keyof T];
      }
    } else {
      decrypted[key as keyof T] = value as T[keyof T];
    }
  }
  return decrypted;
}
