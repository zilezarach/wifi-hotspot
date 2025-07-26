import axios from "axios";
import logger from "../utils/logger";
import { error } from "console";

export async function getMpesaToken(): Promise<string> {
  try {
    const url =
      process.env.NODE_ENV === "production"
        ? "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
    const response = await axios.get(url, {
      auth: {
        username: process.env.MPESA_CONSUMER_KEY!,
        password: process.env.MPESA_CONSUMER_SECRET!,
      },
    });
    return response.data.access_token;
  } catch (err: any) {
    logger.error("Token error", err.response?.data || err.message);
    throw err;
  }
}

export async function initiateStkPush(
  phone: string,
  amount: number
): Promise<any> {
  const token = await getMpesaToken();
  const timestamp = new Date()
    .toISOString()
    .replace(/[^0-9]/g, "")
    .slice(0, -3);
  const password = Buffer.from(
    `${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
  ).toString("base64");

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

  const url =
    process.env.NODE_ENV === "production"
      ? "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
      : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

  try {
    const response = await axios.post(url, payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.data;
  } catch (error) {
    logger.error("M-Pesa initiation error:", error);
    throw error;
  }
}
