import { NodeSSH } from "node-ssh";
import logger from "../utils/logger";

export async function grantAccess(ip: string): Promise<void> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: process.env.ROUTER_IP,
      username: process.env.ROUTER_USERNAME,
      password: process.env.ROUTER_PASSWORD,
    });
    // Example OpenWRT command: Whitelist IP (adjust for your router)
    await ssh.execCommand(
      `iptables -t nat -D PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050 || true`
    ); // Remove redirect
    logger.info(`Access granted for IP: ${ip}`);
  } catch (error) {
    logger.error("Grant access error:", error);
  } finally {
    ssh.dispose();
  }
}

export async function revokeAccess(ip: string): Promise<void> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({
      host: process.env.ROUTER_IP,
      username: process.env.ROUTER_USERNAME,
      password: process.env.ROUTER_PASSWORD,
    });
    // Example: Re-add redirect to captive portal
    await ssh.execCommand(
      `iptables -t nat -A PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050`
    );
    logger.info(`Access revoked for IP: ${ip}`);
  } catch (error) {
    logger.error("Revoke access error:", error);
  } finally {
    ssh.dispose();
  }
}
