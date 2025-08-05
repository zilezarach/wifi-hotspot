// backend/src/services/mpesa.ts
import axios from "axios";
import logger from "../utils/logger";

// Update getMpesaToken function:
export async function getMpesaToken(): Promise<string> {
  try {
    const url =
      process.env.NODE_ENV === "production"
        ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
        : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

    const response = await axios.get(url, {
      auth: {
        username: process.env.MPESA_CONSUMER_KEY!,
        password: process.env.MPESA_CONSUMER_SECRET!,
      },
      timeout: 30000, // Add timeout
    });

    if (!response.data.access_token) {
      throw new Error("No access token received from M-Pesa API");
    }

    logger.info("M-Pesa token obtained successfully");
    return response.data.access_token;
  } catch (err: any) {
    const errorMsg =
      err.response?.data?.errorMessage ||
      err.response?.data?.error_description ||
      err.message ||
      "Unknown M-Pesa API error";

    logger.error("M-Pesa token error", {
      status: err.response?.status,
      data: err.response?.data,
      message: errorMsg,
    });

    throw new Error(`Failed to get M-Pesa token: ${errorMsg}`);
  }
}
export function formatPhoneNumber(phone: string): string {
  // Remove spaces, dashes, plus signs
  let cleaned = phone.replace(/[\s\-\+]/g, "");

  // Convert 07XXXXXXXX to 254XXXXXXXX
  if (cleaned.startsWith("07") && cleaned.length === 10) {
    cleaned = "254" + cleaned.substring(1);
  }

  // Convert 7XXXXXXXX to 254XXXXXXXX
  if (cleaned.startsWith("7") && cleaned.length === 9) {
    cleaned = "254" + cleaned;
  }

  // Validate format
  if (!/^254\d{9}$/.test(cleaned)) {
    throw new Error("Invalid phone number format. Use 254XXXXXXXXX");
  }

  return cleaned;
}

export async function initiateStkPush(
  phone: string,
  amount: number,
  reference?: string
): Promise<any> {
  const formattedNo = formatPhoneNumber(phone);
  try {
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
      AccountReference: reference || "ZileHotspot",
      TransactionDesc: "WiFi Access Payment",
    };

    const url =
      process.env.NODE_ENV === "production"
        ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
        : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

    logger.info(`Initiating STK push for ${phone}, amount: KSh ${amount}`);

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    logger.info("STK push initiated successfully", {
      CheckoutRequestID: response.data.CheckoutRequestID,
      MerchantRequestID: response.data.MerchantRequestID,
    });

    return response.data;
  } catch (error: any) {
    logger.error(
      "M-Pesa STK push error:",
      error.response?.data || error.message
    );
    throw new Error(
      `M-Pesa payment failed: ${
        error.response?.data?.errorMessage || error.message
      }`
    );
  }
}

export async function queryTransactionStatus(
  checkoutRequestId: string
): Promise<any> {
  try {
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
      CheckoutRequestID: checkoutRequestId,
    };

    const url =
      process.env.NODE_ENV === "production"
        ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
        : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    return response.data;
  } catch (error: any) {
    logger.error("M-Pesa query error:", error.response?.data || error.message);
    throw new Error(
      `Transaction query failed: ${
        error.response?.data?.errorMessage || error.message
      }`
    );
  }
}

// Plan pricing
export const PLAN_PRICES: Record<string, number> = {
  "quick-surf": 10,
  "quick-surf-4h": 30,
  "half-day-boost": 40,
  "daily-boost": 50,
  "weekly-unlimited": 200,
  "community-freebie": 0,
};

export function getPlanPrice(planId: string): number {
  return PLAN_PRICES[planId] || 0;
}
