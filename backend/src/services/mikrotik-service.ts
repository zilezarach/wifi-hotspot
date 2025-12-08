import { RouterOSAPI } from "node-routeros";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger";

const prisma = new PrismaClient();

interface ClientConnection {
  client: RouterOSAPI;
  lastUsed: number;
  conStatus: boolean;
}

interface GrantAccess {
  tenantId: string;
  mac: string;
  ip: string;
  sessionId: string;
  duration: number;
  dataCap?: number;
  speedLimit?: string;
}

class MikroTikService {
  private connections: Map<string, ClientConnection> = new Map();
  private readonly CONNECTIONS_TIMEOUT = 50000;
  private readonly RETRIES = 3;

  /**
   * Get or create connection to client's MikroTik
   */
  private async getConnection(tenantId: string): Promise<RouterOSAPI> {
    const existing = this.connections.get(tenantId);
    const now = Date.now();
    if (existing && !existing.conStatus && now - existing.lastUsed < this.CONNECTIONS_TIMEOUT) {
      existing.lastUsed = now;
      return existing.client;
    }
    if (existing?.conStatus) {
      await this.waitForConnection(tenantId);
      return this.getConnection(tenantId);
    }
    if (existing) {
      existing.conStatus = true;
    } else {
      this.connections.set(tenantId, {
        client: null as any,
        lastUsed: now,
        conStatus: true
      });
    }
    try {
      const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId }
      });

      if (!tenant) {
        throw new Error(`Tenant ${tenantId} not found`);
      }

      if (!tenant.isActive) {
        throw new Error(`Tenant ${tenantId} is inactive`);
      }
      const password = this.decryptPass(tenant.mikrotikPass);
      const client = new RouterOSAPI({
        host: tenant.mikrotikHost,
        user: tenant.mikrotikUser,
        password: password,
        port: tenant.mikrotikPort,
        timeout: 10000,
        keepalive: true
      });
      await client.connect();
      await client.write(["/system/identity/print"]);
      const connection = this.connections.get(tenantId)!;
      connection.client = client;
      connection.lastUsed = now;
      connection.conStatus = false;
      await prisma.tenant.update({
        where: { id: tenantId },
        data: { lastSeen: new Date() }
      });
      logger.info(`Connected to the MikroTik for Tenant ${tenantId}`);
      return client;
    } catch (error: any) {
      this.connections.delete(tenantId);
      logger.error(`Failed to get Tenant ${error}`);
      throw Error;
    }
  }
  private async waitForConnection(tenantId: string, maxWait: number = 10000): Promise<void> {
    const startTime = Date.now();
    while (this.connections.get(tenantId)?.conStatus) {
      if (Date.now() - startTime > maxWait) {
        throw new Error("Connection timeout");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  private decryptPass(encrPass: string): string {
    try {
      const [ivHex, authTagHex, encrypted] = encrPass.split(":");
      if (!ivHex || !authTagHex || !encrypted) {
        return encrPass;
      }
      const algorithm = "aes-256-gcm";
      const key = Buffer.from(process.env.ENCRYPTION_KEY || "default-32-char-key-change-this!", "utf8");

      const decipher = crypto.createDecipheriv(algorithm, key, Buffer.from(ivHex, "hex"));
      decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

      let decrypted = decipher.update(encrypted, "hex", "utf8");
      decrypted += decipher.final("utf8");

      return decrypted;
    } catch (error) {
      logger.error("Unable to decrypt password", error);
      return encrPass;
    }
  }
  private isValidMAC(mac: string): boolean {
    if (!mac || mac === "00:00:00:00:00:00") return false;
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
  }

  private async removeExistingBinding(client: RouterOSAPI, ip: string): Promise<void> {
    try {
      const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
      const binding = bindings.find((b: any) => b.address === ip);

      if (binding?.[".id"]) {
        await client.write(["/ip/hotspot/ip-binding/remove", `=.id=${binding[".id"]}`]);
        logger.debug(` Removed existing binding for ${ip}`);
      }
    } catch (error) {
      logger.warn(`Warning: Could not remove binding for ${ip}:`, error);
    }
  }

  private async removeQueue(client: RouterOSAPI, queueName: string): Promise<void> {
    try {
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);

      if (queue?.[".id"]) {
        await client.write(["/queue/simple/remove", `=.id=${queue[".id"]}`]);
        logger.debug(`Removed queue: ${queueName}`);
      }
    } catch (error) {
      logger.warn(`Warning: Could not remove queue ${queueName}:`, error);
    }
  }
  private async setupDataCapQueue(client: RouterOSAPI, ip: string, sessionId: string, dataCap: number): Promise<void> {
    const queueName = `datacap-${sessionId}`;

    await this.removeQueue(client, queueName);
    await client.write([
      "/queue/simple/add",
      `=name=${queueName}`,
      `=target=${ip}/32`,
      `=max-limit=10M/10M`,
      `=comment=DataCap-${dataCap}MB-Session-${sessionId}`
    ]);
    logger.debug(`Created data cap queue for session ${sessionId}`);
  }

  private async setupSpeedLimit(client: RouterOSAPI, ip: string, sessionId: string, speedLimit: string): Promise<void> {
    const queueName = `speed-${sessionId}`;

    await client.write([
      "/queue/simple/add",
      `=name=${queueName}`,
      `=target=${ip}/32`,
      `=max-limit=${speedLimit}`,
      `=comment=SpeedLimit-Session-${sessionId}`
    ]);

    logger.debug(` Created speed limit queue for session ${sessionId}`);
  }

  async discon(tenantId: string, ip?: string, sessionId?: string): Promise<void> {
    const connection = this.connections.get(tenantId);
    if (connection?.client) {
      try {
        await connection.client.close();
      } catch (error) {
        logger.warn(`Error disconnecting from tenant ${tenantId}:`, error);
      }
      this.connections.delete(tenantId);
      logger.info(`Disconnected from tenant ${tenantId}`);
    }
  }

  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.connections.keys()).map(tenantId => this.discon(tenantId));
    await Promise.allSettled(disconnectPromises);
    logger.info("✅ All MikroTik connections closed");
  }

  /**
   * Get router statistics
   */
  async getRouterStats(tenantId: string): Promise<any> {
    try {
      const client = await this.getConnection(tenantId);

      const [resource, identity, activeUsers, bindings] = await Promise.all([
        client.write(["/system/resource/print"]),
        client.write(["/system/identity/print"]),
        client.write(["/ip/hotspot/active/print"]),
        client.write(["/ip/hotspot/ip-binding/print"])
      ]);

      const stats = resource[0] || {};
      const identityData = identity[0] || {};

      return {
        identity: identityData.name || "Unknown",
        version: stats.version || "Unknown",
        boardName: stats["board-name"] || "Unknown",
        uptime: stats.uptime || "Unknown",
        cpuLoad: parseFloat(stats["cpu-load"]) || 0,
        memoryUsed: parseInt(stats["total-memory"]) - parseInt(stats["free-memory"]) || 0,
        memoryTotal: parseInt(stats["total-memory"]) || 0,
        activeUsers: activeUsers.length,
        totalBindings: bindings.length
      };
    } catch (error) {
      logger.error(` Failed to get router stats for tenant ${tenantId}:`, error);
      return null;
    }
  }

  /**
   * Test connection to tenant's router
   */
  async testConnection(tenantId: string): Promise<{ success: boolean; message: string; info?: any }> {
    try {
      const stats = await this.getRouterStats(tenantId);

      if (stats) {
        return {
          success: true,
          message: "Connected successfully",
          info: stats
        };
      } else {
        return {
          success: false,
          message: "Could not retrieve router information"
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: error.message || "Connection failed"
      };
    }
  }
  /**
   * Get user's MAC address from router
   */
  async getUserMac(tenantId: string, ip: string): Promise<string> {
    try {
      const client = await this.getConnection(tenantId);

      const arps = await client.write(["/ip/arp/print"]);
      const arpEntry = arps.find((a: any) => a.address === ip);

      if (arpEntry?.["mac-address"] && this.isValidMAC(arpEntry["mac-address"])) {
        return arpEntry["mac-address"];
      }

      const leases = await client.write(["/ip/dhcp-server/lease/print"]);
      const leaseEntry = leases.find((l: any) => l.address === ip);

      if (leaseEntry?.["mac-address"] && this.isValidMAC(leaseEntry["mac-address"])) {
        return leaseEntry["mac-address"];
      }
      logger.warn(`MAC address not found for IP ${ip} on tenant ${tenantId}`);
      return "00:00:00:00:00:00";
    } catch (error) {
      logger.warn(`MAC fetch failed for IP ${ip} on tenant ${tenantId}:`, error);
      return "00:00:00:00:00:00";
    }
  }
  /**
   * Get data usage for session
   */
  async getDataUsage(tenantId: string, sessionId: string): Promise<number> {
    try {
      const client = await this.getConnection(tenantId);
      const queueName = `datacap-${sessionId}`;
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);
      if (queue?.bytes) {
        const bytesMatch = queue.bytes.match(/(\d+)\/(\d+)/);
        if (bytesMatch) {
          const [, bytesOut, bytesIn] = bytesMatch;
          const totalBytes = parseInt(bytesOut) + parseInt(bytesIn);
          const totalMB = totalBytes / (1024 * 1024);
          return Math.round(totalMB * 100) / 100;
        }
      }
      return 0;
    } catch (error) {
      logger.error(`❌ Failed to get data usage for session ${sessionId}:`, error);
      return 0;
    }
  }
  /**
   * Grant access to user
   */
  async grantAccess(params: GrantAccess): Promise<boolean> {
    const { tenantId, mac, ip, sessionId, duration, dataCap, speedLimit } = params;

    try {
      const client = await this.getConnection(tenantId);
      await this.removeExistingBinding(client, ip);
      const bindingType = dataCap ? "regular" : "bypassed";
      const comment = `session-${sessionId}-${duration}h-${dataCap || "unlimited"}`;
      // Create IP binding
      await client.write([
        "/ip/hotspot/ip-binding/add",
        `=address=${ip}`,
        `=mac-address=${mac}`,
        `=type=${bindingType}`,
        `=comment=${comment}`
      ]);

      logger.info(` Created binding for ${ip} (${mac}) on tenant ${tenantId}`);

      if (dataCap) {
        await this.setupDataCapQueue(client, ip, sessionId, dataCap);
      }
      if (speedLimit) {
        await this.setupSpeedLimit(client, ip, sessionId, speedLimit);
      }
      return true;
    } catch (error) {
      logger.error(`Failed to grant access for ${ip} on tenant ${tenantId}:`, error);
      return false;
    }
  }
}

export const mikroTikService = new MikroTikService();

const gracefulShutdown = async (signal: string) => {
  logger.info(`Received ${signal}, closing MikroTik connections...`);
  try {
    await mikroTikService.disconnectAll();
    logger.info(" All MikroTik connections closed");
  } catch (error) {
    logger.error("Error during MikroTik shutdown:", error);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default mikroTikService;
