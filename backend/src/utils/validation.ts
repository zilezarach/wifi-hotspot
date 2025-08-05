export function isValidIP(ip: string): boolean {
  const ipRegex =
    /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipRegex.test(ip) && !["127.0.0.1", "0.0.0.0", "::1"].includes(ip);
}

export function isValidMAC(mac: string): boolean {
  if (!mac || mac === "00:00:00:00:00:00") return false;
  const macRegex = /^([0-9A-Fa-f]{2}[:-]){5}([0-9A-Fa-f]{2})$/;
  return macRegex.test(mac);
}

export function sanitizeIP(ip: string): string {
  return ip.replace(/[^0-9.]/g, "");
}
