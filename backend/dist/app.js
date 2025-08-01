"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const logger_1 = __importDefault(require("./utils/logger"));
const paymentController_1 = require("./controllers/paymentController");
const app = (0, express_1.default)();
const paymentLimiter = (0, express_rate_limit_1.default)({
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
app.use((0, cors_1.default)({ origin: "*" }));
app.use(express_1.default.json());
app.set("trust proxy", 1);
// Rate limiting (prevent spam on pay endpoint – 10 reqs/min per IP)
app.post("/api/pay", paymentLimiter, paymentController_1.initiatePayment);
// API Routes FIRST (before static files)
app.post("/api/pay", paymentController_1.initiatePayment);
app.post("/api/mpesa_callback", paymentController_1.mpesaCallback);
app.get("/api/session-status", paymentController_1.getSessionStatus);
app.post("/api/disconnect", paymentController_1.disconnectUser);
app.get("/api/system-status", paymentController_1.getSystemStatus);
app.post("/api/grant-free-access", paymentController_1.grantFreeAccess);
// Health check
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", uptime: process.uptime() });
});
// Portal route for captive portal (specific route)
app.get("/portal", paymentController_1.showPortal);
// Serve static files (React app)
app.use(express_1.default.static(path_1.default.join(__dirname, "../public"), {
    index: false, // Don't automatically serve index.html
    maxAge: "1d"
}));
// SPA fallback - serve React app for all non-API routes
app.get("*", (req, res) => {
    // Don't serve SPA for API routes
    if (req.path.startsWith("/api")) {
        return res.status(404).json({ error: "API endpoint not found" });
    }
    // Serve index.html for all other routes (React Router)
    res.sendFile(path_1.default.join(__dirname, "../public/index.html"));
});
// Global error handler
app.use((err, req, res, next) => {
    logger_1.default.error(`Error on ${req.method} ${req.url}:`, err);
    res.status(500).json({ error: "Server error – please try again" });
});
exports.default = app;
