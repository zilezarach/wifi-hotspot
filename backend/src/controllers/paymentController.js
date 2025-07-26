"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showPortal = showPortal;
exports.initiatePayment = initiatePayment;
exports.mpesaCallback = mpesaCallback;
const prisma_1 = require("../generated/prisma");
const mpesaService_1 = require("../services/mpesaService");
const accessService_1 = require("../services/accessService");
const logger_1 = __importDefault(require("../utils/logger"));
const prisma = new prisma_1.PrismaClient();
const PLANS = [
    {
        id: "quick-surf",
        name: "Quick Surf",
        hours: 1,
        price: 10,
        dataCap: null,
        description: "1 Hour (Unlimited Data)",
    },
    {
        id: "daily-boost",
        name: "Daily Boost",
        hours: 24,
        price: 50,
        dataCap: 5000,
        description: "24 Hours (5GB Data Cap)",
    },
    {
        id: "family-share",
        name: "Family Share",
        hours: 24,
        price: 80,
        dataCap: 10000,
        description: "24 Hours (10GB Shared Data)",
    },
    {
        id: "weekly-unlimited",
        name: "Weekly Unlimited",
        hours: 168,
        price: 200,
        dataCap: null,
        description: "7 Days (Unlimited Data, up to 5Mbps)",
    },
    {
        id: "community-freebie",
        name: "Community Freebie",
        hours: 0.5,
        price: 0,
        dataCap: null,
        description: "30 Minutes/Day (Essentials Only)",
    },
];
function showPortal(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        res.sendFile("index.html", { root: "public" });
    });
}
function initiatePayment(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        var _a;
        const { planId, phone } = req.body;
        if (!planId) {
            return res.status(400).json({ error: "Missing planId" });
        }
        const selectedPlan = PLANS.find((p) => p.id === planId);
        if (!selectedPlan) {
            return res.status(400).json({ error: "Invalid plan selected" });
        }
        const userIp = (_a = req.ip) !== null && _a !== void 0 ? _a : "unknown";
        const userMac = "00:00:00:00:00:00";
        const expiry = new Date(Date.now() + selectedPlan.hours * 60 * 60 * 1000);
        if (selectedPlan.price === 0) {
            try {
                yield prisma.session.create({
                    data: {
                        mac: userMac,
                        ip: userIp,
                        planName: selectedPlan.name,
                        planHours: selectedPlan.hours,
                        dataCap: selectedPlan.dataCap,
                        expiry,
                        paid: true,
                    },
                });
                yield (0, accessService_1.grantAccess)(userIp);
                return res.json({ message: "Free access granted for 30 minutes!" });
            }
            catch (error) {
                logger_1.default.error("Free plan error:", error);
                return res.status(500).json({ error: "Server error" });
            }
        }
        else {
            if (!phone) {
                return res.status(400).json({ error: "Phone required for paid plans" });
            }
            try {
                const stkResponse = yield (0, mpesaService_1.initiateStkPush)(phone, selectedPlan.price);
                if (stkResponse.ResponseCode === "0") {
                    const checkoutRequestId = stkResponse.CheckoutRequestID;
                    yield prisma.session.create({
                        data: {
                            mac: userMac,
                            ip: userIp,
                            planName: selectedPlan.name,
                            planHours: selectedPlan.hours,
                            dataCap: selectedPlan.dataCap,
                            expiry,
                            paid: false,
                            checkoutRequestId,
                        },
                    });
                    res.json({ message: "Payment request sent. Complete on your phone." });
                }
                else {
                    res.status(500).json({ error: "Payment initiation failed" });
                }
            }
            catch (error) {
                logger_1.default.error("Payment initiation error:", error);
                res.status(500).json({ error: "Server error" });
            }
        }
    });
}
function mpesaCallback(req, res) {
    return __awaiter(this, void 0, void 0, function* () {
        const data = req.body.Body.stkCallback;
        const checkoutRequestId = data.CheckoutRequestID;
        if (data.ResultCode === 0) {
            const session = yield prisma.session.findFirst({
                where: {
                    checkoutRequestId,
                    paid: false,
                },
            });
            if (session) {
                yield prisma.session.update({
                    where: { id: session.id },
                    data: { paid: true },
                });
                yield (0, accessService_1.grantAccess)(session.ip);
                logger_1.default.info("Payment successful for session:", session.id);
            }
            else {
                logger_1.default.warn("No matching session found for CheckoutRequestID:", checkoutRequestId);
            }
        }
        else {
            logger_1.default.error("Payment failed:", data);
        }
        res.send("OK");
    });
}
