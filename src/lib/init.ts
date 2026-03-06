/**
 * Application Initialization
 * This file runs once when the server starts
 */

import { initializeCronJobs } from "./cron";
import { logInfo } from "./logger";

let initialized = false;

export function initializeApp() {
  if (initialized) {
    return; // Prevent multiple initializations
  }

  try {
    logInfo("Initializing application...");

    // Initialize cron jobs
    if (process.env.NODE_ENV === "production" || process.env.ENABLE_CRON === "true") {
      initializeCronJobs();
      logInfo("Cron jobs initialized");
    } else {
      logInfo("Cron jobs disabled (not in production). Set ENABLE_CRON=true to enable.");
    }

    initialized = true;
    logInfo("Application initialized successfully");
  } catch (error) {
    console.error("Failed to initialize application:", error);
    throw error;
  }
}
