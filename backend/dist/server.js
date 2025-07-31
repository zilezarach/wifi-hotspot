"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
const mikrotik_rb951_1 = require("./services/mikrotik-rb951");
const mpesaService_1 = require("./services/mpesaService");
const logger_1 = __importDefault(require("./utils/logger"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = parseInt(process.env.SERVER_PORT || "3000");
const SERVER_IP = process.env.SERVER_IP || "10.5.50.2";
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Store pending payments (in production, use Redis or database)
const pendingPayments = new Map();
// Middleware to get real client IP
app.use((req, res, next) => {
    const forwarded = req.headers["x-forwarded-for"];
    const realIp = req.headers["x-real-ip"];
    const remoteAddress = req.socket.remoteAddress;
    req.clientIP = forwarded?.split(",")[0] || realIp || remoteAddress || "10.5.50.100";
    next();
});
// Serve React build files
app.use(express_1.default.static(path_1.default.join(__dirname, "../../../frontend/build")));
// Process M-Pesa payment
async function processMpesaPayment(phone, planId, clientIP) {
    try {
        const amount = (0, mpesaService_1.getPlanPrice)(planId);
        if (amount === 0) {
            return { success: false, message: "Invalid plan selected" };
        }
        logger_1.default.info(`Processing M-Pesa payment: ${phone}, Plan: ${planId}, Amount: KSh ${amount}`);
        const stkResponse = await (0, mpesaService_1.initiateStkPush)(phone, amount, `WiFi-${planId}`);
        if (stkResponse.ResponseCode === "0") {
            // Store pending payment
            pendingPayments.set(stkResponse.CheckoutRequestID, {
                ip: clientIP,
                phone,
                planId,
                duration: getDurationFromPlan(planId),
                amount,
                timestamp: Date.now()
            });
            return {
                success: true,
                message: "Payment request sent to your phone. Please enter your M-Pesa PIN.",
                checkoutRequestId: stkResponse.CheckoutRequestID
            };
        }
        else {
            return {
                success: false,
                message: stkResponse.errorMessage || "Payment initiation failed"
            };
        }
    }
    catch (error) {
        logger_1.default.error("M-Pesa payment processing error:", error);
        return {
            success: false,
            message: error.message || "Payment processing failed"
        };
    }
}
// Helper function to map plan to duration
function getDurationFromPlan(planId) {
    const planDurationMap = {
        "quick-surf": "1Hr",
        "quick-surf-4h": "4Hrs",
        "half-day-boost": "12Hrs",
        "daily-boost": "24Hrs",
        "weekly-unlimited": "7d",
        "community-freebie": "30m"
    };
    return planDurationMap[planId] || "1Hr";
}
// API Routes
app.post("/api/pay", async (req, res) => {
    const { planId, phone, duration } = req.body;
    const clientIP = req.clientIP;
    try {
        logger_1.default.info(`Payment request from IP: ${clientIP}, Plan: ${planId}, Duration: ${duration}`);
        // For free trial, grant immediate access
        if (planId === "community-freebie") {
            const result = await mikrotik_rb951_1.rb951Manager.grantAccessByIP(clientIP, "30m");
            return res.json(result);
        }
        // Validate phone number for paid plans
        if (!phone || !phone.match(/^254\d{9}$/)) {
            return res.json({
                success: false,
                message: "Valid phone number required (format: 254xxxxxxxxx)"
            });
        }
        // Process M-Pesa payment
        const paymentResult = await processMpesaPayment(phone, planId, clientIP);
        res.json(paymentResult);
    }
    catch (error) {
        logger_1.default.error("Payment processing error:", error);
        res.status(500).json({
            success: false,
            message: "Server error processing payment"
        });
    }
});
// Check payment status
app.post("/api/check-payment", async (req, res) => {
    const { checkoutRequestId } = req.body;
    if (!checkoutRequestId) {
        return res.json({ success: false, message: "Checkout request ID required" });
    }
    try {
        const paymentInfo = pendingPayments.get(checkoutRequestId);
        if (!paymentInfo) {
            return res.json({ success: false, message: "Payment not found" });
        }
        // Check if payment is too old (15 minutes timeout)
        if (Date.now() - paymentInfo.timestamp > 15 * 60 * 1000) {
            pendingPayments.delete(checkoutRequestId);
            return res.json({ success: false, message: "Payment request expired" });
        }
        // Query M-Pesa for transaction status
        const statusResponse = await (0, mpesaService_1.queryTransactionStatus)(checkoutRequestId);
        if (statusResponse.ResultCode === "0") {
            // Payment successful - grant access
            const accessResult = await mikrotik_rb951_1.rb951Manager.grantAccessByIP(paymentInfo.ip, paymentInfo.duration);
            // Remove from pending payments
            pendingPayments.delete(checkoutRequestId);
            res.json({
                success: accessResult.success,
                message: accessResult.success ? "Payment confirmed! Internet access granted." : accessResult.message,
                paid: true
            });
        }
        else if (statusResponse.ResultCode === "1032") {
            // User cancelled
            pendingPayments.delete(checkoutRequestId);
            res.json({
                success: false,
                message: "Payment was cancelled",
                cancelled: true
            });
        }
        else if (statusResponse.ResultCode === "1037") {
            // Timeout
            pendingPayments.delete(checkoutRequestId);
            res.json({
                success: false,
                message: "Payment request timed out",
                timeout: true
            });
        }
        else {
            // Still pending or other status
            res.json({
                success: false,
                message: "Payment is still being processed",
                pending: true
            });
        }
    }
    catch (error) {
        logger_1.default.error("Payment status check error:", error);
        res.status(500).json({
            success: false,
            message: "Error checking payment status"
        });
    }
});
// M-Pesa callback endpoint
app.post("/api/mpesa-callback", (req, res) => {
    logger_1.default.info("M-Pesa callback received:", req.body);
    try {
        const { Body: { stkCallback } } = req.body;
        const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;
        logger_1.default.info(`M-Pesa callback: ${CheckoutRequestID}, Result: ${ResultCode} - ${ResultDesc}`);
        // Find pending payment
        const paymentInfo = pendingPayments.get(CheckoutRequestID);
        if (paymentInfo && ResultCode === 0) {
            // Payment successful - grant access
            mikrotik_rb951_1.rb951Manager
                .grantAccessByIP(paymentInfo.ip, paymentInfo.duration)
                .then(result => {
                logger_1.default.info(`Access granted via callback for IP ${paymentInfo.ip}: ${result.message}`);
            })
                .catch(error => {
                logger_1.default.error(`Failed to grant access via callback for IP ${paymentInfo.ip}:`, error);
            });
        }
        // Always respond with success to M-Pesa
        res.json({ ResultCode: 0, ResultDesc: "Success" });
    }
    catch (error) {
        logger_1.default.error("M-Pesa callback processing error:", error);
        res.json({ ResultCode: 1, ResultDesc: "Error processing callback" });
    }
});
app.get("/api/session-status", async (req, res) => {
    const clientIP = req.clientIP;
    try {
        const activeUsers = await mikrotik_rb951_1.rb951Manager.getActiveUsers();
        const bindings = await mikrotik_rb951_1.rb951Manager.getActiveBindings();
        const userSession = activeUsers.find((user) => user.address === clientIP);
        const userBinding = bindings.find((binding) => binding.address === clientIP && binding.type === "bypassed");
        if (userSession || userBinding) {
            res.json({
                hasActiveSession: true,
                timeRemaining: parseInt(userSession?.["session-time-left"] || "1800"),
                plan: { name: userSession?.comment || userBinding?.comment || "Active Session" },
                expiry: userSession
                    ? new Date(Date.now() + parseInt(userSession["session-time-left"] || "1800") * 1000)
                    : new Date(Date.now() + 30 * 60 * 1000)
            });
        }
        else {
            res.json({ hasActiveSession: false, timeRemaining: 0, plan: null, expiry: null });
        }
    }
    catch (error) {
        logger_1.default.error("Session status error:", error);
        res.json({ hasActiveSession: false, timeRemaining: 0, plan: null, expiry: null });
    }
});
app.post("/api/disconnect", async (req, res) => {
    const clientIP = req.clientIP;
    try {
        const result = await mikrotik_rb951_1.rb951Manager.disconnectUser(clientIP);
        res.json(result);
    }
    catch (error) {
        logger_1.default.error("Disconnect error:", error);
        res.status(500).json({
            success: false,
            message: "Disconnect failed"
        });
    }
});
// Get plan prices
app.get("/api/plans", (req, res) => {
    res.json({
        success: true,
        plans: [
            { id: "quick-surf", name: "Quick Surf", duration: "1Hr", price: 10, description: "Unlimited Data" },
            { id: "quick-surf-4h", name: "Extended Surf", duration: "4Hrs", price: 30, description: "Unlimited Data" },
            { id: "half-day-boost", name: "Half Day Boost", duration: "12Hrs", price: 40, description: "5GB Data Cap" },
            { id: "daily-boost", name: "Daily Boost", duration: "24Hrs", price: 50, description: "5GB Data Cap" },
            { id: "weekly-unlimited", name: "Weekly Unlimited", duration: "7d", price: 200, description: "Unlimited Data" },
            { id: "community-freebie", name: "Community Freebie", duration: "30m", price: 0, description: "Essentials Only" }
        ]
    });
});
// Health check
app.get("/api/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        server: `${SERVER_IP}:${PORT}`
    });
});
// Clean up expired pending payments every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [checkoutId, payment] of pendingPayments.entries()) {
        if (now - payment.timestamp > 15 * 60 * 1000) {
            // 15 minutes
            pendingPayments.delete(checkoutId);
            logger_1.default.info(`Cleaned up expired payment: ${checkoutId}`);
        }
    }
}, 5 * 60 * 1000);
// Catch-all handler for React SPA
app.get("*", (req, res) => {
    res.sendFile(path_1.default.join(__dirname, "../../../frontend/build", "index.html"));
});
// Initialize server
async function initializeServer() {
    console.log(`🚀 Starting Hotspot Server on http://${SERVER_IP}:${PORT}`);
    try {
        const connectionTest = await mikrotik_rb951_1.rb951Manager.testConnection();
        if (connectionTest.success) {
            console.log(`✅ MikroTik Connection: ${connectionTest.message}`);
            console.log(`📋 Router Info:`, connectionTest.info);
        }
        else {
            console.warn(`⚠️  MikroTik Connection Warning: ${connectionTest.message}`);
        }
    }
    catch (error) {
        console.error(`❌ MikroTik Connection Error:`, error);
    }
}
app.listen(PORT, SERVER_IP, () => {
    initializeServer();
});
