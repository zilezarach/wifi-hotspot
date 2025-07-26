"use strict";
var __awaiter =
  (this && this.__awaiter) ||
  function (thisArg, _arguments, P, generator) {
    function adopt(value) {
      return value instanceof P
        ? value
        : new P(function (resolve) {
            resolve(value);
          });
    }
    return new (P || (P = Promise))(function (resolve, reject) {
      function fulfilled(value) {
        try {
          step(generator.next(value));
        } catch (e) {
          reject(e);
        }
      }
      function rejected(value) {
        try {
          step(generator["throw"](value));
        } catch (e) {
          reject(e);
        }
      }
      function step(result) {
        result.done
          ? resolve(result.value)
          : adopt(result.value).then(fulfilled, rejected);
      }
      step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
  };
var __importDefault =
  (this && this.__importDefault) ||
  function (mod) {
    return mod && mod.__esModule ? mod : { default: mod };
  };
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const cron_1 = __importDefault(require("cron"));
const dotenv_1 = __importDefault(require("dotenv"));
const prisma_1 = require("prisma");
const app_1 = __importDefault(require("./app"));
const logger_1 = __importDefault(require("./utils/logger"));
const accessService_1 = require("./services/accessService");
dotenv_1.default.config();
const PORT = process.env.PORT || 5000;
const prisma = new prisma_1.PrismaClient();
const server = http_1.default.createServer(app_1.default);
// Expire sessions every minute
const expireJob = new cron_1.default.CronJob("* * * * *", () =>
  __awaiter(void 0, void 0, void 0, function* () {
    const now = new Date();
    const expired = yield prisma.session.findMany({
      where: { expiry: { lt: now }, paid: true },
    });
    for (const session of expired) {
      yield (0, accessService_1.revokeAccess)(session.ip);
      yield prisma.session.delete({ where: { id: session.id } });
    }
    logger_1.default.info("Expired sessions checked");
  })
);
expireJob.start();
server.listen(PORT, () => {
  logger_1.default.info(`Server running on port ${PORT}`);
});
