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
exports.getMpesaToken = getMpesaToken;
exports.initiateStkPush = initiateStkPush;
const axios_1 = __importDefault(require("axios"));
const logger_1 = __importDefault(require("../utils/logger"));
function getMpesaToken() {
    return __awaiter(this, void 0, void 0, function* () {
        const url = process.env.NODE_ENV === "production"
            ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
            : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
        const response = yield axios_1.default.get(url, {
            auth: {
                username: process.env.MPESA_CONSUMER_KEY,
                password: process.env.MPESA_CONSUMER_SECRET,
            },
        });
        return response.data.access_token;
    });
}
function initiateStkPush(phone, amount) {
    return __awaiter(this, void 0, void 0, function* () {
        const token = yield getMpesaToken();
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
            ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
            : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";
        try {
            const response = yield axios_1.default.post(url, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            return response.data;
        }
        catch (error) {
            logger_1.default.error("M-Pesa initiation error:", error);
            throw error;
        }
    });
}
