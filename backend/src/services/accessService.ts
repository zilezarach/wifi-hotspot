import axios, { AxiosError } from "axios";
import logger from "../utils/logger";

// Router configuration from env vars
const routerBaseUrl = `http://${process.env.ROUTER_IP ?? "192.168.88.1"}/rest`; // Change to https:// if using SSL
const auth = {
  username: process.env.ROUTER_USERNAME ?? "admin",
  password: process.env.ROUTER_PASSWORD ?? ""
};
const requestTimeout = 5000; // 5 seconds timeout for API calls
const maxRetries = 3; // Retry failed requests up to 3 times

// Helper function for REST calls with retries and logging
async function executeRestCommand(
  method: "get" | "post" | "patch" | "delete",
  endpoint: string,
  data?: Record<string, any>, // Flexible params type
  retries = maxRetries
): Promise<any> {
  try {
    const response = await axios({
      method,
      url: `${routerBaseUrl}${endpoint}`,
      data,
      auth,
      timeout: requestTimeout
    });
    logger.info(
      `MikroTik REST success: ${method.toUpperCase()} ${endpoint} - Response: ${JSON.stringify(response.data)}`
    );
    return response.data;
  } catch (error) {
    const err = error as AxiosError;
    logger.error(`MikroTik REST error: ${method.toUpperCase()} ${endpoint} - ${err.message} (Code: ${err.code})`);
    if (retries > 0 && (err.code === "ECONNABORTED" || err.response?.status === 503)) {
      logger.warn(`Retrying (${maxRetries - retries + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 1000)); // 1s backoff
      return executeRestCommand(method, endpoint, data, retries - 1);
    }
    throw error; // Rethrow after retries fail
  }
}

export async function getUserMac(ip: string): Promise<string> {
  try {
    const arps = await executeRestCommand("get", "/ip/arp");
    const entry = arps.find((a: any) => a.address === ip);
    return entry?.["mac-address"] || "00:00:00:00:00:00";
  } catch (error) {
    logger.warn(`MAC fetch failed for IP ${ip}, using default`, error);
    return "00:00:00:00:00:00";
  }
}

export async function getUsageForIp(ip: string): Promise<bigint> {
  try {
    const queues = await executeRestCommand("get", "/queue/simple");
    const queue = queues.find((q: any) => q.name === `cap-${ip}`);
    if (queue) {
      const totalBytes = BigInt(queue.bytes?.split("/")[0] || 0);
      return totalBytes;
    }
    return BigInt(0);
  } catch (error) {
    logger.warn(`Usage fetch failed for IP ${ip}`, error);
    return BigInt(0);
  }
}

export async function grantAccess(ip: string, limited: boolean = false, dataCap: number | null = null): Promise<void> {
  const commands: { cmd: string; method: "post"; params: Record<string, any> }[] = [
    {
      cmd: "/ip/hotspot/ip-binding",
      method: "post",
      params: {
        address: ip,
        type: "bypassed",
        comment: "Granted access"
      }
    }
  ];

  if (limited) {
    const essentialDomains = ["google.com", "ecitizen.go.ke", "kra.go.ke", "nhif.or.ke", "nssf.or.ke", "helb.co.ke"];

    // Add essentials to address-list
    for (const domain of essentialDomains) {
      commands.push({
        cmd: "/ip/firewall/address-list",
        method: "post",
        params: { list: "essentials", address: domain }
      });
    }

    // Add forward accept rules for essentials
    for (const domain of essentialDomains) {
      commands.push({
        cmd: "/ip/firewall/filter",
        method: "post",
        params: {
          chain: "forward",
          "src-address": ip,
          "dst-address-list": "essentials",
          action: "accept"
        }
      });
    }

    // Blocked domains
    const blockedDomains = ["facebook.com", "youtube.com", "netflix.com"];
    for (const domain of blockedDomains) {
      commands.push({
        cmd: "/ip/firewall/address-list",
        method: "post",
        params: { list: "blocked", address: domain }
      });
    }

    // Drop rule for blocked
    commands.push({
      cmd: "/ip/firewall/filter",
      method: "post",
      params: {
        chain: "forward",
        "src-address": ip,
        "dst-address-list": "blocked",
        action: "drop"
      }
    });

    // Speed limit queue
    commands.push({
      cmd: "/queue/simple",
      method: "post",
      params: {
        name: `limited-${ip}`,
        target: ip,
        "max-limit": "512k/512k"
      }
    });
  }

  for (const { cmd, method, params } of commands) {
    try {
      await executeRestCommand(method, cmd, params);
      logger.info(`Success: ${cmd} for IP ${ip}`);
    } catch (error) {
      logger.warn(`Failed but continuing: ${cmd} for IP ${ip}`, error);
    }
  }

  logger.info(`Access granted for IP: ${ip} (limited: ${limited}, dataCap: ${dataCap})`);
}

export async function revokeAccess(ip: string): Promise<void> {
  try {
    // Revoke IP binding
    const bindings = await executeRestCommand("get", "/ip/hotspot/ip-binding");
    const bindingId = bindings.find((b: any) => b.address === ip)?.[".id"];
    if (bindingId) {
      await executeRestCommand("delete", `/ip/hotspot/ip-binding/${bindingId}`);
    }

    // Revoke queue
    const queues = await executeRestCommand("get", "/queue/simple");
    const queueId = queues.find((q: any) => q.name === `limited-${ip}`)?.[".id"];
    if (queueId) {
      await executeRestCommand("delete", `/queue/simple/${queueId}`);
    }

    // Note: For firewall rules/address-lists, you may need similar queries and deletes if they should be cleaned up

    logger.info(`Access revoked for IP: ${ip}`);
  } catch (error) {
    logger.error(`Revoke failed for IP ${ip}`, error);
  }
}
