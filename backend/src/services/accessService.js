"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.grantAccess = grantAccess;
exports.revokeAccess = revokeAccess;
const node_ssh_1 = require("node-ssh");
const logger_1 = __importDefault(require("../utils/logger"));
function grantAccess(ip) {
    return __awaiter(this, void 0, void 0, function* () {
        const ssh = new node_ssh_1.NodeSSH();
        try {
            yield ssh.connect({
                host: process.env.ROUTER_IP,
                username: process.env.ROUTER_USERNAME,
                password: process.env.ROUTER_PASSWORD,
            });
            // Example OpenWRT command: Whitelist IP (adjust for your router)
            yield ssh.execCommand(`iptables -t nat -D PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050 || true`); // Remove redirect
            logger_1.default.info(`Access granted for IP: ${ip}`);
        }
        catch (error) {
            logger_1.default.error("Grant access error:", error);
        }
        finally {
            ssh.dispose();
        }
    });
}
function revokeAccess(ip) {
    return __awaiter(this, void 0, void 0, function* () {
        const ssh = new node_ssh_1.NodeSSH();
        try {
            yield ssh.connect({
                host: process.env.ROUTER_IP,
                username: process.env.ROUTER_USERNAME,
                password: process.env.ROUTER_PASSWORD,
            });
            // Example: Re-add redirect to captive portal
            yield ssh.execCommand(`iptables -t nat -A PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050`);
            logger_1.default.info(`Access revoked for IP: ${ip}`);
        }
        catch (error) {
            logger_1.default.error("Revoke access error:", error);
        }
        finally {
            ssh.dispose();
        }
    });
}
