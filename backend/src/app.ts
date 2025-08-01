import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import logger from "./utils/logger";
import {
  showPortal,
  initiatePayment,
  mpesaCallback,
  getSessionStatus,
  getSystemStatus,
  grantFreeAccess,
  disconnectUser
} from "./controllers/paymentController";

const app = express();
const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests – try again later" },
  standardHeaders: true,
  legacyHeaders: false, // Add this
  skip: req => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  }
});
// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.set("trust proxy", 1);

// Rate limiting (prevent spam on pay endpoint – 10 reqs/min per IP)
app.post("/api/pay", paymentLimiter, initiatePayment);

// API Routes FIRST (before static files)
app.post("/api/pay", initiatePayment);
app.post("/api/mpesa_callback", mpesaCallback);
app.get("/api/session-status", getSessionStatus);
app.post("/api/disconnect", disconnectUser);
app.get("/api/system-status", getSystemStatus);
app.post("/api/grant-free-access", grantFreeAccess);

// Health check
app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

// Portal route for captive portal (specific route)
app.get("/portal", showPortal);

// Serve static files (React app)
app.use(
  express.static(path.join(__dirname, "../public"), {
    index: false, // Don't automatically serve index.html
    maxAge: "1d"
  })
);

// SPA fallback - serve React app for all non-API routes
app.get("*", (req, res) => {
  // Don't serve SPA for API routes
  if (req.path.startsWith("/api")) {
    return res.status(404).json({ error: "API endpoint not found" });
  }

  // Serve index.html for all other routes (React Router)
  res.sendFile(path.join(__dirname, "../public/index.html"));
});

// Global error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error(`Error on ${req.method} ${req.url}:`, err);
  res.status(500).json({ error: "Server error – please try again" });
});

export default app;
