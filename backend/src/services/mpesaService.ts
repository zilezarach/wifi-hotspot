import axios from "axios";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import logger from "../utils/logger";

const prisma = new PrismaClient();

interface MpesaCredentials {
  shortcode: string;
  consumerKey: string;
  consumerSecret: string;
  passkey: string;
}

interface StkPushParams {
  tenantId: string;
  phoneNumber: string;
  amount: number;
  accountReference: string;
  transactionDesc: string;
}

class MultiTenantMpesaService {
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  /**
   * Get tenant's M-Pesa credentials
   */
  private async getCredentials(tenantId: string): Promise<MpesaCredentials> {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId }
    });

    if (!tenant) {
      throw new Error(`Tenant ${tenantId} not found`);
    }
    if (tenant.usesOwnMpesa && tenant.mpesaShortcode) {
      return {
        shortcode: tenant.mpesaShortcode,
        consumerKey: this.decryptField(tenant.mpesaKey!),
        consumerSecret: this.decryptField(tenant.mpesaSecret!),
        passkey: this.decryptField(tenant.mpesaPasskey!)
      };
    }
    // Fall back to default/system M-Pesa
    return {
      shortcode: process.env.MPESA_SHORTCODE!,
      consumerKey: process.env.MPESA_CONSUMER_KEY!,
      consumerSecret: process.env.MPESA_CONSUMER_SECRET!,
      passkey: process.env.MPESA_PASSKEY!
    };
  }

  /**
   * Get M-Pesa OAuth token (with caching per tenant)
   */
  private async getToken(tenantId: string): Promise<string> {
    // Check cache
    const cached = this.tokenCache.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.token;
    }

    try {
      const credentials = await this.getCredentials(tenantId);

      const url =
        process.env.NODE_ENV === "production"
          ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
          : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

      const response = await axios.get(url, {
        auth: {
          username: credentials.consumerKey,
          password: credentials.consumerSecret
        },
        timeout: 30000
      });

      if (!response.data.access_token) {
        throw new Error("No access token received from M-Pesa API");
      }

      const expiresAt = Date.now() + 50 * 60 * 1000;
      this.tokenCache.set(tenantId, {
        token: response.data.access_token,
        expiresAt
      });

      logger.info(`✅ M-Pesa token obtained for tenant ${tenantId}`);
      return response.data.access_token;
    } catch (err: any) {
      const errorMsg =
        err.response?.data?.errorMessage ||
        err.response?.data?.error_description ||
        err.message ||
        "Unknown M-Pesa API error";

      logger.error(`❌ M-Pesa token error for tenant ${tenantId}:`, {
        status: err.response?.status,
        data: err.response?.data,
        message: errorMsg
      });

      throw new Error(`Failed to get M-Pesa token: ${errorMsg}`);
    }
  }

  /**
   * Format phone number to M-Pesa format (254XXXXXXXXX)
   */
  formatPhoneNumber(phone: string): string {
    let cleaned = phone.replace(/[\s\-\+]/g, "");

    if (cleaned.startsWith("07") && cleaned.length === 10) {
      cleaned = "254" + cleaned.substring(1);
    }
    if (cleaned.startsWith("7") && cleaned.length === 9) {
      cleaned = "254" + cleaned;
    }
    if (cleaned.startsWith("01") && cleaned.length === 10) {
      cleaned = "254" + cleaned.substring(1);
    }
    // Validate format
    if (!/^254\d{9}$/.test(cleaned)) {
      throw new Error("Invalid phone number format. Use 254XXXXXXXXX");
    }
    return cleaned;
  }

  /**
   * Initiate STK Push payment
   */
  async initiateStkPush(params: StkPushParams): Promise<any> {
    const { tenantId, phoneNumber, amount, accountReference, transactionDesc } = params;

    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const token = await this.getToken(tenantId);
      const credentials = await this.getCredentials(tenantId);

      const timestamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, -3);

      const password = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString("base64");

      const callbackUrl = `${process.env.CALLBACK_BASE_URL || process.env.DOMAIN}/api/mpesa/callback`;

      const payload = {
        BusinessShortCode: credentials.shortcode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: formattedPhone,
        PartyB: credentials.shortcode,
        PhoneNumber: formattedPhone,
        CallBackURL: callbackUrl,
        AccountReference: accountReference,
        TransactionDesc: transactionDesc
      };

      const url =
        process.env.NODE_ENV === "production"
          ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
          : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

      logger.info(` Initiating STK push for ${formattedPhone}, amount: KSh ${amount} (tenant: ${tenantId})`);
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      });

      logger.info(` STK push initiated:`, {
        CheckoutRequestID: response.data.CheckoutRequestID,
        MerchantRequestID: response.data.MerchantRequestID,
        tenantId
      });

      return response.data;
    } catch (error: any) {
      logger.error(` M-Pesa STK push error (tenant ${tenantId}):`, error.response?.data || error.message);
      throw new Error(`M-Pesa payment failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Query STK Push status
   */
  async queryTransactionStatus(tenantId: string, checkoutRequestId: string): Promise<any> {
    try {
      const token = await this.getToken(tenantId);
      const credentials = await this.getCredentials(tenantId);

      const timestamp = new Date()
        .toISOString()
        .replace(/[^0-9]/g, "")
        .slice(0, -3);

      const password = Buffer.from(`${credentials.shortcode}${credentials.passkey}${timestamp}`).toString("base64");

      const payload = {
        BusinessShortCode: credentials.shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId
      };

      const url =
        process.env.NODE_ENV === "production"
          ? "https://api.safaricom.co.ke/mpesa/stkpushquery/v1/query"
          : "https://sandbox.safaricom.co.ke/mpesa/stkpushquery/v1/query";

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        timeout: 30000
      });

      return response.data;
    } catch (error: any) {
      logger.error(`❌ M-Pesa query error (tenant ${tenantId}):`, error.response?.data || error.message);
      throw new Error(`Transaction query failed: ${error.response?.data?.errorMessage || error.message}`);
    }
  }

  /**
   * Process M-Pesa callback
   */
  async processCallback(callbackData: any): Promise<void> {
    try {
      const stkCallback = callbackData.Body?.stkCallback;

      if (!stkCallback) {
        logger.warn("Invalid M-Pesa callback data received");
        return;
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;

      logger.info(` M-Pesa callback received:`, {
        checkoutRequestId,
        resultCode,
        resultDesc
      });

      // Find transaction
      const transaction = await prisma.transaction.findUnique({
        where: { checkoutRequestId },
        include: {
          tenant: true
        }
      });

      if (!transaction) {
        logger.warn(`⚠️ Transaction not found for CheckoutRequestID: ${checkoutRequestId}`);
        return;
      }

      if (resultCode === 0) {
        // Payment successful
        const callbackMetadata = stkCallback.CallbackMetadata?.Item || [];
        const mpesaReceiptNumber = callbackMetadata.find((item: any) => item.Name === "MpesaReceiptNumber")?.Value;

        const transactionDate = callbackMetadata.find((item: any) => item.Name === "TransactionDate")?.Value;

        // Update transaction
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "COMPLETED",
            resultCode,
            resultDesc,
            mpesaReceiptNumber,
            transactionDate: transactionDate ? this.parseTransactionDate(transactionDate) : new Date()
          }
        });
        const session = await prisma.session.findFirst({
          where: {
            transactionId: transaction.id,
            status: "PENDING"
          },
          include: {
            plan: true
          }
        });

        if (session) {
          logger.info(`Payment successful for session ${session.id}, activating...`);

          await prisma.session.update({
            where: { id: session.id },
            data: { status: "ACTIVE" }
          });
          const { mikroTikService } = await import("./mikrotik-service");

          const granted = await mikroTikService.grantAccess({
            tenantId: transaction.tenantId,
            mac: session.mac,
            ip: session.currentIP!,
            sessionId: session.id,
            duration: session.plan.hours,
            dataCap: session.plan.dataCap || undefined,
            speedLimit: session.plan.speedLimit || undefined
          });

          if (granted) {
            logger.info(` Access granted for session ${session.id} after payment`);
          } else {
            logger.error(` Failed to grant access for session ${session.id} after payment`);

            // Mark session as failed
            await prisma.session.update({
              where: { id: session.id },
              data: {
                status: "CANCELLED",
                terminationReason: "access_grant_failed"
              }
            });
          }
        }
      } else {
        // Payment failed
        logger.error(` Payment failed:`, {
          checkoutRequestId,
          resultCode,
          resultDesc
        });

        // Update transaction
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: {
            status: "FAILED",
            resultCode,
            resultDesc,
            failureReason: resultDesc
          }
        });

        // Cancel associated session
        await prisma.session.updateMany({
          where: {
            transactionId: transaction.id,
            status: "PENDING"
          },
          data: {
            status: "CANCELLED",
            terminationReason: "payment_failed"
          }
        });
      }
    } catch (error) {
      logger.error("Error processing M-Pesa callback:", error);
      throw error;
    }
  }

  /**
   * Parse M-Pesa transaction date (YYYYMMDDHHMMSS)
   */
  private parseTransactionDate(dateStr: string): Date {
    try {
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1; // 0-indexed
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(dateStr.substring(8, 10));
      const minute = parseInt(dateStr.substring(10, 12));
      const second = parseInt(dateStr.substring(12, 14));

      return new Date(year, month, day, hour, minute, second);
    } catch (error) {
      logger.warn("Failed to parse transaction date:", dateStr);
      return new Date();
    }
  }
  /**
   * Decrypt encrypted field
   */
  private decryptField(encryptedValue: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encryptedValue.split(":");

      if (!ivHex || !authTagHex || !encrypted) {
        // Not encrypted, return as-is
        return encryptedValue;
      }

      const algorithm = "aes-256-gcm";
      const key = Buffer.from(process.env.ENCRYPTION_KEY || "default-32-char-key-change-this!", "utf8");

      const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("Failed to decrypt field:", error);
      return encryptedValue;
    }
  }

  /**
   * Encrypt sensitive field
   */
  encryptField(value: string): string {
    try {
      const algorithm = "aes-256-gcm";
      const key = Buffer.from(process.env.ENCRYPTION_KEY || "default-32-char-key-change-this!", "utf8");
      const iv = crypto.randomBytes(16);

      const cipher = crypto.createCipheriv(algorithm, key, iv);
      let encrypted = cipher.update(value, "utf8", "hex");
      encrypted += cipher.final("hex");

      const authTag = cipher.getAuthTag();

      return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
    } catch (error) {
      logger.error("Failed to encrypt field:", error);
      return value;
    }
  }
}

export const mpesaService = new MultiTenantMpesaService();

export default mpesaService;
