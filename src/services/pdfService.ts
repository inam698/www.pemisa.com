/**
 * PDF Report Service
 * Generates PDF reports for vouchers, stations, and audit logs
 */

import PDFDocument from "pdfkit";
import { PassThrough, Readable } from "stream";

/**
 * Generate voucher report PDF
 */
export function generateVoucherReportPdf(
  data: Array<{
    voucherCode: string;
    name: string;
    phone: string;
    amount: number;
    status: string;
    station?: string;
    redeemedAt?: string;
  }>
): Readable {
  const doc = new PDFDocument({ margin: 40 });
  const stream = new PassThrough();
  doc.pipe(stream);

  // Header
  doc.fontSize(24).font("Helvetica-Bold").text("Voucher Report", { align: "center" });
  doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  // Summary
  const used = data.filter((d) => d.status === "USED").length;
  const unused = data.filter((d) => d.status === "UNUSED").length;
  const expired = data.filter((d) => d.status === "EXPIRED").length;
  const total = data.length;
  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);

  doc.fontSize(11).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.fontSize(10).font("Helvetica");
  doc.text(`Total Vouchers: ${total}`);
  doc.text(`Redeemed: ${used}`);
  doc.text(`Unused: ${unused}`);
  doc.text(`Expired: ${expired}`);
  doc.text(`Total Amount: K${totalAmount.toLocaleString()}`);
  doc.moveDown(0.5);

  // Table header
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.fontSize(9).font("Helvetica-Bold");
  const tableY = doc.y + 5;
  doc.text("Code", 50, tableY);
  doc.text("Name", 120, tableY);
  doc.text("Phone", 220, tableY);
  doc.text("Amount", 300, tableY);
  doc.text("Status", 360, tableY);
  doc.text("Station", 420, tableY);
  doc.moveTo(40, doc.y + 15).lineTo(550, doc.y + 15).stroke();
  doc.moveDown(0.8);

  // Table rows
  doc.fontSize(8).font("Helvetica");
  data.slice(0, 30).forEach((item) => {
    const y = doc.y;
    doc.text(item.voucherCode, 50, y, { width: 60 });
    doc.text(item.name, 120, y, { width: 90 });
    doc.text(item.phone, 220, y, { width: 70 });
    doc.text(`K${item.amount}`, 300, y, { width: 50 });
    doc.text(item.status, 360, y, { width: 50 });
    doc.text(item.station || "-", 420, y, { width: 100 });
    doc.moveDown(1.2);
  });

  if (data.length > 30) {
    doc.fontSize(9).text(`... and ${data.length - 30} more`, { align: "center" });
  }

  // Footer
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.fontSize(8).text("Pimisa Voucher System - Confidential", { align: "center" });

  doc.end();
  return stream;
}

/**
 * Generate station report PDF
 */
export function generateStationReportPdf(
  data: Array<{
    stationName: string;
    location: string;
    userCount: number;
    totalVouchers: number;
    redeemed: number;
    unused: number;
    expired: number;
    totalAmount: number;
  }>
): Readable {
  const doc = new PDFDocument({ margin: 40 });
  const stream = new PassThrough();
  doc.pipe(stream);

  doc.fontSize(24).font("Helvetica-Bold").text("Station Performance Report", { align: "center" });
  doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.moveDown(0.5);

  // Summary
  const totalVouchers = data.reduce((sum, d) => sum + d.totalVouchers, 0);
  const totalRedeemed = data.reduce((sum, d) => sum + d.redeemed, 0);
  const redemptionRate = ((totalRedeemed / totalVouchers) * 100).toFixed(1);

  doc.fontSize(11).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.fontSize(10).font("Helvetica");
  doc.text(`Total Stations: ${data.length}`);
  doc.text(`Total Vouchers: ${totalVouchers}`);
  doc.text(`Total Redeemed: ${totalRedeemed}`);
  doc.text(`Redemption Rate: ${redemptionRate}%`);
  doc.moveDown(0.5);

  // Table
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.fontSize(9).font("Helvetica-Bold");
  const tableY = doc.y + 5;
  doc.text("Station", 50, tableY);
  doc.text("Users", 200, tableY);
  doc.text("Redeemed", 250, tableY);
  doc.text("Unused", 330, tableY);
  doc.text("Amount", 420, tableY);
  doc.moveTo(40, doc.y + 15).lineTo(550, doc.y + 15).stroke();
  doc.moveDown(0.8);

  doc.fontSize(8).font("Helvetica");
  data.forEach((item) => {
    const y = doc.y;
    doc.text(item.stationName, 50, y, { width: 140 });
    doc.text(String(item.userCount), 200, y);
    doc.text(String(item.redeemed), 250, y);
    doc.text(String(item.unused), 330, y);
    doc.text(`K${item.totalAmount.toLocaleString()}`, 420, y);
    doc.moveDown(1.2);
  });

  // Footer
  doc.moveTo(40, doc.y).lineTo(550, doc.y).stroke();
  doc.fontSize(8).text("Pimisa Voucher System - Confidential", { align: "center" });

  doc.end();
  return stream;
}

/**
 * Generate audit log report PDF
 */
export function generateAuditReportPdf(
  data: Array<{
    action: string;
    actor: string;
    target: string;
    timestamp: string;
  }>
): Readable {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  const stream = new PassThrough();
  doc.pipe(stream);

  doc.fontSize(24).font("Helvetica-Bold").text("Audit Trail Report", { align: "center" });
  doc.fontSize(10).font("Helvetica").text(`Generated: ${new Date().toLocaleString()}`, { align: "center" });
  doc.moveTo(40, doc.y).lineTo(750, doc.y).stroke();
  doc.moveDown(0.5);

  // Summary
  doc.fontSize(11).font("Helvetica-Bold").text("Summary", { underline: true });
  doc.fontSize(10).font("Helvetica");
  doc.text(`Total Events: ${data.length}`);
  doc.moveDown(0.5);

  // Table
  doc.moveTo(40, doc.y).lineTo(750, doc.y).stroke();
  doc.fontSize(9).font("Helvetica-Bold");
  const tableY = doc.y + 5;
  doc.text("Timestamp", 50, tableY);
  doc.text("Action", 200, tableY);
  doc.text("Actor", 320, tableY);
  doc.text("Target", 450, tableY);
  doc.moveTo(40, doc.y + 15).lineTo(750, doc.y + 15).stroke();
  doc.moveDown(0.8);

  doc.fontSize(8).font("Helvetica");
  data.slice(0, 40).forEach((item) => {
    const y = doc.y;
    doc.text(new Date(item.timestamp).toLocaleString(), 50, y, { width: 140 });
    doc.text(item.action, 200, y, { width: 110 });
    doc.text(item.actor, 320, y, { width: 120 });
    doc.text(item.target, 450, y, { width: 280 });
    doc.moveDown(1);
  });

  if (data.length > 40) {
    doc.fontSize(9).text(`... and ${data.length - 40} more events`, { align: "center" });
  }

  // Footer
  doc.moveTo(40, doc.y).lineTo(750, doc.y).stroke();
  doc.fontSize(8).text("Pimisa Voucher System - Confidential", { align: "center" });

  doc.end();
  return stream;
}
