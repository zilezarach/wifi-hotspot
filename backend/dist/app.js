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
// Middleware
app.use((0, cors_1.default)({ origin: "*" }));
app.use(express_1.default.json());
app.use(express_1.default.static(path_1.default.join(__dirname, "../public"))); // Serve frontend
app.set("trust proxy", 1);
// Rate limiting (prevent spam on pay endpoint – 10 reqs/min per IP)
app.use("/api/pay", (0, express_rate_limit_1.default)({
    windowMs: 60 * 1000,
    max: 10,
    message: { error: "Too many requests – try again later" },
    standardHeaders: true
}));
// Routes
app.get("/", paymentController_1.showPortal);
app.post("/api/pay", paymentController_1.initiatePayment);
app.post("/api/mpesa_callback", paymentController_1.mpesaCallback);
app.get("/api/session-status", paymentController_1.getSessionStatus); // New: For frontend polling
// Health check (for monitoring/uptime tools)
app.get("/health", (req, res) => {
    res.status(200).json({ status: "OK", uptime: process.uptime() });
});
// Global error handler (improved with logging)
app.use((err, req, res, next) => {
    logger_1.default.error(`Error on ${req.method} ${req.url}:`, err); // Log full error
    res.status(500).json({ error: "Server error – please try again" }); // User-friendly message
});
exports.default = app;
