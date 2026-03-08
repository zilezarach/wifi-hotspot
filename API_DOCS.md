# 📖 API Documentation

Base URL: `http://localhost:5000` (development) / `https://yourdomain.com` (production)

All request and response bodies use JSON. Errors follow the format:

```json
{ "error": "Human-readable error message" }
```

---

## Health Check

### `GET /health`

Returns server status.

**Response 200:**

```json
{
  "status": "OK",
  "uptime": 3600.5
}
```

---

## Portal Routes

These routes are used by the captive portal frontend. All portal routes require the tenant to be identified (by subdomain, path segment, or query parameter).

### `GET /`

Serves the hotspot portal page for the detected tenant.

**Tenant detection order:**

1. Subdomain: `java-cafe.yourdomain.com`
2. Path: `yourdomain.com/java-cafe`
3. Query param: `yourdomain.com?tenant=<mikrotikId>`

---

### `POST /payment/initiate`

Initiates an M-Pesa STK Push payment for a WiFi session.

**Rate limit:** 10 requests per minute per IP.

**Request body:**

```json
{
  "phoneNumber": "254712345678",
  "planId": "uuid-of-plan",
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

**Response 200:**

```json
{
  "success": true,
  "checkoutRequestId": "ws_CO_...",
  "message": "STK Push sent. Enter your M-Pesa PIN."
}
```

**Response 400:**

```json
{ "error": "Missing required fields" }
```

---

### `GET /session/status`

Check the status of an active session.

**Query parameters:**

| Param | Required | Description |
|-------|----------|-------------|
| `mac` | ✅ | Device MAC address |

**Response 200:**

```json
{
  "status": "ACTIVE",
  "expiresAt": "2024-01-01T12:00:00.000Z",
  "dataUsedMB": 12.5,
  "dataCapMB": 500
}
```

---

### `POST /api/disconnect`

Disconnects an active session.

**Request body:**

```json
{
  "mac": "AA:BB:CC:DD:EE:FF"
}
```

**Response 200:**

```json
{ "success": true }
```

---

## M-Pesa Callback

### `POST /api/mpesa_callback`

Receives payment result callbacks from Safaricom Daraja. This endpoint is called by Safaricom – do not call it directly.

**Request body (from Safaricom):**

```json
{
  "Body": {
    "stkCallback": {
      "MerchantRequestID": "...",
      "CheckoutRequestID": "ws_CO_...",
      "ResultCode": 0,
      "ResultDesc": "The service request is processed successfully.",
      "CallbackMetadata": {
        "Item": [
          { "Name": "Amount", "Value": 10 },
          { "Name": "MpesaReceiptNumber", "Value": "ABC123XYZ" },
          { "Name": "PhoneNumber", "Value": 254712345678 }
        ]
      }
    }
  }
}
```

**Response 200:**

```json
{ "ResultCode": 0, "ResultDesc": "Accepted" }
```

---

## Admin Routes

> ⚠️ Admin routes are currently unprotected. Restrict access via firewall or add authentication before exposing publicly.

### `GET /api/admin/dashboard`

Returns an overview of all tenants, sessions, and transactions.

**Response 200:**

```json
{
  "totalTenants": 5,
  "activeSessions": 12,
  "totalTransactions": 340,
  "revenueToday": 4500
}
```

---

### `GET /api/admin/tenants`

Lists all tenants.

**Response 200:**

```json
[
  {
    "id": "uuid",
    "name": "Java Cafe",
    "slug": "java-cafe",
    "ownerName": "John Doe",
    "ownerPhone": "254712345678",
    "isActive": true,
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
]
```

---

### `POST /api/admin/tenants`

Creates a new tenant.

**Request body:**

```json
{
  "name": "Java Cafe",
  "ownerName": "John Doe",
  "ownerPhone": "254712345678",
  "ownerEmail": "john@javacafe.co.ke",
  "mikrotikHost": "192.168.88.1",
  "mikrotikUser": "admin",
  "mikrotikPass": "router_password",
  "mikrotikPort": 8728,
  "mpesaShortcode": "123456",
  "mpesaKey": "consumer_key",
  "mpesaSecret": "consumer_secret",
  "mpesaPasskey": "passkey"
}
```

> `mpesaShortcode`, `mpesaKey`, `mpesaSecret`, `mpesaPasskey` are optional. If omitted the system uses the global M-Pesa credentials from `.env`.

**Response 200:**

```json
{
  "success": true,
  "tenant": {
    "id": "uuid",
    "name": "Java Cafe",
    "slug": "java-cafe",
    "mikrotikId": "hex-id",
    "tunnelKey": "hex-key"
  },
  "installScript": "..."
}
```

---

### `GET /api/admin/tenants/:tenantId`

Gets details of a specific tenant.

---

### `PUT /api/admin/tenants/:tenantId`

Updates an existing tenant. Accepts the same fields as `POST /api/admin/tenants`.

---

### `DELETE /api/admin/tenants/:tenantId`

Deletes a tenant and all associated sessions, plans, and transactions.

---

### `POST /api/admin/tenants/:tenantId/test`

Tests the MikroTik connection for a tenant.

**Response 200:**

```json
{
  "success": true,
  "message": "MikroTik connection OK",
  "routerInfo": {
    "identity": "MikroTik",
    "version": "7.14",
    "board": "RB941-2nD"
  }
}
```

---

### `GET /api/admin/tenants/:tenantId/analytics`

Returns session and revenue analytics for a tenant.

**Response 200:**

```json
{
  "totalSessions": 200,
  "activeSessions": 5,
  "totalRevenue": 25000,
  "revenueToday": 1500,
  "topPlans": [...]
}
```

---

## Error Codes

| HTTP Status | Meaning |
|-------------|---------|
| 200 | Success |
| 400 | Bad request – missing or invalid fields |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
