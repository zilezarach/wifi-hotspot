import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import logger from "./utils/logger";
import { showPortal, initiatePayment, mpesaCallback, getSessionStatus } from "./controllers/paymentController";

const app = express();

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.use(express.static(path.join(__dirname, "../public"))); // Serve frontend
app.set("trust proxy", 1);
// Rate limiting (prevent spam on pay endpoint – 10 reqs/min per IP)
app.use(
  "/api/pay",
  rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many requests – try again later" },
    standardHeaders: true
  })
);

// Routes
app.get("/", showPortal);
app.post("/api/pay", initiatePayment);
app.post("/api/mpesa_callback", mpesaCallback);
app.get("/api/session-status", getSessionStatus); // New: For frontend polling

// Health check (for monitoring/uptime tools)
app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

// Global error handler (improved with logging)
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Error on ${req.method} ${req.url}:`, err); // Log full error
  res.status(500).json({ error: "Server error – please try again" }); // User-friendly message
});

export default app;
