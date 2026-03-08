# 💳 M-Pesa Daraja API Integration Guide

This guide walks through setting up M-Pesa Lipa Na M-Pesa STK Push (C2B) payments with the WiFi Hotspot Billing System.

---

## 📋 Overview

The system uses the **Safaricom Daraja API** to trigger STK Push notifications on the customer's phone. When the customer completes payment, Safaricom sends a callback to your server which activates the WiFi session.

**Payment flow:**

```
Customer selects plan
       │
       ▼
Backend calls Daraja STK Push API
       │
       ▼
Safaricom sends STK prompt to customer's phone
       │
       ▼
Customer enters M-Pesa PIN
       │
       ▼
Safaricom calls MPESA_CALLBACK_URL
       │
       ▼
Backend verifies payment → activates session on MikroTik
```

---

## 1. Create a Safaricom Developer Account

1. Visit [developer.safaricom.co.ke](https://developer.safaricom.co.ke)
2. Click **Sign Up** and create an account
3. Verify your email address

---

## 2. Create a Daraja App

1. Log in to the Daraja portal
2. Go to **My Apps → Add a New App**
3. Name your app (e.g., "WiFi Hotspot Billing")
4. Select the APIs you need:
   - ✅ **Lipa Na M-Pesa Online** (STK Push)
5. Click **Create App**

---

## 3. Get Your Credentials

After creating the app, go to the app details page:

| Credential | Where to find it |
|------------|-----------------|
| `Consumer Key` | App details → Keys |
| `Consumer Secret` | App details → Keys |

Set these in your `.env`:

```
MPESA_CONSUMER_KEY=your_consumer_key_here
MPESA_CONSUMER_SECRET=your_consumer_secret_here
```

---

## 4. Understanding Shortcode Types

| Type | Use case |
|------|----------|
| **Paybill** | Business pays to a business account; customer enters account number |
| **Till (Buy Goods)** | Simpler; customer pays to a till number |

For hotspot billing, a **Paybill** number is typical. Set:

```
MPESA_SHORTCODE=your_paybill_or_till_number
```

---

## 5. Generate the Lipa Na M-Pesa Passkey

The passkey is provided by Safaricom when you go live. In the **sandbox environment**, use the test passkey from the Daraja portal:

1. Go to **APIs → Lipa Na M-Pesa Online → Test Credentials**
2. Copy the **Lipa Na M-Pesa Online Passkey**

```
MPESA_PASSKEY=your_passkey_here
```

---

## 6. Set Up the Callback URL

The callback URL must be a **publicly accessible HTTPS URL**. Safaricom cannot reach `localhost`.

```
MPESA_CALLBACK_URL=https://yourdomain.com/api/mpesa_callback
```

> ⚠️ **Important:** The URL must use `https://` in production. For local development use a tunneling tool like [ngrok](https://ngrok.com):
>
> ```bash
> ngrok http 5000
> # Use the generated https URL as MPESA_CALLBACK_URL
> ```

---

## 7. Sandbox Testing

Safaricom provides a sandbox environment for testing without real money.

**Sandbox test credentials:**

| Field | Value |
|-------|-------|
| Phone number | `254708374149` (Safaricom test number) |
| Amount | Any value |
| PIN | Use the sandbox PIN from the Daraja portal |

Test an STK Push via the portal API:

1. Go to **APIs → Lipa Na M-Pesa Online → Simulate**
2. Fill in the form with sandbox credentials

Or test through your application by initiating a payment on the portal.

---

## 8. Going Live (Production)

1. Submit your app for **Go Live** on the Daraja portal
2. Provide:
   - Business registration documents
   - M-Pesa paybill/till confirmation letter from Safaricom
3. Safaricom reviews (typically 2–5 business days)
4. You receive production shortcode, passkey, and credentials
5. Update your `.env` with production values

---

## 9. Webhook Security

The callback endpoint `/api/mpesa_callback` receives payment results. Consider:

- Validating `ResultCode` (0 = success)
- Checking `CheckoutRequestID` matches a pending transaction in your database
- Responding with HTTP 200 quickly (Safaricom retries if no 200 response within 30 seconds)

---

## 10. Common M-Pesa Error Codes

| ResultCode | Meaning |
|-----------|---------|
| 0 | Success |
| 1 | Insufficient funds |
| 17 | Risk management limit exceeded |
| 1032 | Request cancelled by user |
| 1037 | Timeout – user did not respond |
| 2001 | Wrong PIN |
| 1001 | Unable to lock subscriber – try again |

---

## 11. Testing STK Push End-to-End

1. Ensure the server is running and `MPESA_CALLBACK_URL` is publicly accessible
2. Open the portal page (or use the API directly)
3. Select a plan and enter your **Safaricom phone number** (in sandbox use the test number)
4. Check your phone for the STK prompt
5. Enter the PIN
6. Verify the session is created in the database:

```bash
npx prisma studio
# or
psql $DATABASE_URL -c "SELECT * FROM \"Session\" ORDER BY \"createdAt\" DESC LIMIT 5;"
```
