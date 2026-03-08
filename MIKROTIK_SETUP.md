# 🔧 MikroTik Router Setup Guide

This guide walks through configuring a MikroTik router to work with the WiFi Hotspot Billing System.

---

## 📋 Requirements

| Item | Details |
|------|---------|
| RouterOS version | 6.49+ (7.x recommended) |
| Router model | Any MikroTik router with Hotspot support (e.g., RB941, RB951, hAP ac²) |
| Network access | Router must be reachable from the backend server |

---

## 1. Enable the RouterOS API

The backend communicates with the router via the **RouterOS API** (port 8728 / 8729 for SSL).

### Via Winbox or WebFig

1. Go to **IP → Services**
2. Enable **api** (port 8728) or **api-ssl** (port 8729)
3. Optionally restrict access to your server's IP in the **Available From** field

### Via Terminal

```routeros
/ip service enable api
/ip service set api port=8728
# Restrict to server IP (recommended):
/ip service set api address=YOUR_SERVER_IP/32
```

---

## 2. Create a Dedicated API User

Create a user with the minimum required permissions instead of using `admin`:

```routeros
/user group add name=hotspot-api policy=read,write,api,!local,!telnet,!ssh,!ftp,!reboot,!password,!policy,!test,!winbox,!web,!sniff,!sensitive,!romon,!dude,!tikapp

/user add name=hotspot-api password=StrongAPIPassword group=hotspot-api
```

Use these credentials in your `.env`:

```
MIKROTIK_USER=hotspot-api
MIKROTIK_PASS=StrongAPIPassword
```

---

## 3. Configure the Hotspot

### 3.1 Set up the Hotspot Server

```routeros
/ip hotspot setup
```

Follow the wizard:
- **Hotspot interface:** the bridge or LAN interface clients connect to (e.g., `bridge` or `ether2`)
- **Local address:** e.g., `192.168.88.1/24`
- **Address pool:** e.g., `192.168.88.10-192.168.88.254`
- **DNS servers:** e.g., `8.8.8.8,8.8.4.4`
- **DNS name:** leave blank or use a local name like `hotspot.local`

### 3.2 Disable the default login page (optional)

The billing system handles authentication externally. You can redirect users to your portal URL:

```routeros
/ip hotspot profile set default login-by=http-chap,http-pap html-directory=hotspot
```

---

## 4. IP Binding (MAC-to-IP locking)

The system uses IP bindings to grant/revoke internet access after payment. Ensure IP binding is enabled:

```routeros
/ip hotspot ip-binding print
```

Bindings are created automatically by the backend when a session is activated. Example:

```routeros
/ip hotspot ip-binding add mac-address=AA:BB:CC:DD:EE:FF address=192.168.88.100 type=regular comment="Session:uuid"
```

To remove a binding (session expiry):

```routeros
/ip hotspot ip-binding remove [find mac-address="AA:BB:CC:DD:EE:FF"]
```

---

## 5. Firewall Rules

Allow the backend server to reach the RouterOS API port:

```routeros
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=YOUR_SERVER_IP action=accept comment="Allow API from billing server" place-before=0
```

Block API access from other sources:

```routeros
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=drop comment="Block unauthorized API access"
```

---

## 6. Test Router Connectivity

From your server, test the API connection:

```bash
cd backend
pnpm validate-env
```

Or use the admin API endpoint:

```bash
curl -X POST http://localhost:5000/api/admin/tenants/<tenantId>/test
```

A successful response:

```json
{ "success": true, "message": "MikroTik connection OK", "routerInfo": { ... } }
```

---

## 7. Multi-Tenant vs Single-Tenant Setup

| Mode | Description |
|------|-------------|
| **Single-tenant** | One router, one hotspot location. Set `MIKROTIK_HOST/USER/PASS` globally in `.env`. |
| **Multi-tenant** | Multiple routers. Each tenant stores its own (encrypted) MikroTik credentials in the database. The global env vars act as fallback. |

In multi-tenant mode, create tenants via the admin API and provide each tenant's MikroTik credentials when creating the record. See [API_DOCS.md](API_DOCS.md).

---

## 8. Common Issues and Solutions

| Problem | Solution |
|---------|----------|
| `Connection refused` on port 8728 | Enable the API service: `/ip service enable api` |
| `Login failed` | Check username and password; ensure the user has `api` policy |
| Sessions not activating | Verify the router IP is reachable from the server; check firewall rules |
| IP binding not working | Confirm hotspot is set up on the correct interface |
| `Router not found` error | Check `MIKROTIK_HOST` matches the router's IP on the correct network interface |

---

## 9. Useful RouterOS Commands

```routeros
# List active hotspot users
/ip hotspot active print

# List all IP bindings
/ip hotspot ip-binding print

# Check API service status
/ip service print

# View system info
/system resource print
/system identity print
```
