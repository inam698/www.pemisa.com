/**
 * Two-Factor Authentication Service (TOTP)
 * Generates and validates time-based one-time passwords.
 */

import speakeasy from "speakeasy";
import QRCode from "qrcode";

/**
 * Generate TOTP secret for user
 */
export async function generateTotpSecret(email: string) {
  const secret = speakeasy.generateSecret({
    name: `Pimisa (${email})`,
    issuer: "Pimisa",
    length: 32,
  });

  // Generate QR code for scanning with authenticator app
  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    secret: secret.base32,
    qrCode,
  };
}

/**
 * Verify TOTP token
 */
export function verifyTotpToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2, // Allow 30 seconds before/after
  });
}

/**
 * Generate backup codes for account recovery
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    codes.push(code);
  }
  return codes;
}
