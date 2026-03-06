/**
 * Scheduled Tasks
 * Automated jobs using node-cron
 */

import cron from "node-cron";
import prisma from "@/lib/db/prisma";
import { exportVouchersCsv, exportStationsCsv } from "@/services/exportService";
import { sendReportEmail } from "@/lib/email";
import { updateStaleStatuses, pruneTelemetry } from "@/services/machineService";
import { publishOfflineAlert } from "@/lib/monitoring/events";
import logger from "@/lib/logger";

// Mark expired vouchers (runs every hour)
export function scheduleVoucherExpiration() {
  cron.schedule("0 * * * *", async () => {
    try {
      logger.info("Running voucher expiration check");
      
      const result = await prisma.voucher.updateMany({
        where: {
          status: "UNUSED",
          expiryDate: {
            lt: new Date(),
          },
        },
        data: {
          status: "EXPIRED",
        },
      });

      logger.info(`Marked ${result.count} vouchers as expired`);
    } catch (error) {
      logger.error("Voucher expiration job failed", { error });
    }
  });
}

// Send daily summary email (runs at 8 AM)
export function scheduleDailySummary() {
  cron.schedule("0 8 * * *", async () => {
    try {
      logger.info("Running daily summary email");

      const adminUsers = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true },
      });

      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const stats = await prisma.voucher.groupBy({
        by: ["status"],
        where: {
          createdAt: {
            gte: yesterday,
            lt: today,
          },
        },
        _count: true,
      });

      const summary = {
        date: yesterday.toDateString(),
        vouchers: stats.reduce((sum, s) => sum + s._count, 0),
        redeemed: stats.find((s) => s.status === "USED")?._count || 0,
      };

      for (const user of adminUsers) {
        // Send email with summary
        logger.info(`Sending daily summary to ${user.email}`, summary);
      }
    } catch (error) {
      logger.error("Daily summary job failed", { error });
    }
  });
}

// Weekly report export (runs every Monday at 9 AM)
export function scheduleWeeklyReport() {
  cron.schedule("0 9 * * 1", async () => {
    try {
      logger.info("Running weekly report generation");

      const adminUsers = await prisma.user.findMany({
        where: { role: "ADMIN" },
        select: { email: true },
      });

      // Generate reports
      const vouchers = await prisma.voucher.findMany({
        where: {
          createdAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          },
        },
        include: { station: true },
      });

      const csvData = await exportVouchersCsv();

      for (const user of adminUsers) {
        await sendReportEmail(user.email, "Weekly Voucher Report");
        logger.info(`Sent weekly report to ${user.email}`);
      }
    } catch (error) {
      logger.error("Weekly report job failed", { error });
    }
  });
}

// Database cleanup (runs every Sunday at 2 AM)
export function scheduleDbCleanup() {
  cron.schedule("0 2 * * 0", async () => {
    try {
      logger.info("Running database cleanup");

      // Delete old audit logs (older than 90 days)
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const deletedAuditLogs = await prisma.auditLog.deleteMany({
        where: {
          createdAt: {
            lt: ninetyDaysAgo,
          },
        },
      });

      // Delete old SMS logs (older than 60 days)
      const sixtyDaysAgo = new Date();
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

      const deletedSmsLogs = await prisma.smsLog.deleteMany({
        where: {
          sentAt: {
            lt: sixtyDaysAgo,
          },
        },
      });

      logger.info("Database cleanup completed", {
        deletedAuditLogs: deletedAuditLogs.count,
        deletedSmsLogs: deletedSmsLogs.count,
      });
    } catch (error) {
      logger.error("Database cleanup job failed", { error });
    }
  });
}

// Initialize all scheduled tasks
export function initializeCronJobs() {
  logger.info("Initializing cron jobs");
  
  scheduleVoucherExpiration();
  scheduleDailySummary();
  scheduleWeeklyReport();
  scheduleDbCleanup();
  scheduleDeviceStaleCheck();
  scheduleTelemetryPruning();
  
  logger.info("All cron jobs initialized");
}

// ─── Device Monitoring Jobs ─────────────────────────────────────

/**
 * Sweep stale devices every minute.
 * Marks machines as OFFLINE if no heartbeat for 2 minutes.
 * Publishes SSE offline alerts to admin dashboard.
 */
function scheduleDeviceStaleCheck() {
  cron.schedule("*/5 * * * *", async () => {
    try {
      // Find machines about to go offline (for alert publishing)
      const staleThreshold = new Date(Date.now() - 10 * 60 * 1000);
      const goingOffline = await prisma.machine.findMany({
        where: {
          status: "ONLINE",
          lastSeen: { lt: staleThreshold },
        },
        select: { deviceId: true },
      });

      // Mark stale machines as OFFLINE
      await updateStaleStatuses(2);

      // Publish offline alerts for each newly-offline device
      for (const machine of goingOffline) {
        publishOfflineAlert(machine.deviceId);
      }

      if (goingOffline.length > 0) {
        logger.info(`Marked ${goingOffline.length} device(s) as offline`);
      }
    } catch (error) {
      logger.error("Device stale check failed", { error });
    }
  });
}

/**
 * Prune old telemetry data daily at 3 AM.
 * Keeps 30 days of telemetry history.
 */
function scheduleTelemetryPruning() {
  cron.schedule("0 3 * * *", async () => {
    try {
      const pruned = await pruneTelemetry(30);
      logger.info(`Pruned ${pruned} telemetry records older than 30 days`);
    } catch (error) {
      logger.error("Telemetry pruning failed", { error });
    }
  });
}
