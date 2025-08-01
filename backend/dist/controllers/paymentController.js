"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantFreeAccess = grantFreeAccess;
exports.disconnectUser = disconnectUser;
exports.showPortal = showPortal;
exports.getPlans = getPlans;
exports.initiatePayment = initiatePayment;
exports.getSessionStatus = getSessionStatus;
exports.getDataUsageStatus = getDataUsageStatus;
exports.disconnectSession = disconnectSession;
exports.mpesaCallback = mpesaCallback;
exports.startDataCapMonitoring = startDataCapMonitoring;
exports.getSystemStatus = getSystemStatus;
const client_1 = require("@prisma/client");
const mpesaService_1 = require("../services/mpesaService");
const mikrotik_rb951_1 = require("../services/mikrotik-rb951");
const logger_1 = __importDefault(require("../utils/logger"));
const date_fns_1 = require("date-fns");
const prisma = new client_1.PrismaClient();
const PLANS = [
    {
        id: "quick-surf",
        name: "Quick Surf",
        hours: 1,
        price: 10,
        dataCap: null,
        description: "1 Hour (Unlimited Data)"
    },
    {
        id: "daily-boost",
        name: "Daily Boost",
        hours: 24,
        price: 50,
        dataCap: 5000, // 5GB in MB
        description: "24 Hours (5GB Data Cap)"
    },
    {
        id: "family-share",
        name: "Family Share",
        hours: 24,
        price: 80,
        dataCap: 10000, // 10GB in MB
        description: "24 Hours (10GB Shared Data)"
    },
    {
        id: "weekly-unlimited",
        name: "Weekly Unlimited",
        hours: 168,
        price: 200,
        dataCap: null,
        description: "7 Days (Unlimited Data, up to 5Mbps)"
    },
    {
        id: "community-freebie",
        name: "Community Freebie",
        hours: 0.5,
        price: 0,
        dataCap: 100, // 100MB for free plan
        description: "30 Minutes/Day (100MB Data Cap)"
    }
];
// Helper function to get user IP consistently
function getUserIP(req) {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string") {
        return forwarded.split(",")[0].trim();
    }
    if (Array.isArray(forwarded)) {
        return forwarded[0].trim();
    }
    return req.socket.remoteAddress || req.ip || "unknown";
}
//Free Access
async function grantFreeAccess(req, res) {
    try {
        const { ip, mac, duration } = req.body;
        if (!ip) {
            return res.status(400).json({
                success: false,
                message: "IP address required"
            });
        }
        logger_1.default.info(`Granting free access to IP: ${ip}, MAC: ${mac}, Duration: ${duration}`);
        // Check for existing active session
        const existingSession = await prisma.session.findFirst({
            where: {
                OR: [{ ip }, { mac: mac && mac !== "00:00:00:00:00:00" ? mac : undefined }].filter(Boolean),
                paid: true,
                expiry: { gt: new Date() }
            }
        });
        if (existingSession) {
            return res.status(400).json({
                success: false,
                message: "You already have an active session"
            });
        }
        // Create free session using your existing PLANS array
        const freePlan = PLANS.find(p => p.id === "community-freebie");
        if (!freePlan) {
            return res.status(500).json({
                success: false,
                message: "Free plan not available"
            });
        }
        const expiry = new Date(Date.now() + freePlan.hours * 60 * 60 * 1000);
        const session = await prisma.session.create({
            data: {
                mac: mac || "00:00:00:00:00:00",
                ip,
                planName: freePlan.name,
                planHours: freePlan.hours,
                dataCap: freePlan.dataCap,
                expiry,
                paid: true
            }
        });
        // Grant access using your existing grantAccess function
        const accessResult = await grantAccess(ip, true, // is limited
        freePlan.dataCap, freePlan.hours.toString());
        if (accessResult.success) {
            logger_1.default.info(`✅ Free access granted to ${ip} for ${duration}`);
            res.json({
                success: true,
                message: "🎁 Free access granted! Enjoy your trial.",
                session: {
                    id: session.id,
                    planName: session.planName,
                    expiry: session.expiry,
                    dataCap: session.dataCap
                }
            });
        }
        else {
            // Clean up session if access grant failed
            await prisma.session.delete({ where: { id: session.id } });
            logger_1.default.error(`❌ Failed to grant free access to ${ip}: ${accessResult.message}`);
            res.status(500).json({
                success: false,
                message: accessResult.message
            });
        }
    }
    catch (error) {
        logger_1.default.error("Free access grant error:", error);
        res.status(500).json({
            success: false,
            message: "Failed to grant access"
        });
    }
}
// Grant access through MikroTik
async function grantAccess(ip, isLimited, dataCap, duration) {
    try {
        // First try to get MAC address
        const mac = await mikrotik_rb951_1.rb951Manager.getUserMac(ip);
        if (mac === "00:00:00:00:00:00") {
            logger_1.default.warn(`Could not determine MAC for IP ${ip}, proceeding with IP-only binding`);
        }
        // Determine access duration for MikroTik profiles
        let mikrotikDuration = "1Hr"; // default
        if (duration) {
            const hours = parseFloat(duration);
            if (hours <= 0.5)
                mikrotikDuration = "30m";
            else if (hours <= 1)
                mikrotikDuration = "1Hr";
            else if (hours <= 4)
                mikrotikDuration = "4Hrs";
            else if (hours <= 12)
                mikrotikDuration = "12Hrs";
            else
                mikrotikDuration = "24Hrs";
        }
        // Grant access based on whether it's limited or unlimited
        let result;
        if (isLimited || dataCap) {
            // For limited access, use IP binding with bypassed type but we'll monitor usage
            result = await mikrotik_rb951_1.rb951Manager.grantAccessByIP(ip, mikrotikDuration);
        }
        else {
            // For unlimited access
            result = await mikrotik_rb951_1.rb951Manager.grantAccessByIP(ip, mikrotikDuration);
        }
        if (result.success) {
            logger_1.default.info(`✅ Access granted for IP ${ip}, MAC: ${mac}, Duration: ${mikrotikDuration}, DataCap: ${dataCap || "unlimited"}`);
        }
        return result;
    }
    catch (error) {
        logger_1.default.error(`❌ Failed to grant access for ${ip}:`, error);
        return {
            success: false,
            message: `Failed to grant access: ${error.message || error}`
        };
    }
}
// Check and enforce data cap
async function checkDataCapExceeded(ip, dataCap) {
    try {
        const activeUsers = await mikrotik_rb951_1.rb951Manager.getActiveUsers();
        const user = activeUsers.find((u) => u.address === ip);
        if (user) {
            const bytesIn = parseInt(user["bytes-in"] || "0");
            const bytesOut = parseInt(user["bytes-out"] || "0");
            const totalBytes = bytesIn + bytesOut;
            const totalMB = totalBytes / (1024 * 1024);
            logger_1.default.info(`📊 Data usage for ${ip}: ${totalMB.toFixed(2)}MB / ${dataCap}MB`);
            if (totalMB >= dataCap) {
                logger_1.default.warn(`🚫 Data cap exceeded for ${ip}: ${totalMB.toFixed(2)}MB >= ${dataCap}MB`);
                return true;
            }
        }
        return false;
    }
    catch (error) {
        logger_1.default.error(`Error checking data cap for ${ip}:`, error);
        return false;
    }
}
// Get data usage for a user
async function getDataUsage(ip) {
    try {
        const activeUsers = await mikrotik_rb951_1.rb951Manager.getActiveUsers();
        const user = activeUsers.find((u) => u.address === ip);
        if (user) {
            const uploaded = parseInt(user["bytes-out"] || "0");
            const downloaded = parseInt(user["bytes-in"] || "0");
            const total = uploaded + downloaded;
            const totalMB = total / (1024 * 1024);
            return { uploaded, downloaded, total, totalMB };
        }
        return { uploaded: 0, downloaded: 0, total: 0, totalMB: 0 };
    }
    catch (error) {
        logger_1.default.error(`Error getting data usage for ${ip}:`, error);
        return { uploaded: 0, downloaded: 0, total: 0, totalMB: 0 };
    }
}
async function disconnectUser(req, res) {
    const userIp = getUserIP(req);
    try {
        const userMac = await mikrotik_rb951_1.rb951Manager.getUserMac(userIp);
        const session = await prisma.session.findFirst({
            where: {
                OR: [{ ip: userIp }, { mac: userMac !== "00:00:00:00:00:00" ? userMac : undefined }].filter(Boolean),
                paid: true,
                expiry: { gt: new Date() }
            }
        });
        if (!session) {
            return res.status(404).json({
                success: false,
                message: "No active session found"
            });
        }
        // Disconnect from MikroTik using your existing rb951Manager
        const disconnectResult = await mikrotik_rb951_1.rb951Manager.disconnectUser(userIp);
        // Expire the session in database
        await prisma.session.update({
            where: { id: session.id },
            data: { expiry: new Date() }
        });
        logger_1.default.info(`🚪 User ${userIp} disconnected successfully`);
        res.json({
            success: true,
            message: "Session disconnected successfully",
            disconnectResult
        });
    }
    catch (error) {
        logger_1.default.error("Disconnect session error:", error);
        res.status(500).json({
            success: false,
            message: "Server error"
        });
    }
}
async function showPortal(req, res) {
    try {
        // Extract MikroTik parameters for logging
        const { mac, ip, username, "link-login": linkLogin, "link-orig": linkOrig } = req.query;
        if (ip && mac) {
            logger_1.default.info(`Portal access from IP: ${ip}, MAC: ${mac}`);
        }
        // Serve the React app (built with Vite)
        res.sendFile("index.html", { root: "public" });
    }
    catch (error) {
        logger_1.default.error("Portal display error:", error);
        res.status(500).json({ error: "Portal temporarily unavailable" });
    }
}
async function getPlans(req, res) {
    try {
        res.json({
            success: true,
            plans: PLANS.map(plan => ({
                ...plan,
                dataCapGB: plan.dataCap ? (plan.dataCap / 1000).toFixed(1) : null
            }))
        });
    }
    catch (error) {
        logger_1.default.error("Error fetching plans:", error);
        res.status(500).json({ error: "Failed to fetch plans" });
    }
}
async function initiatePayment(req, res) {
    const freeMode = process.env.FREE_MODE === "true";
    const freeModeEndDate = process.env.FREE_MODE_END_DATE ? (0, date_fns_1.parseISO)(process.env.FREE_MODE_END_DATE) : null;
    const isFreePeriodActive = freeMode && freeModeEndDate && (0, date_fns_1.isBefore)(new Date(), freeModeEndDate);
    const userIp = getUserIP(req);
    logger_1.default.info(`🌐 Payment initiation from IP: ${userIp}`);
    try {
        const userMac = await mikrotik_rb951_1.rb951Manager.getUserMac(userIp);
        logger_1.default.info(`📱 User MAC: ${userMac}`);
        // Check for existing active session
        const existingSession = await prisma.session.findFirst({
            where: {
                OR: [{ ip: userIp }, { mac: userMac !== "00:00:00:00:00:00" ? userMac : undefined }].filter(Boolean),
                paid: true,
                expiry: { gt: new Date() }
            },
            orderBy: { id: "desc" }
        });
        if (existingSession) {
            return res.status(400).json({
                error: "You already have an active session",
                session: {
                    planName: existingSession.planName,
                    expiry: existingSession.expiry
                }
            });
        }
        // Handle free promo period
        if (isFreePeriodActive) {
            const expiry = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h free
            const session = await prisma.session.create({
                data: {
                    mac: userMac,
                    ip: userIp,
                    planName: "Free Promo",
                    planHours: 24,
                    dataCap: 1000, // 1GB for promo
                    expiry,
                    paid: true
                }
            });
            const accessResult = await grantAccess(userIp, true, 1000, "24");
            if (accessResult.success) {
                return res.json({
                    success: true,
                    message: "🎉 Welcome! Enjoy free access during the promo period.",
                    session: {
                        id: session.id,
                        planName: session.planName,
                        expiry: session.expiry,
                        dataCap: session.dataCap
                    }
                });
            }
            else {
                await prisma.session.delete({ where: { id: session.id } });
                return res.status(500).json({ error: "Failed to grant access" });
            }
        }
        const { planId, phone } = req.body;
        if (!planId) {
            return res.status(400).json({ error: "Missing planId" });
        }
        const selectedPlan = PLANS.find(p => p.id === planId);
        if (!selectedPlan) {
            return res.status(400).json({ error: "Invalid plan selected" });
        }
        const expiry = new Date(Date.now() + selectedPlan.hours * 60 * 60 * 1000);
        // Handle free plans
        if (selectedPlan.price === 0) {
            const session = await prisma.session.create({
                data: {
                    mac: userMac,
                    ip: userIp,
                    planName: selectedPlan.name,
                    planHours: selectedPlan.hours,
                    dataCap: selectedPlan.dataCap,
                    expiry,
                    paid: true
                }
            });
            const accessResult = await grantAccess(userIp, true, selectedPlan.dataCap, selectedPlan.hours.toString());
            if (accessResult.success) {
                return res.json({
                    success: true,
                    message: `🎁 Free access granted for ${selectedPlan.hours * 60} minutes!`,
                    session: {
                        id: session.id,
                        planName: session.planName,
                        expiry: session.expiry,
                        dataCap: session.dataCap
                    }
                });
            }
            else {
                await prisma.session.delete({ where: { id: session.id } });
                return res.status(500).json({ error: "Failed to grant access" });
            }
        }
        // Handle paid plans
        if (!phone || !/^254\d{9}$/.test(phone)) {
            return res.status(400).json({
                error: "Invalid or missing phone number (format: 254xxxxxxxxx)"
            });
        }
        const stkResponse = await (0, mpesaService_1.initiateStkPush)(phone, selectedPlan.price);
        if (stkResponse.ResponseCode === "0") {
            const checkoutRequestId = stkResponse.CheckoutRequestID;
            const session = await prisma.session.create({
                data: {
                    mac: userMac,
                    ip: userIp,
                    planName: selectedPlan.name,
                    planHours: selectedPlan.hours,
                    dataCap: selectedPlan.dataCap,
                    expiry,
                    paid: false,
                    checkoutRequestId
                }
            });
            res.json({
                success: true,
                message: "📱 Payment request sent. Complete on your phone.",
                checkoutRequestId,
                session: {
                    id: session.id,
                    planName: session.planName,
                    amount: selectedPlan.price
                }
            });
        }
        else {
            logger_1.default.error("STK Push failed:", stkResponse);
            res.status(500).json({ error: "Payment initiation failed. Please try again." });
        }
    }
    catch (error) {
        logger_1.default.error("Payment initiation error:", error);
        res.status(500).json({ error: "Server error. Please try again." });
    }
}
async function getSessionStatus(req, res) {
    const userIp = getUserIP(req);
    try {
        const userMac = await mikrotik_rb951_1.rb951Manager.getUserMac(userIp);
        const session = await prisma.session.findFirst({
            where: {
                OR: [{ ip: userIp }, { mac: userMac !== "00:00:00:00:00:00" ? userMac : undefined }].filter(Boolean),
                paid: true,
                expiry: { gt: new Date() }
            },
            orderBy: { id: "desc" }
        });
        if (!session) {
            return res.json({
                hasActiveSession: false,
                timeRemaining: 0,
                plan: null,
                dataUsage: null
            });
        }
        // Check if data cap exceeded
        if (session.dataCap) {
            const exceeded = await checkDataCapExceeded(userIp, session.dataCap);
            if (exceeded) {
                // Disconnect user and expire session
                await mikrotik_rb951_1.rb951Manager.disconnectUser(userIp);
                await prisma.session.update({
                    where: { id: session.id },
                    data: { expiry: new Date() }
                });
                return res.json({
                    hasActiveSession: false,
                    timeRemaining: 0,
                    plan: null,
                    dataUsage: null,
                    message: "Data cap exceeded. Session terminated."
                });
            }
        }
        const now = new Date();
        const timeRemaining = Math.max(0, Math.floor((session.expiry.getTime() - now.getTime()) / 1000));
        // Get current data usage
        const dataUsage = await getDataUsage(userIp);
        res.json({
            hasActiveSession: true,
            timeRemaining,
            plan: {
                name: session.planName,
                hours: session.planHours,
                dataCap: session.dataCap,
                dataCapGB: session.dataCap ? (session.dataCap / 1000).toFixed(1) : null
            },
            expiry: session.expiry,
            dataUsage: {
                totalMB: Math.round(dataUsage.totalMB * 100) / 100,
                uploadedMB: Math.round((dataUsage.uploaded / (1024 * 1024)) * 100) / 100,
                downloadedMB: Math.round((dataUsage.downloaded / (1024 * 1024)) * 100) / 100,
                remainingMB: session.dataCap ? Math.max(0, session.dataCap - dataUsage.totalMB) : null,
                percentUsed: session.dataCap ? Math.min(100, (dataUsage.totalMB / session.dataCap) * 100) : null
            }
        });
    }
    catch (error) {
        logger_1.default.error("Session status error:", error);
        res.status(500).json({ error: "Server error" });
    }
}
async function getDataUsageStatus(req, res) {
    const userIp = getUserIP(req);
    try {
        const session = await prisma.session.findFirst({
            where: {
                ip: userIp,
                paid: true,
                expiry: { gt: new Date() }
            }
        });
        if (!session || !session.dataCap) {
            return res.json({ hasDataCap: false });
        }
        const usage = await getDataUsage(userIp);
        const percentUsed = (usage.totalMB / session.dataCap) * 100;
        res.json({
            hasDataCap: true,
            dataCap: session.dataCap,
            dataCapGB: (session.dataCap / 1000).toFixed(1),
            used: Math.round(usage.totalMB * 100) / 100,
            remaining: Math.max(0, session.dataCap - usage.totalMB),
            percentUsed: Math.round(percentUsed * 100) / 100,
            nearLimit: percentUsed > 80,
            exceeded: percentUsed >= 100
        });
    }
    catch (error) {
        logger_1.default.error("Data usage status error:", error);
        res.status(500).json({ error: "Server error" });
    }
}
async function disconnectSession(req, res) {
    const userIp = getUserIP(req);
    try {
        const session = await prisma.session.findFirst({
            where: {
                ip: userIp,
                paid: true,
                expiry: { gt: new Date() }
            }
        });
        if (!session) {
            return res.status(404).json({ error: "No active session found" });
        }
        // Disconnect from MikroTik
        const disconnectResult = await mikrotik_rb951_1.rb951Manager.disconnectUser(userIp);
        // Expire the session in database
        await prisma.session.update({
            where: { id: session.id },
            data: { expiry: new Date() }
        });
        res.json({
            success: true,
            message: "Session disconnected successfully",
            disconnectResult
        });
    }
    catch (error) {
        logger_1.default.error("Disconnect session error:", error);
        res.status(500).json({ error: "Server error" });
    }
}
async function mpesaCallback(req, res) {
    try {
        const data = req.body.Body?.stkCallback;
        if (!data) {
            return res.status(400).send("Invalid callback data");
        }
        const checkoutRequestId = data.CheckoutRequestID;
        logger_1.default.info(`📞 M-Pesa callback received for ${checkoutRequestId}`);
        if (data.ResultCode === 0) {
            // Payment successful
            const session = await prisma.session.findFirst({
                where: {
                    checkoutRequestId,
                    paid: false
                }
            });
            if (session) {
                // Update session as paid
                await prisma.session.update({
                    where: { id: session.id },
                    data: { paid: true }
                });
                // Grant access
                const accessResult = await grantAccess(session.ip, !!session.dataCap, session.dataCap, session.planHours.toString());
                if (accessResult.success) {
                    logger_1.default.info(`✅ Payment successful and access granted for session ${session.id}`);
                }
                else {
                    logger_1.default.error(`❌ Payment successful but failed to grant access for session ${session.id}`);
                }
            }
            else {
                logger_1.default.warn(`⚠️ No matching session found for CheckoutRequestID: ${checkoutRequestId}`);
            }
        }
        else {
            // Payment failed
            logger_1.default.error("💳 Payment failed:", {
                checkoutRequestId,
                resultCode: data.ResultCode,
                resultDesc: data.ResultDesc
            });
            // Optionally clean up failed session
            const session = await prisma.session.findFirst({
                where: { checkoutRequestId, paid: false }
            });
            if (session) {
                await prisma.session.delete({ where: { id: session.id } });
            }
        }
        res.send("OK");
    }
    catch (error) {
        logger_1.default.error("M-Pesa callback error:", error);
        res.status(500).send("Error processing callback");
    }
}
// Background job to monitor data caps and expired sessions
async function startDataCapMonitoring() {
    const monitoringInterval = setInterval(async () => {
        try {
            const activeSessions = await prisma.session.findMany({
                where: {
                    paid: true,
                    expiry: { gt: new Date() },
                    dataCap: { not: null }
                }
            });
            logger_1.default.info(`🔍 Monitoring ${activeSessions.length} sessions with data caps`);
            for (const session of activeSessions) {
                if (session.dataCap) {
                    const exceeded = await checkDataCapExceeded(session.ip, session.dataCap);
                    if (exceeded) {
                        logger_1.default.warn(`🚫 Terminating session ${session.id} due to data cap exceeded`);
                        // Disconnect user
                        await mikrotik_rb951_1.rb951Manager.disconnectUser(session.ip);
                        // Expire session
                        await prisma.session.update({
                            where: { id: session.id },
                            data: { expiry: new Date() }
                        });
                    }
                }
            }
        }
        catch (error) {
            logger_1.default.error("Data cap monitoring error:", error);
        }
    }, 60000); // Check every minute
    // Clean up expired sessions every 5 minutes
    const cleanupInterval = setInterval(async () => {
        try {
            const expiredSessions = await prisma.session.findMany({
                where: {
                    paid: true,
                    expiry: { lt: new Date() }
                }
            });
            logger_1.default.info(`🧹 Cleaning up ${expiredSessions.length} expired sessions`);
            for (const session of expiredSessions) {
                await mikrotik_rb951_1.rb951Manager.disconnectUser(session.ip);
            }
        }
        catch (error) {
            logger_1.default.error("Session cleanup error:", error);
        }
    }, 300000); // Every 5 minutes
    logger_1.default.info("📊 Data cap monitoring and session cleanup started");
    return { monitoringInterval, cleanupInterval };
}
// System status endpoint
async function getSystemStatus(req, res) {
    try {
        const [mikrotikStatus, activeUsers, activeSessions, todaysSessions] = await Promise.all([
            mikrotik_rb951_1.rb951Manager.testConnection(),
            mikrotik_rb951_1.rb951Manager.getActiveUsers(),
            prisma.session.count({
                where: {
                    paid: true,
                    expiry: { gt: new Date() }
                }
            }),
            prisma.session.count({
                where: {
                    paid: true,
                    createdAt: {
                        gte: new Date(new Date().setHours(0, 0, 0, 0))
                    }
                }
            })
        ]);
        res.json({
            mikrotik: mikrotikStatus,
            stats: {
                activeUsers: activeUsers.length,
                activeSessions,
                todaysSessions
            },
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        logger_1.default.error("System status error:", error);
        res.status(500).json({ error: "Failed to get system status" });
    }
}
