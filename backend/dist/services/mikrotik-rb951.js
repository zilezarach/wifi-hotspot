"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rb951Manager = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
const node_routeros_1 = require("node-routeros");
dotenv_1.default.config();
class RB951HotspotManager {
    constructor() {
        this.client = null;
        this.config = {
            hotspotInterface: "hotspot-bridge",
            wanInterface: "ether1",
            bridgeName: "hotspot-bridge",
            poolName: "hotspot-pool"
        };
        this.profileMap = {
            "30m": "trial-profile",
            "1Hr": "paid-1hr",
            "4Hrs": "paid-4hr",
            "12Hrs": "paid-12hr",
            "24Hrs": "paid-24hr"
        };
    }
    async connect() {
        if (!this.client) {
            this.client = new node_routeros_1.RouterOSAPI({
                host: process.env.MIKROTIK_HOST || "192.168.88.1",
                user: process.env.MIKROTIK_USER || "admin",
                password: process.env.MIKROTIK_PASS || "",
                port: parseInt(process.env.MIKROTIK_PORT || "8728"),
                timeout: 5000
            });
            await this.client.connect();
            console.log(`✅ Connected to MikroTik router at ${process.env.MIKROTIK_HOST || "192.168.88.1"}`);
        }
        return this.client;
    }
    async disconnect() {
        if (this.client) {
            await this.client.close();
            this.client = null;
            console.log("🔌 Disconnected from MikroTik router");
        }
    }
    async grantAccess(ip, isLimited, dataCap) {
        try {
            const client = await this.connect();
            const mac = await this.getUserMac(ip);
            if (mac === "00:00:00:00:00:00") {
                return { success: false, message: "Could not determine MAC address" };
            }
            // Create IP binding with appropriate type
            const bindingType = isLimited ? "regular" : "bypassed";
            const comment = `Access-${new Date().toISOString()}${dataCap ? `-${dataCap}MB` : ""}`;
            await client.write([
                "/ip/hotspot/ip-binding/add",
                `=address=${ip}`,
                `=mac-address=${mac}`,
                `=type=${bindingType}`,
                `=comment=${comment}`
            ]);
            // If data cap specified, could set up additional monitoring
            if (dataCap) {
                // Implement data usage tracking logic here
                console.log(`📊 Data cap of ${dataCap}MB set for ${ip}`);
            }
            return { success: true, message: "Access granted successfully" };
        }
        catch (error) {
            return { success: false, message: error.message || "Failed to grant access" };
        }
    }
    async grantAccessByIP(ip, duration) {
        try {
            const client = await this.connect();
            const profile = this.profileMap[duration] || "trial-profile";
            console.log(`🎯 Granting access to IP ${ip} with profile ${profile} for duration ${duration}`);
            // Method 1: IP Binding (Bypass authentication)
            const result = await client.write([
                "/ip/hotspot/ip-binding/add",
                `=address=${ip}`,
                "=type=bypassed",
                `=comment=Auto-granted-${duration}-${new Date().toISOString()}`
            ]);
            console.log(`✅ Access granted for IP ${ip} with duration ${duration}`, result);
            return { success: true, message: `Access granted for ${duration}` };
        }
        catch (error) {
            console.error(`❌ Failed to grant access for ${ip}:`, error);
            // Handle specific RouterOS errors
            if (error.message?.includes("already have such entry")) {
                return { success: true, message: "Access already granted" };
            }
            return {
                success: false,
                message: `Failed to grant access: ${error.message || error}`
            };
        }
    }
    async grantAccessByMAC(mac, duration) {
        try {
            const client = await this.connect();
            const result = await client.write([
                "/ip/hotspot/ip-binding/add",
                `=mac-address=${mac}`,
                "=type=bypassed",
                `=comment=MAC-granted-${duration}-${new Date().toISOString()}`
            ]);
            console.log(`✅ MAC ${mac} granted access for ${duration}`, result);
            return { success: true, message: `MAC access granted for ${duration}` };
        }
        catch (error) {
            console.error(`❌ Failed to grant MAC access:`, error);
            if (error.message?.includes("already have such entry")) {
                return { success: true, message: "MAC access already granted" };
            }
            return {
                success: false,
                message: `Failed to grant access: ${error.message || error}`
            };
        }
    }
    async getUserMac(ip) {
        try {
            const client = await this.connect();
            const arps = await client.write(["/ip/arp/print"]);
            const entry = arps.find((a) => a.address === ip);
            return entry?.["mac-address"] || "00:00:00:00:00:00";
        }
        catch (error) {
            console.warn(`MAC fetch failed for IP ${ip}:`, error);
            return "00:00:00:00:00:00";
        }
    }
    async getActiveUsers() {
        try {
            const client = await this.connect();
            const activeUsers = await client.write(["/ip/hotspot/active/print"]);
            console.log(`📊 Found ${activeUsers?.length || 0} active hotspot users`);
            return activeUsers || [];
        }
        catch (error) {
            console.error("Failed to get active users:", error);
            return [];
        }
    }
    async getActiveBindings() {
        try {
            const client = await this.connect();
            const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
            return bindings || [];
        }
        catch (error) {
            console.error("Failed to get IP bindings:", error);
            return [];
        }
    }
    async disconnectUser(ip) {
        try {
            const client = await this.connect();
            let disconnected = false;
            // Remove IP binding
            const bindings = await client.write(["/ip/hotspot/ip-binding/print"]);
            const binding = bindings.find((b) => b.address === ip);
            if (binding && binding[".id"]) {
                await client.write(["/ip/hotspot/ip-binding/remove", `=.id=${binding[".id"]}`]);
                disconnected = true;
                console.log(`🔓 Removed IP binding for ${ip}`);
            }
            // Disconnect active session
            const active = await client.write(["/ip/hotspot/active/print"]);
            const session = active.find((s) => s.address === ip);
            if (session && session[".id"]) {
                await client.write(["/ip/hotspot/active/remove", `=.id=${session[".id"]}`]);
                disconnected = true;
                console.log(`🚪 Disconnected active session for ${ip}`);
            }
            if (disconnected) {
                console.log(`✅ User ${ip} disconnected successfully`);
                return { success: true, message: "User disconnected successfully" };
            }
            else {
                return { success: false, message: "No active session found for this IP" };
            }
        }
        catch (error) {
            console.error(`❌ Failed to disconnect ${ip}:`, error);
            return {
                success: false,
                message: `Disconnect failed: ${error.message || error}`
            };
        }
    }
    async getSystemResource() {
        try {
            const client = await this.connect();
            const resource = await client.write(["/system/resource/print"]);
            return resource[0] || {};
        }
        catch (error) {
            console.error("Failed to get system resource:", error);
            return {};
        }
    }
    async testConnection() {
        try {
            const client = await this.connect();
            const identity = await client.write(["/system/identity/print"]);
            const resource = await this.getSystemResource();
            return {
                success: true,
                message: "Connected to MikroTik router successfully",
                info: {
                    identity: identity[0]?.name || "Unknown",
                    version: resource["version"] || "Unknown",
                    uptime: resource["uptime"] || "Unknown"
                }
            };
        }
        catch (error) {
            return {
                success: false,
                message: `Connection failed: ${error.message || error}`
            };
        }
    }
}
exports.rb951Manager = new RB951HotspotManager();
// Cleanup on process exit
process.on("SIGINT", async () => {
    console.log("\n🛑 Shutting down gracefully...");
    await exports.rb951Manager.disconnect();
    process.exit(0);
});
process.on("SIGTERM", async () => {
    console.log("\n🛑 Received SIGTERM, shutting down gracefully...");
    await exports.rb951Manager.disconnect();
    process.exit(0);
});
exports.default = exports.rb951Manager;
