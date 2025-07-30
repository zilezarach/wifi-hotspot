import MikroNode from "mikronode";
import logger from "../utils/logger";

const getConnection = () =>
  new MikroNode(
    process.env.ROUTER_IP ?? "192.168.88.1",
    process.env.ROUTER_USERNAME ?? "admin",
    process.env.ROUTER_PASSWORD ?? ""
  );

async function executeMikroCommand(
  channel: string,
  command: string,
  params: { [key: string]: string } = {}
): Promise<any> {
  try {
    const conn = await getConnection().connect();
    const chan = conn.channel(channel);
    const response = await chan.write([
      command,
      ...Object.entries(params).map(([k, v]) => `=${k}=${v}`),
    ]);
    chan.close();
    conn.close();
    return response;
  } catch (error) {
    logger.error("MikroTik API error:", error);
    throw error;
  }
}

export async function getUserMac(ip: string): Promise<string> {
  try {
    const response = await executeMikroCommand("mac", "/ip/arp/print", {
      where: `address=${ip}`,
    } as any); // Type assertion
    return response[0]?.["mac-address"] || "00:00:00:00:00:00";
  } catch (error) {
    logger.warn(`MAC fetch failed for IP ${ip}, using default`);
    return "00:00:00:00:00:00";
  }
}

export async function getUsageForIp(ip: string): Promise<bigint> {
  try {
    const response = await executeMikroCommand("usage", "/queue/simple/print", {
      detail: "",
      where: `name=cap-${ip}`,
    } as any);
    if (response && response[0]) {
      const totalBytes = BigInt(response[0]["bytes"]?.split("/")[0] || 0);
      return totalBytes;
    }
    return BigInt(0);
  } catch (error) {
    logger.warn(`Usage fetch failed for IP ${ip}`);
    return BigInt(0);
  }
}

export async function grantAccess(
  ip: string,
  limited: boolean = false,
  dataCap: number | null = null
): Promise<void> {
  const commands = [
    {
      cmd: "/ip/hotspot/ip-binding/add",
      params: {
        address: ip,
        type: "bypassed",
        comment: "Granted access",
      } as any,
    },
  ];

  if (limited) {
    const essentialDomains = [
      "google.com",
      "ecitizen.go.ke",
      "kra.go.ke",
      "nhif.or.ke",
      "nssf.or.ke",
      "helb.co.ke",
    ];

    for (const domain of essentialDomains) {
      commands.push({
        cmd: "/ip/firewall/address-list/add",
        params: { list: "essentials", address: domain } as any,
      });
      commands.push({
        cmd: "/ip/firewall/filter/add",
        params: {
          chain: "forward",
          "src-address": ip,
          "dst-address-list": "essentials",
          action: "accept",
        } as any,
      });
    }

    commands.push({
      cmd: "/ip/firewall/address-list/add",
      params: { list: "blocked", address: "facebook.com" } as any,
    });
    commands.push({
      cmd: "/ip/firewall/address-list/add",
      params: { list: "blocked", address: "youtube.com" } as any,
    });
    commands.push({
      cmd: "/ip/firewall/address-list/add",
      params: { list: "blocked", address: "netflix.com" } as any,
    });
    commands.push({
      cmd: "/ip/firewall/filter/add",
      params: {
        chain: "forward",
        "src-address": ip,
        "dst-address-list": "blocked",
        action: "drop",
      } as any,
    });

    commands.push({
      cmd: "/queue/simple/add",
      params: {
        name: `limited-${ip}`,
        target: ip,
        "max-limit": "512k/512k",
      } as any,
    });
  }

  for (const { cmd, params } of commands) {
    try {
      await executeMikroCommand("grant", cmd, params);
    } catch (error) {
      logger.warn(`Command failed: ${cmd}`, error);
    }
  }

  logger.info(`Access granted for IP: ${ip} (limited: ${limited})`);
}

export async function revokeAccess(ip: string): Promise<void> {
  const commands = [
    {
      cmd: "/ip/hotspot/ip-binding/remove",
      params: { ".id": `* [find address=${ip}]` } as any,
    },
    {
      cmd: "/queue/simple/remove",
      params: { ".id": `* [find name=limited-${ip}]` } as any,
    },
  ];

  for (const { cmd, params } of commands) {
    await executeMikroCommand("revoke", cmd, params);
  }
  logger.info(`Access revoked for IP: ${ip}`);
}
