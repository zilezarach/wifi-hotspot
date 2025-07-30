"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserMac = getUserMac;
exports.getUsageForIp = getUsageForIp;
exports.grantAccess = grantAccess;
exports.revokeAccess = revokeAccess;
const mikronode_1 = __importDefault(require("mikronode"));
const logger_1 = __importDefault(require("../utils/logger"));
const getConnection = () => new mikronode_1.default(process.env.ROUTER_IP ?? "192.168.88.1", process.env.ROUTER_USERNAME ?? "admin", process.env.ROUTER_PASSWORD ?? "");
async function executeMikroCommand(channel, command, params = {}) {
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
    }
    catch (error) {
        logger_1.default.error("MikroTik API error:", error);
        throw error;
    }
}
async function getUserMac(ip) {
    try {
        const response = await executeMikroCommand("mac", "/ip/arp/print", {
            where: `address=${ip}`,
        }); // Type assertion
        return response[0]?.["mac-address"] || "00:00:00:00:00:00";
    }
    catch (error) {
        logger_1.default.warn(`MAC fetch failed for IP ${ip}, using default`);
        return "00:00:00:00:00:00";
    }
}
async function getUsageForIp(ip) {
    try {
        const response = await executeMikroCommand("usage", "/queue/simple/print", {
            detail: "",
            where: `name=cap-${ip}`,
        });
        if (response && response[0]) {
            const totalBytes = BigInt(response[0]["bytes"]?.split("/")[0] || 0);
            return totalBytes;
        }
        return BigInt(0);
    }
    catch (error) {
        logger_1.default.warn(`Usage fetch failed for IP ${ip}`);
        return BigInt(0);
    }
}
async function grantAccess(ip, limited = false) {
    const commands = [
        {
            cmd: "/ip/hotspot/ip-binding/add",
            params: {
                address: ip,
                type: "bypassed",
                comment: "Granted access",
            },
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
                params: { list: "essentials", address: domain },
            });
            commands.push({
                cmd: "/ip/firewall/filter/add",
                params: {
                    chain: "forward",
                    "src-address": ip,
                    "dst-address-list": "essentials",
                    action: "accept",
                },
            });
        }
        commands.push({
            cmd: "/ip/firewall/address-list/add",
            params: { list: "blocked", address: "facebook.com" },
        });
        commands.push({
            cmd: "/ip/firewall/address-list/add",
            params: { list: "blocked", address: "youtube.com" },
        });
        commands.push({
            cmd: "/ip/firewall/address-list/add",
            params: { list: "blocked", address: "netflix.com" },
        });
        commands.push({
            cmd: "/ip/firewall/filter/add",
            params: {
                chain: "forward",
                "src-address": ip,
                "dst-address-list": "blocked",
                action: "drop",
            },
        });
        commands.push({
            cmd: "/queue/simple/add",
            params: {
                name: `limited-${ip}`,
                target: ip,
                "max-limit": "512k/512k",
            },
        });
    }
    for (const { cmd, params } of commands) {
        try {
            await executeMikroCommand("grant", cmd, params);
        }
        catch (error) {
            logger_1.default.warn(`Command failed: ${cmd}`, error);
        }
    }
    logger_1.default.info(`Access granted for IP: ${ip} (limited: ${limited})`);
}
async function revokeAccess(ip) {
    const commands = [
        {
            cmd: "/ip/hotspot/ip-binding/remove",
            params: { ".id": `* [find address=${ip}]` },
        },
        {
            cmd: "/queue/simple/remove",
            params: { ".id": `* [find name=limited-${ip}]` },
        },
    ];
    for (const { cmd, params } of commands) {
        await executeMikroCommand("revoke", cmd, params);
    }
    logger_1.default.info(`Access revoked for IP: ${ip}`);
}
