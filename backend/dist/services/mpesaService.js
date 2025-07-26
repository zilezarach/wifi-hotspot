"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMpesaToken = getMpesaToken;
exports.initiateStkPush = initiateStkPush;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
async function getMpesaToken() {
    try {
        const url = process.env.NODE_ENV === "production"
            ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
            : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
        const response = await axios_1.default.get(url, {
            auth: {
                username: process.env.MPESA_CONSUMER_KEY,
                password: process.env.MPESA_CONSUMER_SECRET,
            },
        });
        return response.data.access_token;
    }
    catch (err) {
        logger_1.default.error("Token error", err.response?.data || err.message);
        throw err;
    }
}
async function initiateStkPush(phone, amount) {
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
        AccountReference: "ZileHotspot",
        TransactionDesc: "WiFi Access Payment",
    };
    const url = process.env.NODE_ENV === "production"
        ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
    try {
        const response = await axios_1.default.post(url, payload, {
            headers: { Authorization: `Bearer ${token}` },
        });
        return response.data;
    }
    catch (error) {
        logger_1.default.error("M-Pesa initiation error:", error);
        throw error;
    }
}
