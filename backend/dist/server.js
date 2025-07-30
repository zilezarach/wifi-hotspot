"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const cron_1 = require("cron");
const dotenv_1 = __importDefault(require("dotenv"));
const client_1 = require("@prisma/client");
const app_1 = __importDefault(require("./app"));
const logger_1 = __importDefault(require("./utils/logger"));
const accessService_1 = require("./services/accessService");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const prisma = new client_1.PrismaClient();
const server = http_1.default.createServer(app_1.default);
// Enhanced cleanup/expiry job (every 5 minutes)
const cleanupJob = new cron_1.CronJob("*/5 * * * *", async () => {
    const now = new Date();
    const activeSessions = await prisma.session.findMany({
        where: { paid: true, expiry: { gt: now } },
    });
    for (const session of activeSessions) {
        // Time expiry check
        if (session.expiry < now) {
            await (0, accessService_1.revokeAccess)(session.ip);
            await prisma.session.delete({ where: { id: session.id } });
            logger_1.default.info(`Session ${session.id} expired by time (IP: ${session.ip})`);
            continue;
        }
        // Data cap check (if set)
        if (session.dataCap) {
            const used = await (0, accessService_1.getUsageForIp)(session.ip);
            const capInBytes = BigInt(session.dataCap * 1024 * 1024);
            if (used > capInBytes) {
                await (0, accessService_1.revokeAccess)(session.ip);
                await prisma.session.update({
                    where: { id: session.id },
                    data: { paid: false, usedData: used },
                });
                logger_1.default.info(`Data cap exceeded for session ${session.id} (IP: ${session.ip}, used: ${used})`);
            }
            else {
                await prisma.session.update({
                    where: { id: session.id },
                    data: { usedData: used },
                });
            }
        }
        // Free trial limit (if FREE_MODE active and plan is freebie – 30 mins/day per IP)
        if (process.env.FREE_MODE === "true" &&
            session.planName === "Community Freebie") {
            const startOfDay = new Date(now.setHours(0, 0, 0, 0));
            const dailyUsage = await prisma.session.aggregate({
                where: {
                    ip: session.ip,
                    planName: "Community Freebie",
                    createdAt: { gte: startOfDay },
                },
                _sum: { planHours: true },
            });
            const totalHours = dailyUsage._sum.planHours ?? 0; // Null check fixes undefined error
            if (totalHours > 0.5) {
                // Over 30 mins today
                await (0, accessService_1.revokeAccess)(session.ip);
                await prisma.session.delete({ where: { id: session.id } });
                logger_1.default.info(`Free trial limit exceeded for IP: ${session.ip}`);
            }
        }
    }
    // Cleanup old sessions (delete after 7 days)
    const oldDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    await prisma.session.deleteMany({ where: { createdAt: { lt: oldDate } } });
    logger_1.default.info("Session cleanup completed");
});
cleanupJob.start();
server.listen(PORT, () => {
    logger_1.default.info(`Server running on port ${PORT}`);
});
