import dotenv from "dotenv";
import { RouterOSAPI } from "node-routeros";

dotenv.config();

interface RB951Config {
  hotspotInterface: string;
  wanInterface: string;
  bridgeName: string;
  poolName: string;
}

interface MikroTikConfig {
  host: string;
  user: string;
  password: string;
  port: number;
  timeout: number;
}

interface ConnectionResult {
  success: boolean;
  message: string;
  info?: any;
}

interface AccessResult {
  success: boolean;
  message: string;
}

interface DataUsage {
  bytesIn: number;
  bytesOut: number;
  totalBytes: number;
  totalMB: number;
  queueExists: boolean;
  limitReached: boolean;
}

interface SystemStats {
  activeUsers: number;
  totalBindings: number;
  systemLoad: string;
  uptime: string;
  memoryUsage: string;
}

class RB951HotspotManager {
  private client: RouterOSAPI | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private readonly maxConnectionAge = 300000; // 5 minutes
  private lastConnected = 0;
  private mikrotikConfig: MikroTikConfig;

  private readonly config: RB951Config = {
    hotspotInterface: "hotspot-bridge",
    wanInterface: "ether1",
    bridgeName: "hotspot-bridge",
    poolName: "hotspot-pool",
  };

  private readonly profileMap: Record<string, string> = {
    "30m": "trial-profile",
    "1Hr": "paid-1hr",
    "4Hrs": "paid-4hr",
    "12Hrs": "paid-12hr",
    "24Hrs": "paid-24hr",
  };

  private readonly profileConfig = {
    profiles: {
      "trial-profile": {
        duration: "00:30:00",
        dataLimit: 50,
        speedLimit: "1M/1M",
      },
      "paid-1hr": {
        duration: "01:00:00",
        dataLimit: 100,
        speedLimit: "2M/2M",
      },
      "paid-4hr": {
        duration: "04:00:00",
        dataLimit: 500,
        speedLimit: "5M/5M",
      },
      "paid-12hr": {
        duration: "12:00:00",
        dataLimit: 1024,
        speedLimit: "10M/10M",
      },
      "paid-24hr": {
        duration: "24:00:00",
        dataLimit: 2048,
        speedLimit: "10M/10M",
      },
    },
  };

  constructor() {
    this.validateEnvironment();
    this.mikrotikConfig = {
      host: process.env.MIKROTIK_HOST!,
      user: process.env.MIKROTIK_USER!,
      password: process.env.MIKROTIK_PASS!,
      port: parseInt(process.env.MIKROTIK_PORT || "8728"),
      timeout: parseInt(process.env.MIKROTIK_TIMEOUT || "10000"),
    };
  }

  private validateEnvironment(): void {
    const required = ["MIKROTIK_HOST", "MIKROTIK_USER", "MIKROTIK_PASS"];
    const missing = required.filter((key) => !process.env[key]);

    if (missing.length > 0) {
      throw new Error(
        `Missing required environment variables: ${missing.join(", ")}`
      );
    }
  }

  private isValidIP(ip: string): boolean {
    const ipRegex =
      /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return ipRegex.test(ip) && !["127.0.0.1", "0.0.0.0", "::1"].includes(ip);
  }

  private isValidMAC(mac: string): boolean {
    if (!mac || mac === "00:00:00:00:00:00") return false;
    const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
    return macRegex.test(mac);
  }

  private async refreshConnection(): Promise<RouterOSAPI> {
    const now = Date.now();

    if (!this.client || now - this.lastConnected > this.maxConnectionAge) {
      await this.disconnect();

      this.client = new RouterOSAPI({
        host: this.mikrotikConfig.host,
        user: this.mikrotikConfig.user,
        password: this.mikrotikConfig.password,
        port: this.mikrotikConfig.port,
        timeout: this.mikrotikConfig.timeout,
        keepalive: true,
      });

      try {
        await this.client.connect();
        this.lastConnected = now;
        await this.client.write(["/system/identity/print"]);

        if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
        this.connectionTimeout = setTimeout(() => {
          this.disconnect().catch(console.error);
        }, this.maxConnectionAge);

        console.log(
          `✅ Connected to MikroTik ${this.mikrotikConfig.host}:${this.mikrotikConfig.port}`
        );
      } catch (error) {
        this.client = null;
        throw new Error(`Failed to connect to MikroTik: ${error}`);
      }
    }

    return this.client;
  }

