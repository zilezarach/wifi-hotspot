import dotenv from "dotenv";
import app from "./app";
import logger from "./utils/logger";
import { PrismaClient } from "@prisma/client";
import { startDataCapMonitoring } from "./controllers/paymentController";
import rb951Manager from "./services/mikrotik-service";
import { Server } from "http";

// Load environment variables first
dotenv.config();

// Initialize Prisma
const prisma = new PrismaClient();

// Validate required environment variables
const requiredEnvVars = [
  "DATABASE_URL",
  "MIKROTIK_HOST",
  "MIKROTIK_USER",
  "MIKROTIK_PASS",
  "MPESA_CONSUMER_KEY",
  "MPESA_CONSUMER_SECRET",
  "MPESA_SHORTCODE",
  "MPESA_PASSKEY",
  "NODE_ENV",
  "SERVER_PORT",
  "MPESA_CALLBACK_URL"
];

function validateEnvironment() {
  const missing = requiredEnvVars.filter(varName => !process.env[varName]);

  if (missing.length > 0) {
    logger.error("❌ Missing required environment variables:");
    missing.forEach(varName => logger.error(`   - ${varName}`));
    process.exit(1);
  } else {
    logger.info("✅ All required environment variables are set");
  }
}

// Database connection test
async function testDatabaseConnection() {
  try {
    await prisma.$connect();
    logger.info("✅ Database connection established");

    // Run any pending migrations in production
    if (process.env.NODE_ENV === "production") {
      logger.info("🔄 Checking for database migrations...");
      // Note: Migrations should be run via Docker CMD, not here
    }
  } catch (error) {
    logger.error("❌ Database connection failed:", error);
    process.exit(1);
  }
}

// MikroTik connection test
async function testMikroTikConnection() {
  try {
    const connectionTest = await rb951Manager.testConnection();
    if (connectionTest.success) {
      logger.info("✅ MikroTik router connection established");
      logger.info(`   Router: ${connectionTest.info?.identity || "Unknown"}`);
      logger.info(`   Version: ${connectionTest.info?.version || "Unknown"}`);
    } else {
      logger.error("❌ MikroTik connection failed:", connectionTest.message);
      // Don't exit - allow server to start but log the issue
      logger.warn("⚠️  Server starting without MikroTik connection");
    }
  } catch (error) {
    logger.error("❌ MikroTik connection test failed:", error);
    logger.warn("⚠️  Server starting without MikroTik connection");
  }
}

// Store server instance for graceful shutdown
let serverInstance: Server | null = null;

// Graceful shutdown handler
async function gracefulShutdown(signal: string) {
  logger.info(`🛑 Received ${signal}. Starting graceful shutdown...`);

  // Close server
  if (serverInstance) {
    serverInstance.close(() => {
      logger.info("🔌 HTTP server closed");
    });
  }

  // Disconnect from MikroTik
  try {
    await rb951Manager.disconnect();
    logger.info("🔌 MikroTik connection closed");
  } catch (error) {
    logger.error("Error closing MikroTik connection:", error);
  }

  // Close database connection
  try {
    await prisma.$disconnect();
    logger.info("🔌 Database connection closed");
  } catch (error) {
    logger.error("Error closing database connection:", error);
  }

  logger.info("✅ Graceful shutdown completed");
  process.exit(0);
}

// Initialize server
async function startServer() {
  try {
    // Validate environment
    validateEnvironment();

    // Test connections
    await testDatabaseConnection();
    await testMikroTikConnection();

    // Start background monitoring
    await startDataCapMonitoring();
    logger.info("📊 Background monitoring started");

    // Start server
    const PORT = parseInt(process.env.SERVER_PORT || "5000", 10);
    const HOST = process.env.SERVER_IP || "0.0.0.0";

    const server = app.listen(PORT, HOST, () => {
      logger.info(`🚀 Hotspot server running on ${HOST}:${PORT}`);
      logger.info(`🌐 Portal available at: https://hotspot.0xzile.sbs`);
      logger.info(`📱 Environment: ${process.env.NODE_ENV || "development"}`);

      // Log system info
      logger.info(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
      logger.info(`⏱️  Uptime: ${Math.round(process.uptime())} seconds`);
    });

    // Store server instance for graceful shutdown
    serverInstance = server;

    // Handle server errors
    server.on("error", (error: any) => {
      if (error.syscall !== "listen") {
        throw error;
      }

      const bind = typeof PORT === "string" ? "Pipe " + PORT : "Port " + PORT;

      switch (error.code) {
        case "EACCES":
          logger.error(`${bind} requires elevated privileges`);
          process.exit(1);
        case "EADDRINUSE":
          logger.error(`${bind} is already in use`);
          process.exit(1);
        default:
          throw error;
      }
    });

    // Setup graceful shutdown handlers
    process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
    process.on("SIGINT", () => gracefulShutdown("SIGINT"));

    // Handle uncaught exceptions
    process.on("uncaughtException", error => {
      logger.error("❌ Uncaught Exception:", error);
      gracefulShutdown("uncaughtException");
    });

    process.on("unhandledRejection", (reason, promise) => {
      logger.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
      gracefulShutdown("unhandledRejection");
    });

    return server;
  } catch (error) {
    logger.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Export server instance for testing
export const server = startServer();

// Health check endpoint for monitoring
process.on("message", message => {
  if (message === "health-check") {
    process.send!({
      status: "healthy",
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    });
  }
});
