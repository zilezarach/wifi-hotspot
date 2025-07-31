import express from "express";
import cors from "cors";
import path from "path";
import dotenv from "dotenv";
import { rb951Manager } from "./services/mikrotik-rb951";
import { initiateStkPush, getPlanPrice, queryTransactionStatus } from "./services/mpesaService";
import logger from "./utils/logger";

dotenv.config();

const app = express();
const PORT = parseInt(process.env.SERVER_PORT || "3000");
const SERVER_IP = process.env.SERVER_IP || "10.5.50.2";

app.use(cors());
app.use(express.json());

// Store pending payments (in production, use Redis or database)
const pendingPayments = new Map<
  string,
  {
    ip: string;
    phone: string;
    planId: string;
    duration: string;
    amount: number;
    timestamp: number;
  }
>();

// Middleware to get real client IP
app.use((req, res, next) => {
  const forwarded = req.headers["x-forwarded-for"] as string;
  const realIp = req.headers["x-real-ip"] as string;
  const remoteAddress = req.socket.remoteAddress;

  req.clientIP = forwarded?.split(",")[0] || realIp || remoteAddress || "10.5.50.100";
  next();
});

declare global {
  namespace Express {
    interface Request {
      clientIP: string;
    }
  }
}

// Serve React build files
app.use(express.static(path.join(__dirname, "../../../frontend/build")));

// Process M-Pesa payment
async function processMpesaPayment(
  phone: string,
  planId: string,
  clientIP: string
): Promise<{ success: boolean; message: string; checkoutRequestId?: string }> {
  try {
    const amount = getPlanPrice(planId);

    if (amount === 0) {
      return { success: false, message: "Invalid plan selected" };
    }

    logger.info(`Processing M-Pesa payment: ${phone}, Plan: ${planId}, Amount: KSh ${amount}`);

    const stkResponse = await initiateStkPush(phone, amount, `WiFi-${planId}`);

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
    } else {
      return {
        success: false,
        message: stkResponse.errorMessage || "Payment initiation failed"
      };
    }
  } catch (error: any) {
    logger.error("M-Pesa payment processing error:", error);
    return {
      success: false,
      message: error.message || "Payment processing failed"
    };
  }
}

// Helper function to map plan to duration
function getDurationFromPlan(planId: string): string {
  const planDurationMap: Record<string, string> = {
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
    logger.info(`Payment request from IP: ${clientIP}, Plan: ${planId}, Duration: ${duration}`);

    // For free trial, grant immediate access
    if (planId === "community-freebie") {
      const result = await rb951Manager.grantAccessByIP(clientIP, "30m");
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
  } catch (error) {
    logger.error("Payment processing error:", error);
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
    const statusResponse = await queryTransactionStatus(checkoutRequestId);

    if (statusResponse.ResultCode === "0") {
      // Payment successful - grant access
      const accessResult = await rb951Manager.grantAccessByIP(paymentInfo.ip, paymentInfo.duration);

      // Remove from pending payments
      pendingPayments.delete(checkoutRequestId);

      res.json({
        success: accessResult.success,
        message: accessResult.success ? "Payment confirmed! Internet access granted." : accessResult.message,
        paid: true
      });
    } else if (statusResponse.ResultCode === "1032") {
      // User cancelled
      pendingPayments.delete(checkoutRequestId);
      res.json({
        success: false,
        message: "Payment was cancelled",
        cancelled: true
      });
    } else if (statusResponse.ResultCode === "1037") {
      // Timeout
      pendingPayments.delete(checkoutRequestId);
      res.json({
        success: false,
        message: "Payment request timed out",
        timeout: true
      });
    } else {
      // Still pending or other status
      res.json({
        success: false,
        message: "Payment is still being processed",
        pending: true
      });
    }
  } catch (error: any) {
    logger.error("Payment status check error:", error);
    res.status(500).json({
      success: false,
      message: "Error checking payment status"
    });
  }
});

// M-Pesa callback endpoint
app.post("/api/mpesa-callback", (req, res) => {
  logger.info("M-Pesa callback received:", req.body);

  try {
    const {
      Body: { stkCallback }
    } = req.body;
    const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback;

    logger.info(`M-Pesa callback: ${CheckoutRequestID}, Result: ${ResultCode} - ${ResultDesc}`);

    // Find pending payment
    const paymentInfo = pendingPayments.get(CheckoutRequestID);

    if (paymentInfo && ResultCode === 0) {
      // Payment successful - grant access
      rb951Manager
        .grantAccessByIP(paymentInfo.ip, paymentInfo.duration)
        .then(result => {
          logger.info(`Access granted via callback for IP ${paymentInfo.ip}: ${result.message}`);
        })
        .catch(error => {
          logger.error(`Failed to grant access via callback for IP ${paymentInfo.ip}:`, error);
        });
    }

    // Always respond with success to M-Pesa
    res.json({ ResultCode: 0, ResultDesc: "Success" });
  } catch (error) {
    logger.error("M-Pesa callback processing error:", error);
    res.json({ ResultCode: 1, ResultDesc: "Error processing callback" });
  }
});

app.get("/api/session-status", async (req, res) => {
  const clientIP = req.clientIP;

  try {
    const activeUsers = await rb951Manager.getActiveUsers();
    const bindings = await rb951Manager.getActiveBindings();

    const userSession = activeUsers.find((user: any) => user.address === clientIP);
    const userBinding = bindings.find((binding: any) => binding.address === clientIP && binding.type === "bypassed");

    if (userSession || userBinding) {
      res.json({
        hasActiveSession: true,
        timeRemaining: parseInt(userSession?.["session-time-left"] || "1800"),
        plan: { name: userSession?.comment || userBinding?.comment || "Active Session" },
        expiry: userSession
          ? new Date(Date.now() + parseInt(userSession["session-time-left"] || "1800") * 1000)
          : new Date(Date.now() + 30 * 60 * 1000)
      });
    } else {
      res.json({ hasActiveSession: false, timeRemaining: 0, plan: null, expiry: null });
    }
  } catch (error) {
    logger.error("Session status error:", error);
    res.json({ hasActiveSession: false, timeRemaining: 0, plan: null, expiry: null });
  }
});

app.post("/api/disconnect", async (req, res) => {
  const clientIP = req.clientIP;

  try {
    const result = await rb951Manager.disconnectUser(clientIP);
    res.json(result);
  } catch (error) {
    logger.error("Disconnect error:", error);
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
setInterval(
  () => {
    const now = Date.now();
    for (const [checkoutId, payment] of pendingPayments.entries()) {
      if (now - payment.timestamp > 15 * 60 * 1000) {
        // 15 minutes
        pendingPayments.delete(checkoutId);
        logger.info(`Cleaned up expired payment: ${checkoutId}`);
      }
    }
  },
  5 * 60 * 1000
);

// Catch-all handler for React SPA
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "../../../frontend/build", "index.html"));
});

// Initialize server
async function initializeServer() {
  console.log(`🚀 Starting Hotspot Server on http://${SERVER_IP}:${PORT}`);

  try {
    const connectionTest = await rb951Manager.testConnection();
    if (connectionTest.success) {
      console.log(`✅ MikroTik Connection: ${connectionTest.message}`);
      console.log(`📋 Router Info:`, connectionTest.info);
    } else {
      console.warn(`⚠️  MikroTik Connection Warning: ${connectionTest.message}`);
    }
  } catch (error) {
    console.error(`❌ MikroTik Connection Error:`, error);
  }
}

app.listen(PORT, SERVER_IP, () => {
  initializeServer();
});
