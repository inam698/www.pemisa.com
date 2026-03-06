/**
 * Two-Factor Authentication Service
 * Using TOTP (Time-based One-Time Password)
 */

import speakeasy from "speakeasy";
import qrcode from "qrcode";

export interface TwoFactorSecret {
  secret: string;
  otpauthUrl: string;
  qrCodeDataUrl: string;
}

/**
 * Generate a new 2FA secret for a user
 */
export async function generate2FASecret(email: string): Promise<TwoFactorSecret> {
  const secret = speakeasy.generateSecret({
    name: `Pimisa (${email})`,
    issuer: "Pimisa Voucher System",
    length: 32,
  });

  const qrCodeDataUrl = await qrcode.toDataURL(secret.otpauth_url || "");

  return {
    secret: secret.base32,
    otpauthUrl: secret.otpauth_url || "",
    qrCodeDataUrl,
  };
}

/**
 * Verify a TOTP token
 */
export function verify2FAToken(secret: string, token: string): boolean {
  return speakeasy.totp.verify({
    secret,
    encoding: "base32",
    token,
    window: 2, // Allow 2 steps (60 seconds) of time drift
  });
}

/**
 * Generate a backup code (for account recovery)
 */
export function generateBackupCodes(count: number = 10): string[] {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = Array.from({ length: 8 }, () =>
      Math.floor(Math.random() * 36).toString(36)
    ).join("");
    codes.push(code.toUpperCase());
  }
  return codes;
}
