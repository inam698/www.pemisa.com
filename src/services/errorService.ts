/**
 * Error Logging Service
 * Logs errors to file and optionally to Sentry
 */

import { appendFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const LOG_DIR = process.env.LOG_DIR || "./logs";
const ERROR_LOG_FILE = join(LOG_DIR, "errors.log");
const ACCESS_LOG_FILE = join(LOG_DIR, "access.log");

// Ensure log directory exists (graceful on read-only filesystems like Vercel)
try {
  if (!existsSync(LOG_DIR)) {
    mkdirSync(LOG_DIR, { recursive: true });
  }
} catch {
  // Read-only filesystem (e.g., Vercel serverless) — file logging will be skipped
}

export interface ErrorLog {
  timestamp: string;
  level: "ERROR" | "WARN" | "INFO";
  message: string;
  error?: string;
  userId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  userAgent?: string;
  ipAddress?: string;
  stack?: string;
}

/**
 * Log error to file
 */
export function logError(errorLog: ErrorLog): void {
  try {
    const logEntry = JSON.stringify({
      ...errorLog,
      timestamp: new Date().toISOString(),
    });

    appendFileSync(ERROR_LOG_FILE, logEntry + "\n");
  } catch (error) {
    console.error("Failed to write error log:", error);
  }
}

/**
 * Log API access
 */
export function logAccess(accessLog: {
  method: string;
  endpoint: string;
  statusCode: number;
  duration: number;
  userId?: string;
  ipAddress?: string;
}): void {
  try {
    const logEntry = JSON.stringify({
      ...accessLog,
      timestamp: new Date().toISOString(),
    });

    appendFileSync(ACCESS_LOG_FILE, logEntry + "\n");
  } catch (error) {
    console.error("Failed to write access log:", error);
  }
}

/**
 * Get error summary for dashboard
 */
export function getErrorSummary(hours: number = 24): {
  totalErrors: number;
  totalWarnings: number;
  lastErrors: ErrorLog[];
  topEndpoints: Array<{ endpoint: string; count: number }>;
} {
  try {
    if (!existsSync(ERROR_LOG_FILE)) {
      return { totalErrors: 0, totalWarnings: 0, lastErrors: [], topEndpoints: [] };
    }

    const fs = require("fs");
    const content = fs.readFileSync(ERROR_LOG_FILE, "utf-8");
    const lines = content.split("\n").filter((l: string) => l.trim());
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;

    const logs = lines
      .map((line: string) => {
        try {
          return JSON.parse(line) as ErrorLog;
        } catch {
          return null;
        }
      })
      .filter((log: ErrorLog | null) => log && new Date(log.timestamp).getTime() > cutoffTime);

    const totalErrors = logs.filter((l: ErrorLog) => l.level === "ERROR").length;
    const totalWarnings = logs.filter((l: ErrorLog) => l.level === "WARN").length;
    const lastErrors = logs.slice(-10);

    // Count errors by endpoint
    const endpointCounts: Record<string, number> = {};
    logs.forEach((log: ErrorLog) => {
      if (log.endpoint) {
        endpointCounts[log.endpoint] = (endpointCounts[log.endpoint] || 0) + 1;
      }
    });

    const topEndpoints = Object.entries(endpointCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([endpoint, count]) => ({ endpoint, count }));

    return { totalErrors, totalWarnings, lastErrors, topEndpoints };
  } catch (error) {
    console.error("Failed to get error summary:", error);
    return { totalErrors: 0, totalWarnings: 0, lastErrors: [], topEndpoints: [] };
  }
}

/**
 * Clear old logs (older than specified days)
 */
export function clearOldLogs(daysOld: number = 30): void {
  try {
    if (!existsSync(ERROR_LOG_FILE)) return;

    const fs = require("fs");
    const content = fs.readFileSync(ERROR_LOG_FILE, "utf-8");
    const lines = content.split("\n").filter((l: string) => l.trim());
    const cutoffTime = Date.now() - daysOld * 24 * 60 * 60 * 1000;

    const recentLogs = lines
      .map((line: string) => {
        try {
          return JSON.parse(line) as ErrorLog;
        } catch {
          return null;
        }
      })
      .filter((log: ErrorLog | null) => log && new Date(log.timestamp).getTime() > cutoffTime)
      .map((log: ErrorLog) => JSON.stringify(log))
      .join("\n");

    fs.writeFileSync(ERROR_LOG_FILE, recentLogs + "\n");
  } catch (error) {
    console.error("Failed to clear old logs:", error);
  }
}
