/**
 * Scheduled Tasks Service
 * Runs automated tasks like generating reports and sending emails
 */

import cron, { ScheduledTask } from "node-cron";
import { sendReportEmail } from "./emailService";
import { clearOldLogs } from "./errorService";
import prisma from "@/lib/db/prisma";

// Track scheduled tasks
const tasks: Map<string, ScheduledTask> = new Map();

/**
 * Initialize scheduled tasks
 */
export function initializeScheduledTasks(): void {
  console.log("Initializing scheduled tasks...");

  // Daily report at 8 AM
  scheduleTask("daily-report", "0 8 * * *", () => {
    generateDailyReport();
  });

  // Weekly report every Monday at 8 AM
  scheduleTask("weekly-report", "0 8 * * 1", () => {
    generateWeeklyReport();
  });

  // Clear old logs every day at 2 AM
  scheduleTask("cleanup-logs", "0 2 * * *", () => {
    clearOldLogs(30);
    console.log("Old logs cleared");
  });

  // Health check every hour
  scheduleTask("health-check", "0 * * * *", () => {
    performHealthCheck();
  });

  console.log("Scheduled tasks initialized");
}

/**
 * Schedule a task
 */
export function scheduleTask(name: string, cronExpression: string, callback: () => void): void {
  if (tasks.has(name)) {
    tasks.get(name)?.stop();
  }

  const task = cron.schedule(cronExpression, callback);
  tasks.set(name, task);
  console.log(`Task scheduled: ${name} (${cronExpression})`);
}

/**
 * Stop all scheduled tasks
 */
export function stopAllTasks(): void {
  tasks.forEach((task) => task.stop());
  tasks.clear();
  console.log("All scheduled tasks stopped");
}

/**
 * Generate daily report
 */
async function generateDailyReport(): Promise<void> {
  try {
    console.log("Generating daily report...");

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const stats = await prisma.voucher.groupBy({
      by: ["status"],
      _count: { id: true },
      _sum: { amount: true },
      where: {
        createdAt: {
          gte: new Date(yesterday.toDateString()),
          lt: new Date(new Date().toDateString()),
        },
      },
    });

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (admin) {
      const summary = stats.map((s: any) => `<p>${s.status}: ${s._count.id} vouchers (K${s._sum.amount || 0})</p>`).join("");

      await sendReportEmail(
        admin.email,
        "Daily Summary",
        `daily-report-${new Date().toISOString().split("T")[0]}.pdf`,
        summary
      );
    }

    console.log("Daily report generated");
  } catch (error) {
    console.error("Failed to generate daily report:", error);
  }
}

/**
 * Generate weekly report
 */
async function generateWeeklyReport(): Promise<void> {
  try {
    console.log("Generating weekly report...");

    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);

    const totalVouchers = await prisma.voucher.count({
      where: { createdAt: { gte: lastWeek } },
    });

    const redeemedVouchers = await prisma.voucher.count({
      where: { status: "USED", createdAt: { gte: lastWeek } },
    });

    const admin = await prisma.user.findFirst({
      where: { role: "ADMIN" },
    });

    if (admin) {
      const redemptionRate = totalVouchers > 0 ? ((redeemedVouchers / totalVouchers) * 100).toFixed(1) : 0;
      const summary = `
        <p>Total Vouchers: ${totalVouchers}</p>
        <p>Redeemed: ${redeemedVouchers}</p>
        <p>Redemption Rate: ${redemptionRate}%</p>
      `;

      await sendReportEmail(
        admin.email,
        "Weekly Summary",
        `weekly-report-${new Date().toISOString().split("T")[0]}.pdf`,
        summary
      );
    }

    console.log("Weekly report generated");
  } catch (error) {
    console.error("Failed to generate weekly report:", error);
  }
}

/**
 * Perform system health check
 */
async function performHealthCheck(): Promise<void> {
  try {
    // Check database connection
    await prisma.user.findFirst({ take: 1 });
    console.log("Health check: OK");
  } catch (error) {
    console.error("Health check failed:", error);
  }
}
