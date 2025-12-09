import express from "express";
import cors from "cors";
import path from "path";
import rateLimit from "express-rate-limit";
import logger from "./utils/logger";
import {
  detectTenant,
  showPortal,
  initiatePayment,
  mpesaCallback,
  getSessionStatus,
  disconnectSession
} from "./controllers/portalController";
import {
  createTenant,
  listTenants,
  getTenant,
  updateTenant,
  deleteTenant,
  testTenantConnection,
  getDashboard,
  getTenantAnalytics
} from "./controllers/adminController";

const app = express();

const isDev = process.env.NODE_ENV !== "production";

const paymentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: { error: "Too many requests – try again later" },
  standardHeaders: true,
  legacyHeaders: false,
  skip: req => {
    // Skip rate limiting for health checks
    return req.path === "/health";
  }
});

if (!isDev) {
  app.use(
    express.static(path.join(__dirname, "../public"), {
      index: false,
      maxAge: "1d"
    })
  );
  // SPA fallback
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api")) {
      return res.status(404).json({ error: "API endpoint not found" });
    }
    res.sendFile(path.join(__dirname, "../public/index.html"));
  });
}

// Middleware
app.use(cors({ origin: "*" }));
app.use(express.json());
app.set("trust proxy", 1);

// Admin Routes
app.post("/api/admin/tenants", createTenant);
app.get("/api/admin/tenants", listTenants);
app.get("/api/admin/tenants/:tenantId", getTenant);
app.put("/api/admin/tenants/:tenantId", updateTenant);
app.delete("/api/admin/tenants/:tenantId", deleteTenant);
app.post("/api/admin/tenants/:tenantId/test", testTenantConnection);
app.get("/api/admin/dashboard", getDashboard);
app.get("/api/admin/tenants/:tenantId/analytics", getTenantAnalytics);

// M-Pesa Callback
app.post("/api/mpesa_callback", mpesaCallback);

// Portal Routes (with tenant detection middleware)
app.get("/", detectTenant, showPortal);
app.post("/payment/initiate", detectTenant, paymentLimiter, initiatePayment);
app.get("/session/status", detectTenant, getSessionStatus);
app.post("/api/disconnect", detectTenant, disconnectSession);

// Health check
app.get("/health", (req: express.Request, res: express.Response) => {
  res.status(200).json({ status: "OK", uptime: process.uptime() });
});

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
