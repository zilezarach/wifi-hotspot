"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantAccess = grantAccess;
exports.revokeAccess = revokeAccess;
const node_ssh_1 = require("node-ssh");
const logger_1 = __importDefault(require("../utils/logger"));
async function grantAccess(ip) {
    const ssh = new node_ssh_1.NodeSSH();
    try {
        await ssh.connect({
            host: process.env.ROUTER_IP,
            username: process.env.ROUTER_USERNAME,
            password: process.env.ROUTER_PASSWORD,
        });
        // Example OpenWRT command: Whitelist IP (adjust for your router)
        await ssh.execCommand(`iptables -t nat -D PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050 || true`); // Remove redirect
        logger_1.default.info(`Access granted for IP: ${ip}`);
    }
    catch (error) {
        logger_1.default.error("Grant access error:", error);
    }
    finally {
        ssh.dispose();
    }
}
async function revokeAccess(ip) {
    const ssh = new node_ssh_1.NodeSSH();
    try {
        await ssh.connect({
            host: process.env.ROUTER_IP,
            username: process.env.ROUTER_USERNAME,
            password: process.env.ROUTER_PASSWORD,
        });
        // Example: Re-add redirect to captive portal
        await ssh.execCommand(`iptables -t nat -A PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050`);
        logger_1.default.info(`Access revoked for IP: ${ip}`);
    }
    catch (error) {
        logger_1.default.error("Revoke access error:", error);
    }
    finally {
        ssh.dispose();
    }
}
