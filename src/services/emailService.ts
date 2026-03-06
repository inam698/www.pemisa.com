/**
 * Email Notification Service
 * Sends emails for vouchers, password resets, etc.
 */

import nodemailer from "nodemailer";

// Configure from environment variables
const EMAIL_USER = process.env.EMAIL_USER || "noreply@pimisa.com";
const EMAIL_PASSWORD = process.env.EMAIL_PASSWORD || "test-password";
const EMAIL_HOST = process.env.EMAIL_HOST || "smtp.gmail.com";
const EMAIL_PORT = parseInt(process.env.EMAIL_PORT || "587");

let transporter: nodemailer.Transporter;

// Initialize transporter
try {
  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465, // true for 465, false for other ports
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASSWORD,
    },
  });
} catch (error) {
  console.warn("Email service not configured. Notifications will be logged only.");
}

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send generic email
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    if (!transporter) {
      console.log(`[EMAIL] ${options.subject} to ${options.to}`, options.html);
      return false;
    }

    await transporter.sendMail({
      from: EMAIL_USER,
      ...options,
    });
    return true;
  } catch (error) {
    console.error("Failed to send email:", error);
    return false;
  }
}

/**
 * Send voucher creation email
 */
export async function sendVoucherEmail(
  email: string,
  phone: string,
  voucherCode: string,
  amount: number,
  expiryDate: string
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Your Cooking Oil Voucher</h2>
      <p>Dear Beneficiary,</p>
      <p>Your cooking oil voucher has been generated. Please keep this code safe.</p>
      <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
        <p><strong>Voucher Code:</strong> ${voucherCode}</p>
        <p><strong>Amount:</strong> K${amount}</p>
        <p><strong>Phone:</strong> ${phone}</p>
        <p><strong>Expires:</strong> ${new Date(expiryDate).toLocaleDateString()}</p>
      </div>
      <p>To redeem your voucher:</p>
      <ol>
        <li>Visit your nearest distribution station</li>
        <li>Provide your phone number and voucher code</li>
        <li>Collect your cooking oil</li>
      </ol>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        This is an automated message. Do not reply to this email.
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `Pimisa Voucher Code: ${voucherCode}`,
    html,
  });
}

/**
 * Send password reset email
 */
export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Password Reset Request</h2>
      <p>Hello,</p>
      <p>We received a request to reset your password. Click the link below:</p>
      <p>
        <a href="${resetLink}" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; display: inline-block;">
          Reset Password
        </a>
      </p>
      <p>This link expires in 1 hour.</p>
      <p>If you didn't request this, you can safely ignore this email.</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Pimisa Voucher System
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Password Reset Request",
    html,
  });
}

/**
 * Send SMS resend confirmation email
 */
export async function sendSmsResendEmail(email: string, phone: string, voucherCode: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>Voucher SMS Resent</h2>
      <p>Hello,</p>
      <p>The voucher SMS for ${phone} has been resent.</p>
      <p><strong>Voucher Code:</strong> ${voucherCode}</p>
      <p>If the beneficiary still hasn't received the SMS, contact support.</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Pimisa Voucher System
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: "Voucher SMS Resent",
    html,
  });
}

/**
 * Send report email to admin
 */
export async function sendReportEmail(
  email: string,
  reportType: string,
  fileName: string,
  summary: string
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px;">
      <h2>${reportType} Report</h2>
      <p>Hello,</p>
      <p>Your scheduled ${reportType.toLowerCase()} report is ready.</p>
      <p><strong>File:</strong> ${fileName}</p>
      <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 20px 0;">
        ${summary}
      </div>
      <p>Please find the attached report.</p>
      <p style="color: #999; font-size: 12px; margin-top: 30px;">
        Pimisa Voucher System - Automated Report
      </p>
    </div>
  `;

  return sendEmail({
    to: email,
    subject: `${reportType} Report - ${new Date().toLocaleDateString()}`,
    html,
  });
}
