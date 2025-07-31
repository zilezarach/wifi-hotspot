"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PLAN_PRICES = void 0;
exports.getMpesaToken = getMpesaToken;
exports.initiateStkPush = initiateStkPush;
exports.queryTransactionStatus = queryTransactionStatus;
exports.getPlanPrice = getPlanPrice;
// backend/src/services/mpesa.ts
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
async function getMpesaToken() {
    try {
        const url = process.env.NODE_ENV === "production"
            ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
            : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
        const response = await axios_1.default.get(url, {
            auth: {
                username: process.env.MPESA_CONSUMER_KEY,
                password: process.env.MPESA_CONSUMER_SECRET
            }
        });
        logger_1.default.info("M-Pesa token obtained successfully");
        return response.data.access_token;
    }
    catch (err) {
        logger_1.default.error("M-Pesa token error", err.response?.data || err.message);
        throw new Error(`Failed to get M-Pesa token: ${err.response?.data?.errorMessage || err.message}`);
    }
}
async function initiateStkPush(phone, amount, reference) {
    try {
        const token = await getMpesaToken();
        const timestamp = new Date()
            .toISOString()
            .replace(/[^0-9]/g, "")
            .slice(0, -3);
        const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
        const payload = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            TransactionType: "CustomerPayBillOnline",
            Amount: amount,
            PartyA: phone,
            PartyB: process.env.MPESA_SHORTCODE,
            PhoneNumber: phone,
            CallBackURL: process.env.MPESA_CALLBACK_URL,
            AccountReference: reference || "ZileHotspot",
            TransactionDesc: "WiFi Access Payment"
        };
        const url = process.env.NODE_ENV === "production"
            ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
            : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
        logger_1.default.info(`Initiating STK push for ${phone}, amount: KSh ${amount}`);
        const response = await axios_1.default.post(url, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        logger_1.default.info("STK push initiated successfully", {
            CheckoutRequestID: response.data.CheckoutRequestID,
            MerchantRequestID: response.data.MerchantRequestID
        });
        return response.data;
    }
    catch (error) {
        logger_1.default.error("M-Pesa STK push error:", error.response?.data || error.message);
        throw new Error(`M-Pesa payment failed: ${error.response?.data?.errorMessage || error.message}`);
    }
}
async function queryTransactionStatus(checkoutRequestId) {
    try {
        const token = await getMpesaToken();
        const timestamp = new Date()
            .toISOString()
            .replace(/[^0-9]/g, "")
            .slice(0, -3);
        const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString("base64");
        const payload = {
            BusinessShortCode: process.env.MPESA_SHORTCODE,
            Password: password,
            Timestamp: timestamp,
            CheckoutRequestID: checkoutRequestId
        };
        const url = process.env.NODE_ENV === "production"
            ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
            : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";
        const response = await axios_1.default.post(url, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json"
            }
        });
        return response.data;
    }
    catch (error) {
        logger_1.default.error("M-Pesa query error:", error.response?.data || error.message);
        throw new Error(`Transaction query failed: ${error.response?.data?.errorMessage || error.message}`);
    }
}
// Plan pricing
exports.PLAN_PRICES = {
    "quick-surf": 10,
    "quick-surf-4h": 30,
    "half-day-boost": 40,
    "daily-boost": 50,
    "weekly-unlimited": 200,
    "community-freebie": 0
};
function getPlanPrice(planId) {
    return exports.PLAN_PRICES[planId] || 0;
}
