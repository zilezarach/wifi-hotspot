import http from "http";
import { CronJob } from "cron";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import app from "./app";
import logger from "./utils/logger";
import { revokeAccess } from "./services/accessService";

dotenv.config();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

const server = http.createServer(app);

// Expire sessions every minute
const expireJob = new CronJob("* * * * *", async () => {
  const now = new Date();
  const expired = await prisma.session.findMany({
    where: { expiry: { lt: now }, paid: true },
  });
  for (const session of expired) {
    await revokeAccess(session.ip);
    await prisma.session.delete({ where: { id: session.id } });
  }
  logger.info("Expired sessions checked");
});

expireJob.start();

server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
