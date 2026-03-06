/**
 * Logger Service
 * Centralized logging using Winston
 */

import winston from "winston";
import path from "path";

const logDir = path.join(process.cwd(), "logs");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  ),
  defaultMeta: { service: "pimisa-voucher-system" },
  transports: [
    // Error log file
    new winston.transports.File({
      filename: path.join(logDir, "error.log"),
      level: "error",
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    // Combined log file
    new winston.transports.File({
      filename: path.join(logDir, "combined.log"),
      maxsize: 5242880,
      maxFiles: 10,
    }),
  ],
});

// Console output in development
if (process.env.NODE_ENV !== "production") {
  logger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    })
  );
}

export default logger;

// Convenience methods
export const logError = (message: string, meta?: any) => {
  logger.error(message, meta);
};

export const logWarn = (message: string, meta?: any) => {
  logger.warn(message, meta);
};

export const logInfo = (message: string, meta?: any) => {
  logger.info(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
  logger.debug(message, meta);
};

// Log API errors with context
export const logApiError = (
  endpoint: string,
  error: Error,
  userId?: string,
  requestBody?: any
) => {
  logger.error("API Error", {
    endpoint,
    error: error.message,
    stack: error.stack,
    userId,
    requestBody,
    timestamp: new Date().toISOString(),
  });
};

// Log security events
export const logSecurityEvent = (
  event: string,
  userId?: string,
  ipAddress?: string,
  details?: any
) => {
  logger.warn("Security Event", {
    event,
    userId,
    ipAddress,
    details,
    timestamp: new Date().toISOString(),
  });
};