  async connect(): Promise<RouterOSAPI> {
    return this.refreshConnection();
  }

  async disconnect(): Promise<void> {
    if (this.connectionTimeout) {
      clearTimeout(this.connectionTimeout);
      this.connectionTimeout = null;
    }

    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.warn("Error during disconnect:", error);
      } finally {
        this.client = null;
        console.log("🔌 Disconnected from MikroTik router");
      }
    }
  }

  async ensureProfilesExist(): Promise<void> {
    try {
      const client = await this.connect();
      const existingProfiles = await client.write([
        "/ip/hotspot/user-profile/print",
      ]);

      for (const [profileName, config] of Object.entries(
        this.profileConfig.profiles
      )) {
        const exists = existingProfiles.some(
          (p: any) => p.name === profileName
        );

        if (!exists) {
          await client.write([
            "/ip/hotspot/user-profile/add",
            `=name=${profileName}`,
            `=session-timeout=${config.duration}`,
            `=rate-limit=${config.speedLimit}`,
            `=shared-users=1`,
            `=status-autorefresh=1m`,
          ]);
          console.log(`📋 Created profile: ${profileName}`);
        }
      }
    } catch (error) {
      console.error("Failed to ensure profiles exist:", error);
    }
  }

  async grantLimitedAccess(
    ip: string,
    duration: string,
    dataCap?: number | null
  ): Promise<AccessResult> {
    if (!this.isValidIP(ip)) {
      return { success: false, message: "Invalid IP address" };
    }

    try {
      const client = await this.connect();
      const mac = await this.getUserMac(ip);
      const profile = this.profileMap[duration] || "trial-profile";

      console.log(
        `🎯 Granting LIMITED access to IP ${ip} with profile ${profile}, data cap: ${
          dataCap || "none"
        }MB`
      );

      const comment = `Limited-${duration}-${
        dataCap ? `${dataCap}MB` : "unlimited"
      }-${new Date().toISOString()}`;
      await this.removeExistingBinding(ip);

      if (this.isValidMAC(mac)) {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          `=mac-address=${mac}`,
          "=type=regular",
          `=comment=${comment}`,
        ]);
      } else {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          "=type=regular",
          `=comment=${comment}`,
        ]);
      }

      if (dataCap) {
        await this.setupDataCapMonitoring(ip, dataCap);
      }

      console.log(
        `✅ Limited access granted for IP ${ip} with duration ${duration}`
      );
      return {
        success: true,
        message: `Limited access granted for ${duration}`,
      };
    } catch (error: any) {
      console.error(`❌ Failed to grant limited access for ${ip}:`, error);

      if (error.message?.includes("already have such entry")) {
        return { success: true, message: "Limited access already granted" };
      }

      return {
        success: false,
        message: `Failed to grant limited access: ${error.message || error}`,
      };
    }
  }

  async grantUnlimitedAccess(
    ip: string,
    duration: string
  ): Promise<AccessResult> {
    if (!this.isValidIP(ip)) {
      return { success: false, message: "Invalid IP address" };
    }

    try {
      const client = await this.connect();
      const mac = await this.getUserMac(ip);

      console.log(
        `🚀 Granting UNLIMITED access to IP ${ip} for duration ${duration}`
      );

      await this.removeExistingBinding(ip);
      const comment = `Unlimited-${duration}-${new Date().toISOString()}`;

      if (this.isValidMAC(mac)) {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          `=mac-address=${mac}`,
          "=type=bypassed",
          `=comment=${comment}`,
        ]);
      } else {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          "=type=bypassed",
          `=comment=${comment}`,
        ]);
      }

      console.log(
        `✅ Unlimited access granted for IP ${ip} with duration ${duration}`
      );
      return {
        success: true,
        message: `Unlimited access granted for ${duration}`,
      };
    } catch (error: any) {
      console.error(`❌ Failed to grant unlimited access for ${ip}:`, error);

      if (error.message?.includes("already have such entry")) {
        return { success: true, message: "Unlimited access already granted" };
      }

      return {
        success: false,
        message: `Failed to grant unlimited access: ${error.message || error}`,
      };
    }
  }

  private async removeExistingBinding(ip: string): Promise<void> {
    try {
      const client = await this.connect();
      const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
      const existingBinding = bindings.find((b: any) => b.address === ip);

      if (existingBinding && existingBinding[".id"]) {
        await client.write([
          "/ip/hotspot/ip-binding/remove",
          `=.id=${existingBinding[".id"]}`,
        ]);
        console.log(`🔄 Removed existing binding for ${ip}`);
      }
    } catch (error) {
      console.warn(
        `Warning: Could not remove existing binding for ${ip}:`,
        error
      );
    }
  }

  private async removeExistingQueue(queueName: string): Promise<void> {
    try {
      const client = await this.connect();
      const queues = await client.write(["/queue/simple/print"]);
      const existingQueue = queues.find((q: any) => q.name === queueName);

      if (existingQueue?.[".id"]) {
        await client.write([
          "/queue/simple/remove",
          `=.id=${existingQueue[".id"]}`,
        ]);
        console.log(`🗑️ Removed existing queue: ${queueName}`);
      }
    } catch (error) {
      console.warn(`Warning: Could not remove queue ${queueName}:`, error);
    }
  }

  private async setupDataCapMonitoring(
    ip: string,
    dataCap: number
  ): Promise<void> {
    try {
      const client = await this.connect();
      const queueName = `datacap-${ip.replace(/\./g, "-")}`;

      await this.removeExistingQueue(queueName);

      const limitBytes = dataCap * 1024 * 1024;

      await client.write([
        "/queue/simple/add",
        `=name=${queueName}`,
        `=target=${ip}/32`,
        `=max-limit=0/0`,
        `=burst-limit=0/0`,
        `=burst-threshold=0/0`,
        `=burst-time=0s/0s`,
        `=limit-at=0/0`,
        `=priority=8/8`,
        `=queue=default-small/default-small`,
        `=comment=DataCap-${dataCap}MB-${Date.now()}`,
        `=disabled=no`,
      ]);

      await this.createDataCapScript(ip, queueName, limitBytes);
      console.log(`📊 Data cap of ${dataCap}MB set for ${ip}`);
    } catch (error) {
      console.error(`Failed to setup data cap monitoring for ${ip}:`, error);
      throw error;
    }
  }

  private async createDataCapScript(
    ip: string,
    queueName: string,
    limitBytes: number
  ): Promise<void> {
    try {
      const client = await this.connect();
      const scriptName = `datacap-monitor-${ip.replace(/\./g, "-")}`;

      const scripts = await client.write(["/system/script/print"]);
      const existingScript = scripts.find((s: any) => s.name === scriptName);

      if (existingScript?.[".id"]) {
        await client.write([
          "/system/script/remove",
          `=.id=${existingScript[".id"]}`,
        ]);
      }

      const scriptContent = `
# Data cap monitoring script for ${ip}
:local queueName "${queueName}";
:local ipAddress "${ip}";
:local limitBytes ${limitBytes};

:local queue [/queue/simple/find name=\$queueName];
:if ([:len \$queue] > 0) do={
  :local bytes [/queue/simple/get \$queue bytes];
  :local totalBytes [:tonum \$bytes];
  
  :if (\$totalBytes >= \$limitBytes) do={
    :log warning "Data cap reached for \$ipAddress (\$totalBytes bytes)";
    /ip/hotspot/ip-binding/remove [find address=\$ipAddress];
    /ip/hotspot/active/remove [find address=\$ipAddress];
    /queue/simple/remove \$queue;
  }
}
`;

      await client.write([
        "/system/script/add",
        `=name=${scriptName}`,
        `=source=${scriptContent}`,
        `=comment=Auto-generated data cap monitor for ${ip}`,
      ]);

      console.log(`📜 Created monitoring script: ${scriptName}`);
    } catch (error) {
      console.error(`Failed to create monitoring script for ${ip}:`, error);
    }
  }

  private extractDataCapFromComment(comment: string): number {
    const match = comment.match(/DataCap-(\d+)MB/);
    return match ? parseInt(match[1]) : 0;
  }

  async getUserMac(ip: string): Promise<string> {
    if (!this.isValidIP(ip)) {
      console.warn(`Invalid IP provided for MAC lookup: ${ip}`);
      return "00:00:00:00:00:00";
    }

    try {
      const client = await this.connect();

      const arps = await client.write(["/ip/arp/print"]);
      const arpEntry = arps.find((a: any) => a.address === ip);

      if (
        arpEntry?.["mac-address"] &&
        this.isValidMAC(arpEntry["mac-address"])
      ) {
        return arpEntry["mac-address"];
      }

      const leases = await client.write(["/ip/dhcp-server/lease/print"]);
      const leaseEntry = leases.find((l: any) => l.address === ip);

      if (
        leaseEntry?.["mac-address"] &&
        this.isValidMAC(leaseEntry["mac-address"])
      ) {
        return leaseEntry["mac-address"];
      }

      console.warn(`MAC address not found for IP ${ip}`);
      return "00:00:00:00:00:00";
    } catch (error) {
      console.warn(`MAC fetch failed for IP ${ip}:`, error);
      return "00:00:00:00:00:00";
    }
  }

  async getActiveUsers(): Promise<any[]> {
    try {
      const client = await this.connect();
      const [activeUsers, queues] = await Promise.all([
        client.write(["/ip/hotspot/active/print"]),
        client.write(["/queue/simple/print"]),
      ]);

      const enhancedUsers = (activeUsers || []).map((user: any) => {
        const queueName = `datacap-${user.address?.replace(/\./g, "-")}`;
        const queue = queues.find((q: any) => q.name === queueName);

        return {
          ...user,
          dataQueue: queue
            ? {
                bytesIn: parseInt(queue["bytes"] || "0"),
                bytesOut: parseInt(queue["bytes"] || "0"),
                maxLimit: queue["max-limit"],
              }
            : null,
        };
      });

      console.log(`📊 Found ${enhancedUsers.length} active hotspot users`);
      return enhancedUsers;
    } catch (error) {
      console.error("Failed to get active users:", error);
      return [];
    }
  }

  async disconnectUser(ip: string): Promise<AccessResult> {
    if (!this.isValidIP(ip)) {
      return { success: false, message: "Invalid IP address" };
    }

    try {
      const client = await this.connect();
      let disconnected = false;

      const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
      const binding = bindings.find((b: any) => b.address === ip);
      if (binding && binding[".id"]) {
        await client.write([
          "/ip/hotspot/ip-binding/remove",
          `=.id=${binding[".id"]}`,
        ]);
        disconnected = true;
        console.log(`🔓 Removed IP binding for ${ip}`);
      }

      const active = await client.write(["/ip/hotspot/active/print"]);
      const session = active.find((s: any) => s.address === ip);
      if (session && session[".id"]) {
        await client.write([
          "/ip/hotspot/active/remove",
          `=.id=${session[".id"]}`,
        ]);
        disconnected = true;
        console.log(`🚪 Disconnected active session for ${ip}`);
      }

      const queueName = `datacap-${ip.replace(/\./g, "-")}`;
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);
      if (queue && queue[".id"]) {
        await client.write(["/queue/simple/remove", `=.id=${queue[".id"]}`]);
        console.log(`🗑️ Removed data cap queue for ${ip}`);
      }

      const scriptName = `datacap-monitor-${ip.replace(/\./g, "-")}`;
      const scripts = await client.write(["/system/script/print"]);
      const script = scripts.find((s: any) => s.name === scriptName);
      if (script && script[".id"]) {
        await client.write(["/system/script/remove", `=.id=${script[".id"]}`]);
        console.log(`🗑️ Removed monitoring script for ${ip}`);
      }

      if (disconnected) {
        console.log(`✅ User ${ip} disconnected successfully`);
        return { success: true, message: "User disconnected successfully" };
      } else {
        return {
          success: false,
          message: "No active session found for this IP",
        };
      }
    } catch (error: any) {
      console.error(`❌ Failed to disconnect ${ip}:`, error);
      return {
        success: false,
        message: `Disconnect failed: ${error.message || error}`,
      };
    }
  }

  async getDataUsageForIP(ip: string): Promise<DataUsage> {
    try {
      const client = await this.connect();
      const queueName = `datacap-${ip.replace(/\./g, "-")}`;
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);

      if (queue) {
        const bytesField = queue.bytes || "0/0";
        let bytesOut = 0,
          bytesIn = 0;

        if (bytesField.includes("/")) {
          [bytesOut, bytesIn] = bytesField
            .split("/")
            .map((b: string) => parseInt(b) || 0);
        } else {
          const totalBytes = parseInt(bytesField) || 0;
          bytesIn = totalBytes;
          bytesOut = 0;
        }

        const totalBytes = bytesIn + bytesOut;
        const totalMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

        const comment = queue.comment || "";
        const dataCap = this.extractDataCapFromComment(comment);
        const limitReached = dataCap > 0 && totalMB >= dataCap;

        return {
          bytesIn,
          bytesOut,
          totalBytes,
          totalMB,
          queueExists: true,
          limitReached,
        };
      }

      const activeUsers = await client.write(["/ip/hotspot/active/print"]);
      const user = activeUsers.find((u: any) => u.address === ip);

      if (user) {
        const bytesIn = parseInt(user["bytes-in"] || "0");
        const bytesOut = parseInt(user["bytes-out"] || "0");
        const totalBytes = bytesIn + bytesOut;
        const totalMB = Math.round((totalBytes / (1024 * 1024)) * 100) / 100;

        return {
          bytesIn,
          bytesOut,
          totalBytes,
          totalMB,
          queueExists: false,
          limitReached: false,
        };
      }

      return {
        bytesIn: 0,
        bytesOut: 0,
        totalBytes: 0,
        totalMB: 0,
        queueExists: false,
        limitReached: false,
      };
    } catch (error) {
      console.error(`Failed to get data usage for ${ip}:`, error);
      return {
        bytesIn: 0,
        bytesOut: 0,
        totalBytes: 0,
        totalMB: 0,
        queueExists: false,
        limitReached: false,
      };
    }
  }

  async cleanupExpiredSessions(): Promise<{
    cleaned: number;
    errors: string[];
  }> {
    try {
      const client = await this.connect();
      const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
      const now = Date.now();
      let cleaned = 0;
      const errors: string[] = [];

      for (const binding of bindings) {
        if (
          binding.comment?.includes("Limited-") ||
          binding.comment?.includes("Unlimited-")
        ) {
          try {
            const timestampMatch = binding.comment.match(
              /(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/
            );
            if (timestampMatch) {
              const bindingTime = new Date(timestampMatch[1]).getTime();
              const ageHours = (now - bindingTime) / (1000 * 60 * 60);

              const maxAge = binding.comment.includes("trial") ? 1 : 24;

              if (ageHours > maxAge) {
                await this.disconnectUser(binding.address);
                cleaned++;
              }
            }
          } catch (error) {
            errors.push(`Failed to cleanup ${binding.address}: ${error}`);
          }
        }
      }

      console.log(
        `🧹 Cleanup completed: ${cleaned} sessions removed, ${errors.length} errors`
      );
      return { cleaned, errors };
    } catch (error: any) {
      console.error("Bulk cleanup failed:", error);
      return { cleaned: 0, errors: [error.message] };
    }
  }

  async getSystemStats(): Promise<SystemStats> {
    try {
      const client = await this.connect();
      const [activeUsers, bindings, resource] = await Promise.all([
        client.write(["/ip/hotspot/active/print"]),
        client.write(["/ip/hotspot/ip-binding/print"]),
        client.write(["/system/resource/print"]),
      ]);

      const stats = resource[0] || {};

      return {
        activeUsers: activeUsers.length,
        totalBindings: bindings.length,
        systemLoad: stats["cpu-load"] || "0%",
        uptime: stats.uptime || "Unknown",
        memoryUsage: `${stats["free-memory"] || 0}/${
          stats["total-memory"] || 0
        }`,
      };
    } catch (error) {
      console.error("Failed to get system stats:", error);
      return {
        activeUsers: 0,
        totalBindings: 0,
        systemLoad: "Unknown",
        uptime: "Unknown",
        memoryUsage: "Unknown",
      };
    }
  }

  async getActiveBindings(): Promise<any[]> {
    try {
      const client = await this.connect();
      const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
      return bindings || [];
    } catch (error) {
      console.error("Failed to get IP bindings:", error);
      return [];
    }
  }

  async getSystemResource(): Promise<any> {
    try {
      const client = await this.connect();
      const resource = await client.write(["/system/resource/print"]);
      return resource[0] || {};
    } catch (error) {
      console.error("Failed to get system resource:", error);
      return {};
    }
  }

  async testConnection(): Promise<ConnectionResult> {
    try {
      const client = await this.connect();
      const [identity, resource] = await Promise.all([
        client.write(["/system/identity/print"]),
        this.getSystemResource(),
      ]);

      return {
        success: true,
        message: "Connected to MikroTik router successfully",
        info: {
          identity: identity[0]?.name || "Unknown",
          version: resource["version"] || "Unknown",
          uptime: resource["uptime"] || "Unknown",
          connectedAt: new Date().toISOString(),
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection failed: ${error.message || error}`,
      };
    }
  }

  /** @deprecated Use grantLimitedAccess or grantUnlimitedAccess instead */
  async grantAccess(
    ip: string,
    isLimited: boolean,
    dataCap?: number | null
  ): Promise<AccessResult> {
    console.warn(
      "⚠️  grantAccess is deprecated. Use grantLimitedAccess or grantUnlimitedAccess instead."
    );
    if (isLimited || dataCap) {
      return this.grantLimitedAccess(ip, "1Hr", dataCap);
    } else {
      return this.grantUnlimitedAccess(ip, "1Hr");
    }
  }

  /** @deprecated Use grantLimitedAccess or grantUnlimitedAccess instead */
  async grantAccessByIP(ip: string, duration: string): Promise<AccessResult> {
    console.warn(
      "⚠️  grantAccessByIP is deprecated. Use grantUnlimitedAccess instead."
    );
    return this.grantUnlimitedAccess(ip, duration);
  }

  /** @deprecated Use grantLimitedAccess or grantUnlimitedAccess instead */
  async grantAccessByMAC(mac: string, duration: string): Promise<AccessResult> {
    console.warn("⚠️  grantAccessByMAC is deprecated.");

    if (!this.isValidMAC(mac)) {
      return { success: false, message: "Invalid MAC address" };
    }

    try {
      const client = await this.connect();
      const comment = `MAC-granted-${duration}-${new Date().toISOString()}`;

      await client.write([
        "/ip/hotspot/ip-binding/add",
        `=mac-address=${mac}`,
        "=type=bypassed",
        `=comment=${comment}`,
      ]);

      console.log(`✅ MAC ${mac} granted access for ${duration}`);
      return { success: true, message: `MAC access granted for ${duration}` };
    } catch (error: any) {
      console.error(`❌ Failed to grant MAC access:`, error);

      if (error.message?.includes("already have such entry")) {
        return { success: true, message: "MAC access already granted" };
      }

      return {
        success: false,
        message: `Failed to grant access: ${error.message || error}`,
      };
    }
  }
}

export const rb951Manager = new RB951HotspotManager();

const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
  try {
    await rb951Manager.disconnect();
    console.log("✅ MikroTik connection closed successfully");
  } catch (error) {
    console.error("Error during shutdown:", error);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));

export default rb951Manager;
