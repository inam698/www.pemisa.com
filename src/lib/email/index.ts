/**
 * Email Service
 * Send transactional emails using Nodemailer
 */

import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(to: string, subject: string, html: string) {
  if (!process.env.SMTP_USER) {
    console.warn("SMTP not configured, email not sent:", { to, subject });
    return { success: false, message: "SMTP not configured" };
  }

  const fromName = process.env.SMTP_FROM_NAME || "Pimisa Voucher System";
  const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      html,
    });
    return { success: true };
  } catch (error) {
    console.error("Email send error:", error);
    return { success: false, error };
  }
}

export async function sendVoucherEmail(name: string, email: string, voucherCode: string, amount: number, expiryDate: Date) {
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #2563eb; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; }
        .voucher-code { font-size: 32px; font-weight: bold; color: #2563eb; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 8px; }
        .amount { font-size: 24px; color: #16a34a; font-weight: bold; }
        .footer { background: #f3f4f6; padding: 15px; text-align: center; font-size: 12px; color: #6b7280; border-radius: 0 0 8px 8px; }
        .info-row { margin: 15px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🛢️ Pimisa Cooking Oil Voucher</h1>
        </div>
        <div class="content">
          <p>Dear <strong>${name}</strong>,</p>
          <p>Your cooking oil voucher has been issued. Please use the code below to redeem your voucher at any authorized station.</p>
          
          <div class="voucher-code">${voucherCode}</div>
          
          <div class="info-row">
            <strong>Voucher Amount:</strong> <span class="amount">K${amount}</span>
          </div>
          <div class="info-row">
            <strong>Valid Until:</strong> ${expiryDate.toLocaleDateString()}
          </div>
          
          <p style="margin-top: 30px;"><strong>How to Redeem:</strong></p>
          <ol>
            <li>Visit any authorized Pimisa distribution station</li>
            <li>Provide your phone number and voucher code above</li>
            <li>Receive your cooking oil</li>
          </ol>
          
          <p style="color: #dc2626; font-weight: bold;">⚠️ This voucher expires in 7 days. Please redeem it before ${expiryDate.toLocaleDateString()}.</p>
        </div>
        <div class="footer">
          <p>Pimisa Voucher System | Do not share this code with anyone</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, "Your Pimisa Cooking Oil Voucher", html);
}

export async function sendPasswordResetEmail(email: string, resetLink: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto; background: #f9fafb; padding: 30px; border-radius: 8px;">
        <h2 style="color: #2563eb;">Password Reset Request</h2>
        <p>You requested a password reset for your Pimisa account.</p>
        <p>Click the button below to reset your password:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px;">This link expires in 1 hour. If you didn't request this, please ignore this email.</p>
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, "Password Reset - Pimisa Voucher System", html);
}

export async function sendReportEmail(email: string, reportType: string, attachmentPath?: string) {
  const html = `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; padding: 20px;">
      <div style="max-width: 500px; margin: 0 auto;">
        <h2>Scheduled Report: ${reportType}</h2>
        <p>Your scheduled ${reportType} report is ready.</p>
        <p>Report generated on: ${new Date().toLocaleString()}</p>
        ${attachmentPath ? '<p>Please find the report attached.</p>' : ''}
      </div>
    </body>
    </html>
  `;

  return sendEmail(email, `Scheduled ${reportType} Report`, html);
}
