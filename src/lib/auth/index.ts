/**
 * JWT Authentication Utilities
 * Handles token generation, verification, and password hashing.
 */

import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { JwtPayload } from "@/types";
import { cacheGet, cacheSet } from "@/lib/cache/redis";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret === "fallback-secret-change-me") {
    throw new Error(
      "CRITICAL: JWT_SECRET environment variable is not set or is using the default value. " +
      "Generate a secure secret with: node -e \"console.log(require('crypto').randomBytes(64).toString('hex'))\""
    );
  }
  if (secret.length < 32) {
    throw new Error("CRITICAL: JWT_SECRET must be at least 32 characters long.");
  }
  return secret;
}

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

/**
 * Generates a JWT token for an authenticated user.
 */
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

/**
 * Verifies and decodes a JWT token.
 * Returns the decoded payload or null if invalid/expired/blacklisted.
 */
export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload & { iat?: number; exp?: number };

    // Check if token has been blacklisted (logout)
    const isBlacklisted = await cacheGet(`blacklist:${token}`);
    if (isBlacklisted) {
      return null;
    }

    return decoded;
  } catch {
    return null;
  }
}

/**
 * Blacklists a JWT token (used on logout).
 * Token is stored in cache until its natural expiry time.
 */
export async function blacklistToken(token: string): Promise<void> {
  try {
    const decoded = jwt.decode(token) as { exp?: number } | null;
    if (!decoded?.exp) return;

    // Store in blacklist until the token would naturally expire
    const ttlSeconds = decoded.exp - Math.floor(Date.now() / 1000);
    if (ttlSeconds > 0) {
      await cacheSet(`blacklist:${token}`, "1", ttlSeconds);
    }
  } catch {
    // Best effort — don't throw on blacklist failure
  }
}

/**
 * Hashes a plaintext password using bcrypt.
 * Uses a cost factor of 12 for production-grade security.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Compares a plaintext password against a bcrypt hash.
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Extracts the JWT token from the Authorization header.
 * Expects format: "Bearer <token>"
 */
export function extractTokenFromHeader(
  authHeader: string | null
): string | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
}
