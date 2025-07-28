import { NodeSSH } from "node-ssh";
import logger from "../utils/logger";

async function execSshCommand(
  host: string,
  username: string,
  password: string,
  command: string
): Promise<string> {
  const ssh = new NodeSSH();
  try {
    await ssh.connect({ host, username, password });
    const result = await ssh.execCommand(command);
    if (result.stderr) {
      throw new Error(result.stderr);
    }
    return result.stdout;
  } catch (error) {
    logger.error("SSH error:", error);
    throw error;
  } finally {
    ssh.dispose();
  }
}

export async function getUserMac(ip: string): Promise<string> {
  const command = `arp -a | grep ${ip} | awk '{print $4}'`; // Fetches MAC from ARP table
  try {
    return await execSshCommand(
      process.env.ROUTER_IP!,
      process.env.ROUTER_USERNAME!,
      process.env.ROUTER_PASSWORD!,
      command
    );
  } catch (error) {
    logger.warn(`MAC fetch failed for IP ${ip}, using default`);
    return "00:00:00:00:00:00"; // Fallback
  }
}

export async function grantAccess(
  ip: string,
  limited: boolean = false
): Promise<void> {
  const commands = [];
  // Remove redirect (allow full access)
  commands.push(
    `iptables -t nat -D PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050 || true`
  );
  commands.push(
    `iptables -t nat -D PREROUTING -s ${ip} -p tcp --dport 443 -j REDIRECT --to-port 2050 || true`
  );

  if (limited) {
    // For free plans: Whitelist specific sites (e.g., government/education) – expand as needed
    commands.push(`iptables -A INPUT -s ${ip} -d eCitizen.go.ke -j ACCEPT`); // Example domain
    commands.push(`iptables -A INPUT -s ${ip} -j DROP`); // Block all else
  } else {
    // Full access for paid plans
    commands.push(`iptables -A INPUT -s ${ip} -j ACCEPT`);
  }

  for (const cmd of commands) {
    await execSshCommand(
      process.env.ROUTER_IP!,
      process.env.ROUTER_USERNAME!,
      process.env.ROUTER_PASSWORD!,
      cmd
    );
  }
  logger.info(`Access granted for IP: ${ip} (limited: ${limited})`);
}

export async function revokeAccess(ip: string): Promise<void> {
  const commands = [
    // Re-add redirect to portal and block access
    `iptables -t nat -A PREROUTING -s ${ip} -p tcp --dport 80 -j REDIRECT --to-port 2050`,
    `iptables -t nat -A PREROUTING -s ${ip} -p tcp --dport 443 -j REDIRECT --to-port 2050`,
    `iptables -D INPUT -s ${ip} -j ACCEPT || true`, // Remove whitelist
  ];

  for (const cmd of commands) {
    await execSshCommand(
      process.env.ROUTER_IP!,
      process.env.ROUTER_USERNAME!,
      process.env.ROUTER_PASSWORD!,
      cmd
    );
  }
  logger.info(`Access revoked for IP: ${ip}`);
}
