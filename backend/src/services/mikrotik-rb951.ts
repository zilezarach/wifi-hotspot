import dotenv from "dotenv";
import { RouterOSAPI } from "node-routeros";

dotenv.config();

interface RB951Config {
  hotspotInterface: string;
  wanInterface: string;
  bridgeName: string;
  poolName: string;
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

class RB951HotspotManager {
  private client: RouterOSAPI | null = null;
  private connectionTimeout: NodeJS.Timeout | null = null;
  private readonly maxConnectionAge = 300000; // 5 minutes
  private lastConnected = 0;

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

  // Input validation methods
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

    // Check if connection is too old or doesn't exist
    if (!this.client || now - this.lastConnected > this.maxConnectionAge) {
      if (this.client) {
        try {
          await this.client.close();
        } catch (error) {
          console.warn("Error closing old connection:", error);
        }
      }

      this.client = new RouterOSAPI({
        host: process.env.MIKROTIK_HOST || "192.168.88.1",
        user: process.env.MIKROTIK_USER || "admin",
        password: process.env.MIKROTIK_PASS || "",
        port: parseInt(process.env.MIKROTIK_PORT || "8728"),
        timeout: 5000,
      });

      await this.client.connect();
      this.lastConnected = now;

      // Set connection timeout
      if (this.connectionTimeout) clearTimeout(this.connectionTimeout);
      this.connectionTimeout = setTimeout(() => {
        this.disconnect().catch(console.error);
      }, this.maxConnectionAge);

      console.log(
        `✅ Connected to MikroTik router at ${
          process.env.MIKROTIK_HOST || "192.168.88.1"
        }`
      );
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

  // **NEW METHOD** - For limited access with data cap monitoring
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

      // For limited access, we use 'regular' type with profile
      const comment = `Limited-${duration}-${
        dataCap ? `${dataCap}MB` : "unlimited"
      }-${new Date().toISOString()}`;

      // First, try to remove any existing binding
      await this.removeExistingBinding(ip);

      // Create limited access binding
      if (this.isValidMAC(mac)) {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          `=mac-address=${mac}`,
          "=type=regular", // Regular type requires authentication through profiles
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

      // If data cap is specified, add it to the user profile or queue
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

  // **NEW METHOD** - For unlimited access (bypassed)
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

      // Remove any existing binding first
      await this.removeExistingBinding(ip);

      const comment = `Unlimited-${duration}-${new Date().toISOString()}`;

      // For unlimited access, use 'bypassed' type
      if (this.isValidMAC(mac)) {
        await client.write([
          "/ip/hotspot/ip-binding/add",
          `=address=${ip}`,
          `=mac-address=${mac}`,
          "=type=bypassed", // Bypassed type gives unlimited access
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

  // **ENHANCED** - Remove existing binding helper
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

  // **NEW METHOD** - Setup data cap monitoring using queues
  private async setupDataCapMonitoring(
    ip: string,
    dataCap: number
  ): Promise<void> {
    try {
      const client = await this.connect();
      const queueName = `datacap-${ip.replace(/\./g, "-")}`;

      // Remove existing queue if any
      const queues = await client.write(["/queue/simple/print"]);
      const existingQueue = queues.find((q: any) => q.name === queueName);

      if (existingQueue && existingQueue[".id"]) {
        await client.write([
          "/queue/simple/remove",
          `=.id=${existingQueue[".id"]}`,
        ]);
      }

      // Create queue with data limit (convert MB to bytes)
      const limitBytes = dataCap * 1024 * 1024;

      await client.write([
        "/queue/simple/add",
        `=name=${queueName}`,
        `=target=${ip}/32`,
        `=max-limit=${limitBytes}/${limitBytes}`, // upload/download limit
        `=comment=DataCap-${dataCap}MB-${new Date().toISOString()}`,
      ]);

      console.log(
        `📊 Data cap of ${dataCap}MB set for ${ip} using queue ${queueName}`
      );
    } catch (error) {
      console.error(`Failed to setup data cap monitoring for ${ip}:`, error);
    }
  }

  // **ENHANCED** - Better MAC address fetching
  async getUserMac(ip: string): Promise<string> {
    if (!this.isValidIP(ip)) {
      console.warn(`Invalid IP provided for MAC lookup: ${ip}`);
      return "00:00:00:00:00:00";
    }

    try {
      const client = await this.connect();

      // Try ARP table first
      const arps = await client.write(["/ip/arp/print"]);
      const arpEntry = arps.find((a: any) => a.address === ip);

      if (
        arpEntry?.["mac-address"] &&
        this.isValidMAC(arpEntry["mac-address"])
      ) {
        return arpEntry["mac-address"];
      }

      // Try DHCP lease table
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

  // **ENHANCED** - Better active users with data usage
  async getActiveUsers(): Promise<any[]> {
    try {
      const client = await this.connect();
      const [activeUsers, queues] = await Promise.all([
        client.write(["/ip/hotspot/active/print"]),
        client.write(["/queue/simple/print"]),
      ]);

      // Enhance active users with queue data
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

  // **ENHANCED** - Better disconnect with queue cleanup
  async disconnectUser(ip: string): Promise<AccessResult> {
    if (!this.isValidIP(ip)) {
      return { success: false, message: "Invalid IP address" };
    }

    try {
      const client = await this.connect();
      let disconnected = false;

      // Remove IP binding
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

      // Disconnect active session
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

      // Remove data cap queue if exists
      const queueName = `datacap-${ip.replace(/\./g, "-")}`;
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);
      if (queue && queue[".id"]) {
        await client.write(["/queue/simple/remove", `=.id=${queue[".id"]}`]);
        console.log(`🗑️ Removed data cap queue for ${ip}`);
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

  // **LEGACY METHODS** - Keep for backward compatibility but mark as deprecated
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

  // **NEW METHOD** - Get data usage for specific IP
  async getDataUsageForIP(ip: string): Promise<{
    bytesIn: number;
    bytesOut: number;
    totalBytes: number;
    queueExists: boolean;
  }> {
    try {
      const client = await this.connect();
      const queueName = `datacap-${ip.replace(/\./g, "-")}`;
      const queues = await client.write(["/queue/simple/print"]);
      const queue = queues.find((q: any) => q.name === queueName);

      if (queue) {
        // Parse queue bytes format "upload/download"
        const bytes = queue.bytes || "0/0";
        const [bytesOut, bytesIn] = bytes
          .split("/")
          .map((b: string) => parseInt(b) || 0);

        return {
          bytesIn,
          bytesOut,
          totalBytes: bytesIn + bytesOut,
          queueExists: true,
        };
      } else {
        // Try to get from active users
        const activeUsers = await client.write(["/ip/hotspot/active/print"]);
        const user = activeUsers.find((u: any) => u.address === ip);

        if (user) {
          const bytesIn = parseInt(user["bytes-in"] || "0");
          const bytesOut = parseInt(user["bytes-out"] || "0");

          return {
            bytesIn,
            bytesOut,
            totalBytes: bytesIn + bytesOut,
            queueExists: false,
          };
        }
      }

      return { bytesIn: 0, bytesOut: 0, totalBytes: 0, queueExists: false };
    } catch (error) {
      console.error(`Failed to get data usage for ${ip}:`, error);
      return { bytesIn: 0, bytesOut: 0, totalBytes: 0, queueExists: false };
    }
  }
}

export const rb951Manager = new RB951HotspotManager();

// Enhanced cleanup on process exit
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
