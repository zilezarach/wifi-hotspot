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
// Expire sessions every minute
const expireJob = new cron_1.CronJob("* * * * *", async () => {
    const now = new Date();
    const expired = await prisma.session.findMany({
        where: { expiry: { lt: now }, paid: true },
    });
    for (const session of expired) {
        await (0, accessService_1.revokeAccess)(session.ip);
        await prisma.session.delete({ where: { id: session.id } });
    }
    logger_1.default.info("Expired sessions checked");
});
expireJob.start();
server.listen(PORT, () => {
    logger_1.default.info(`Server running on port ${PORT}`);
});
