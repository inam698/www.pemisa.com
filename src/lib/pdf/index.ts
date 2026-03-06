/**
 * PDF Generation Service
 * Generate PDF reports using PDFKit
 */

import PDFDocument from "pdfkit";
import { Writable } from "stream";

export async function generateVouchersPDF(vouchers: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).text("Pimisa Voucher System", { align: "center" });
    doc.fontSize(16).text("Voucher Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });
    doc.moveDown(2);

    // Summary
    const total = vouchers.length;
    const used = vouchers.filter((v) => v.status === "USED").length;
    const unused = vouchers.filter((v) => v.status === "UNUSED").length;
    const expired = vouchers.filter((v) => v.status === "EXPIRED").length;

    doc.fontSize(12).text("Summary:", { underline: true });
    doc.fontSize(10);
    doc.text(`Total Vouchers: ${total}`);
    doc.text(`Redeemed: ${used}`);
    doc.text(`Unused: ${unused}`);
    doc.text(`Expired: ${expired}`);
    doc.moveDown(2);

    // Table Header
    doc.fontSize(12).text("Voucher Details:", { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const colWidths = { name: 120, phone: 80, code: 60, amount: 50, status: 60, date: 80 };
    let xPos = 50;

    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Name", xPos, tableTop, { width: colWidths.name });
    xPos += colWidths.name;
    doc.text("Phone", xPos, tableTop, { width: colWidths.phone });
    xPos += colWidths.phone;
    doc.text("Code", xPos, tableTop, { width: colWidths.code });
    xPos += colWidths.code;
    doc.text("Amount", xPos, tableTop, { width: colWidths.amount });
    xPos += colWidths.amount;
    doc.text("Status", xPos, tableTop, { width: colWidths.status });
    xPos += colWidths.status;
    doc.text("Redeemed", xPos, tableTop, { width: colWidths.date });

    doc.moveDown(0.5);
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Table Rows
    doc.font("Helvetica").fontSize(8);
    vouchers.slice(0, 50).forEach((voucher) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }

      const rowY = doc.y;
      xPos = 50;

      doc.text(voucher.name.substring(0, 20), xPos, rowY, { width: colWidths.name });
      xPos += colWidths.name;
      doc.text(voucher.phone, xPos, rowY, { width: colWidths.phone });
      xPos += colWidths.phone;
      doc.text(voucher.voucherCode, xPos, rowY, { width: colWidths.code });
      xPos += colWidths.code;
      doc.text(`K${voucher.amount}`, xPos, rowY, { width: colWidths.amount });
      xPos += colWidths.amount;
      doc.text(voucher.status, xPos, rowY, { width: colWidths.status });
      xPos += colWidths.status;
      doc.text(
        voucher.redeemedAt ? new Date(voucher.redeemedAt).toLocaleDateString() : "-",
        xPos,
        rowY,
        { width: colWidths.date }
      );

      doc.moveDown(0.8);
    });

    if (vouchers.length > 50) {
      doc.moveDown();
      doc.fontSize(9).fillColor("#666666").text(`... and ${vouchers.length - 50} more vouchers`, { align: "center" });
    }

    // Footer
    doc.fontSize(8).text(
      `Page ${doc.bufferedPageRange().count} | Pimisa Voucher System`,
      50,
      doc.page.height - 50,
      { align: "center" }
    );

    doc.end();
  });
}

export async function generateStationReportPDF(stations: any[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Header
    doc.fontSize(20).text("Station Performance Report", { align: "center" });
    doc.moveDown();
    doc.fontSize(10).text(`Generated: ${new Date().toLocaleString()}`, { align: "right" });
    doc.moveDown(2);

    // Table
    doc.fontSize(12).text("Station Details:", { underline: true });
    doc.moveDown(0.5);

    const tableTop = doc.y;
    const colWidths = { station: 150, location: 120, vouchers: 70, redeemed: 70, amount: 80 };
    let xPos = 50;

    doc.fontSize(9).font("Helvetica-Bold");
    doc.text("Station", xPos, tableTop, { width: colWidths.station });
    xPos += colWidths.station;
    doc.text("Location", xPos, tableTop, { width: colWidths.location });
    xPos += colWidths.location;
    doc.text("Vouchers", xPos, tableTop, { width: colWidths.vouchers });
    xPos += colWidths.vouchers;
    doc.text("Redeemed", xPos, tableTop, { width: colWidths.redeemed });
    xPos += colWidths.redeemed;
    doc.text("Total Amount", xPos, tableTop, { width: colWidths.amount });

    doc.moveDown(0.5);
    doc.strokeColor("#aaaaaa").lineWidth(1).moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown(0.5);

    // Rows
    doc.font("Helvetica").fontSize(8);
    stations.forEach((station: any) => {
      if (doc.y > 700) {
        doc.addPage();
        doc.y = 50;
      }

      const rowY = doc.y;
      xPos = 50;

      doc.text(station.stationName, xPos, rowY, { width: colWidths.station });
      xPos += colWidths.station;
      doc.text(station.location, xPos, rowY, { width: colWidths.location });
      xPos += colWidths.location;
      doc.text(String(station.totalVouchers || 0), xPos, rowY, { width: colWidths.vouchers });
      xPos += colWidths.vouchers;
      doc.text(String(station.redeemed || 0), xPos, rowY, { width: colWidths.redeemed });
      xPos += colWidths.redeemed;
      doc.text(`K${station.totalAmount || 0}`, xPos, rowY, { width: colWidths.amount });

      doc.moveDown(0.8);
    });

    doc.end();
  });
}
