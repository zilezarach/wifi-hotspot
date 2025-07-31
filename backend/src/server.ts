import http from "http";
import { CronJob } from "cron";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import app from "./app";
import logger from "./utils/logger";
import { revokeAccess, getUsageForIp } from "./services/accessService";

dotenv.config();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

const server = http.createServer(app);

// Enhanced cleanup/expiry job (every 5 minutes)
const cleanupJob = new CronJob("*/5 * * * *", async () => {
  const now = new Date();
  const activeSessions = await prisma.session.findMany({
    where: { paid: true, expiry: { gt: now } }
  });

  for (const session of activeSessions) {
    // Time expiry check
    if (session.expiry < now) {
      await revokeAccess(session.ip);
      await prisma.session.delete({ where: { id: session.id } });
      logger.info(`Session ${session.id} expired by time (IP: ${session.ip})`);
      continue;
    }

    // Data cap check (if set)
    if (session.dataCap) {
      const used = await getUsageForIp(session.ip);
      const capInBytes = BigInt(session.dataCap * 1024 * 1024);
      if (used > capInBytes) {
        await revokeAccess(session.ip);
        await prisma.session.update({
          where: { id: session.id },
          data: { paid: false, usedData: used }
        });
        logger.info(`Data cap exceeded for session ${session.id} (IP: ${session.ip}, used: ${used})`);
      } else {
        await prisma.session.update({
          where: { id: session.id },
          data: { usedData: used }
        });
      }
    }

    // Free trial limit (if FREE_MODE active and plan is freebie – 30 mins/day per IP)
    if (process.env.FREE_MODE === "true" && session.planName === "Community Freebie") {
      const startOfDay = new Date(now.setHours(0, 0, 0, 0));
      const dailyUsage = await prisma.session.aggregate({
        where: {
          ip: session.ip,
          planName: "Community Freebie",
          createdAt: { gte: startOfDay }
        },
        _sum: { planHours: true }
      });
      const totalHours = dailyUsage._sum?.planHours ?? 0; // Null check fixes undefined error
      if (totalHours > 0.5) {
        // Over 30 mins today
        await revokeAccess(session.ip);
        await prisma.session.delete({ where: { id: session.id } });
        logger.info(`Free trial limit exceeded for IP: ${session.ip}`);
      }
    }
  }

  // Cleanup old sessions (delete after 7 days)
  const oldDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  await prisma.session.deleteMany({ where: { createdAt: { lt: oldDate } } });
  logger.info("Session cleanup completed");
});

cleanupJob.start();

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
