"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const app_1 = __importDefault(require("./app"));
const logger_1 = __importDefault(require("./utils/logger"));
const client_1 = require("@prisma/client");
const paymentController_1 = require("./controllers/paymentController");
const mikrotik_rb951_1 = __importDefault(require("./services/mikrotik-rb951"));
// Load environment variables first
dotenv_1.default.config();
// Initialize Prisma
const prisma = new client_1.PrismaClient();
// Validate required environment variables
const requiredEnvVars = [
    "DATABASE_URL",
    "MIKROTIK_HOST",
    "MIKROTIK_USER",
    "MIKROTIK_PASS",
    "MPESA_CONSUMER_KEY",
    "MPESA_CONSUMER_SECRET",
    "MPESA_SHORTCODE",
    "MPESA_PASSKEY"
];
function validateEnvironment() {
    const missing = requiredEnvVars.filter(varName => !process.env[varName]);
    if (missing.length > 0) {
        logger_1.default.error("❌ Missing required environment variables:");
        missing.forEach(varName => logger_1.default.error(`   - ${varName}`));
        process.exit(1);
    }
    else {
        logger_1.default.info("✅ All required environment variables are set");
    }
}
// Database connection test
async function testDatabaseConnection() {
    try {
        await prisma.$connect();
        logger_1.default.info("✅ Database connection established");
        // Run any pending migrations in production
        if (process.env.NODE_ENV === "production") {
            logger_1.default.info("🔄 Checking for database migrations...");
            // Note: Migrations should be run via Docker CMD, not here
        }
    }
    catch (error) {
        logger_1.default.error("❌ Database connection failed:", error);
        process.exit(1);
    }
}
// MikroTik connection test
async function testMikroTikConnection() {
    try {
        const connectionTest = await mikrotik_rb951_1.default.testConnection();
        if (connectionTest.success) {
            logger_1.default.info("✅ MikroTik router connection established");
            logger_1.default.info(`   Router: ${connectionTest.info?.identity || "Unknown"}`);
            logger_1.default.info(`   Version: ${connectionTest.info?.version || "Unknown"}`);
        }
        else {
            logger_1.default.error("❌ MikroTik connection failed:", connectionTest.message);
            // Don't exit - allow server to start but log the issue
            logger_1.default.warn("⚠️  Server starting without MikroTik connection");
        }
    }
    catch (error) {
        logger_1.default.error("❌ MikroTik connection test failed:", error);
        logger_1.default.warn("⚠️  Server starting without MikroTik connection");
    }
}
// Store server instance for graceful shutdown
let serverInstance = null;
// Graceful shutdown handler
async function gracefulShutdown(signal) {
    logger_1.default.info(`🛑 Received ${signal}. Starting graceful shutdown...`);
    // Close server
    if (serverInstance) {
        serverInstance.close(() => {
            logger_1.default.info("🔌 HTTP server closed");
        });
    }
    // Disconnect from MikroTik
    try {
        await mikrotik_rb951_1.default.disconnect();
        logger_1.default.info("🔌 MikroTik connection closed");
    }
    catch (error) {
        logger_1.default.error("Error closing MikroTik connection:", error);
    }
    // Close database connection
    try {
        await prisma.$disconnect();
        logger_1.default.info("🔌 Database connection closed");
    }
    catch (error) {
        logger_1.default.error("Error closing database connection:", error);
    }
    logger_1.default.info("✅ Graceful shutdown completed");
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
        await (0, paymentController_1.startDataCapMonitoring)();
        logger_1.default.info("📊 Background monitoring started");
        // Start server
        const PORT = parseInt(process.env.SERVER_PORT || "5000", 10);
        const HOST = process.env.SERVER_IP || "0.0.0.0";
        const server = app_1.default.listen(PORT, HOST, () => {
            logger_1.default.info(`🚀 Hotspot server running on ${HOST}:${PORT}`);
            logger_1.default.info(`🌐 Portal available at: https://hotspot.0xzile.sbs`);
            logger_1.default.info(`📱 Environment: ${process.env.NODE_ENV || "development"}`);
            // Log system info
            logger_1.default.info(`💾 Memory usage: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`);
            logger_1.default.info(`⏱️  Uptime: ${Math.round(process.uptime())} seconds`);
        });
        // Store server instance for graceful shutdown
        serverInstance = server;
        // Handle server errors
        server.on("error", (error) => {
            if (error.syscall !== "listen") {
                throw error;
            }
            const bind = typeof PORT === "string" ? "Pipe " + PORT : "Port " + PORT;
            switch (error.code) {
                case "EACCES":
                    logger_1.default.error(`${bind} requires elevated privileges`);
                    process.exit(1);
                case "EADDRINUSE":
                    logger_1.default.error(`${bind} is already in use`);
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
            logger_1.default.error("❌ Uncaught Exception:", error);
            gracefulShutdown("uncaughtException");
        });
        process.on("unhandledRejection", (reason, promise) => {
            logger_1.default.error("❌ Unhandled Rejection at:", promise, "reason:", reason);
            gracefulShutdown("unhandledRejection");
        });
        return server;
    }
    catch (error) {
        logger_1.default.error("❌ Failed to start server:", error);
        process.exit(1);
    }
}
// Export server instance for testing
exports.server = startServer();
// Health check endpoint for monitoring
process.on("message", message => {
    if (message === "health-check") {
        process.send({
            status: "healthy",
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            timestamp: new Date().toISOString()
        });
    }
});
