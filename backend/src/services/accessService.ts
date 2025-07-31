import axios, { AxiosError } from "axios";
import logger from "../utils/logger";

const ROUTER_IP = process.env.ROUTER_IP!;
const ROUTER_USER = process.env.ROUTER_USERNAME!;
const ROUTER_PASS = process.env.ROUTER_PASSWORD!;
const REST_BASE = `http://${ROUTER_IP}/rest`;
const REQUEST_TIMEOUT = Number(process.env.ROUTER_TIMEOUT) || 5000;
const MAX_RETRIES = 3;

/** Low-level helper for MikroTik REST calls with retries */
async function mikrotikRequest(
  method: "get" | "post" | "patch" | "delete",
  endpoint: string,
  data?: Record<string, any>,
  retries = MAX_RETRIES
): Promise<any> {
  try {
    const res = await axios.request({
      method,
      url: `${REST_BASE}${endpoint}`,
      auth: { username: ROUTER_USER, password: ROUTER_PASS },
      data,
      timeout: REQUEST_TIMEOUT
    });
    logger.debug(`MT REST ${method.toUpperCase()} ${endpoint}`, res.data);
    return res.data;
  } catch (err) {
    const e = err as AxiosError;
    logger.warn(`MT REST error [${method} ${endpoint}]: ${e.message}`);
    if (retries > 0 && (e.code === "ECONNABORTED" || e.response?.status === 503)) {
      await new Promise(r => setTimeout(r, 1000));
      return mikrotikRequest(method, endpoint, data, retries - 1);
    }
    throw err;
  }
}

/** 1) Lookup a client’s MAC from its IP */
export async function getUserMac(ip: string): Promise<string> {
  try {
    const arps = await mikrotikRequest("get", "/ip/arp");
    const entry = (arps as any[]).find(a => a.address === ip);
    return entry?.["mac-address"] ?? "";
  } catch (err) {
    logger.error(`getUserMac failed for ${ip}`, err);
    return "";
  }
}

/** 2) Grant access: bypass captive portal + optional limits */
export async function grantAccess(ip: string, opts: { limited?: boolean; dataCapMb?: number } = {}): Promise<void> {
  // Always bypass the hotspot
  await mikrotikRequest("post", "/ip/hotspot/ip-binding", {
    address: ip,
    type: "bypassed",
    comment: "Paid session"
  });

  if (opts.limited) {
    // Example: only allow essential domains
    const essentials = ["google.com", "map.safaricom.co.ke"];
    for (const host of essentials) {
      await mikrotikRequest("post", "/ip/firewall/address-list", {
        list: "essentials",
        address: host
      });
      await mikrotikRequest("post", "/ip/firewall/filter", {
        chain: "forward",
        "src-address": ip,
        "dst-address-list": "essentials",
        action: "accept"
      });
    }

    // Speed-limit queue
    await mikrotikRequest("post", "/queue/simple", {
      name: `limited-${ip}`,
      target: ip,
      "max-limit": "512k/512k",
      comment: "Limited plan"
    });
  }

  logger.info(`Access granted for ${ip} (limited=${Boolean(opts.limited)})`);
}

/** 3) Revoke all bindings & limits when the session expires */
export async function revokeAccess(ip: string): Promise<void> {
  // Remove hotspot bypass
  const binds = await mikrotikRequest("get", "/ip/hotspot/ip-binding");
  const bind = (binds as any[]).find(b => b.address === ip);
  if (bind) {
    await mikrotikRequest("delete", `/ip/hotspot/ip-binding/${bind[".id"]}`);
  }

  // Remove any queue
  const queues = await mikrotikRequest("get", "/queue/simple");
  const q = (queues as any[]).find(q => q.name === `limited-${ip}`);
  if (q) {
    await mikrotikRequest("delete", `/queue/simple/${q[".id"]}`);
  }

  logger.info(`Access revoked for ${ip}`);
}
