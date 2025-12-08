import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import mikrotikService from "../services/mikrotik-service";
import mpesaService from "../services/mpesaService";
import logger from "../utils/logger";

const prisma = new PrismaClient();

interface TenantRequest extends Request {
  tenant?: any;
  clientIP?: string;
  clientMAC?: string;
}

interface ClientIdentity {
  ip: string;
  mac: string;
  userAgent: string;
  fingerprint: string;
}

export async function detectTenant(req: TenantRequest, res: Response, next: NextFunction): Promise<any> {
  try {
    let tenant = null;

    // METHOD 1: Subdomain detection (e.g., java-cafe.yourdomain.com)
    const hostname = req.hostname;
    const subdomain = hostname.split(".")[0];

    if (subdomain && subdomain !== "localhost" && subdomain !== process.env.DOMAIN?.split(".")[0]) {
      tenant = await prisma.tenant.findFirst({
        where: { slug: subdomain, isActive: true },
        include: {
          plans: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" }
          }
        }
      });
    }

    // METHOD 2: Path-based (e.g., yourdomain.com/java-cafe)
    if (!tenant) {
      const pathParts = req.path.split("/").filter(Boolean);
      if (pathParts.length > 0) {
        const slug = pathParts[0];
        tenant = await prisma.tenant.findFirst({
          where: { slug, isActive: true },
          include: {
            plans: {
              where: { isActive: true },
              orderBy: { sortOrder: "asc" }
            }
          }
        });
      }
    }

    // METHOD 3: Query parameter (e.g., ?tenant=mikrotik-id)
    if (!tenant && req.query.tenant) {
      tenant = await prisma.tenant.findFirst({
        where: { mikrotikId: req.query.tenant as string, isActive: true },
        include: {
          plans: {
            where: { isActive: true },
            orderBy: { sortOrder: "asc" }
          }
        }
      });
    }

    if (!tenant) {
      return res.status(404).json({
        error: "Location not found",
        message: "This hotspot location is not configured. Please contact support."
      });
    }

    const identity = await identifyClient(req, tenant.id);

    req.tenant = tenant;
    req.clientIP = identity.ip;
    req.clientMAC = identity.mac;

    logger.debug(`Client identified:`, {
      tenant: tenant.name,
      ip: identity.ip,
      mac: identity.mac
    });

    next();
  } catch (error) {
    logger.error("Tenant detection error:", error);
    res.status(500).json({ error: "Server error. Please try again." });
  }
}

async function identifyClient(req: Request, tenantId: string): Promise<ClientIdentity> {
  let ip = (req.query.ip as string) || getClientIP(req);

  let mac = (req.query.mac as string) || "";

  if (!mac || mac === "00:00:00:00:00:00") {
    try {
      mac = await mikrotikService.getUserMac(tenantId, ip);
    } catch (error) {
      logger.warn(`Could not get MAC for IP ${ip}:`, error);
      mac = "00:00:00:00:00:00";
    }
  }

  const userAgent = req.headers["user-agent"] || "";
  const fingerprint = generateFingerprint(req);

  return { ip, mac, userAgent, fingerprint };
}

function getClientIP(req: Request): string {
  const cfIP = req.headers["cf-connecting-ip"];
  if (cfIP && typeof cfIP === "string") {
    return cfIP.trim();
  }
  const xRealIP = req.headers["x-real-ip"];
  if (xRealIP && typeof xRealIP === "string") {
    return xRealIP.trim();
  }
  const xForwardedFor = req.headers["x-forwarded-for"];
  if (typeof xForwardedFor === "string") {
    return xForwardedFor.split(",")[0].trim();
  }
  return req.ip || req.socket.remoteAddress || "unknown";
}

function generateFingerprint(req: Request): string {
  const components = [req.headers["user-agent"], req.headers["accept-language"], req.headers["accept-encoding"]].join(
    "|"
  );

  return Buffer.from(components).toString("base64").substring(0, 32);
}

/**
 * Show portal homepage
 * GET /
 */
export async function showPortal(req: TenantRequest, res: Response) {
  try {
    const { tenant, clientIP, clientMAC } = req;

    // Check for existing active session
    const activeSession = await prisma.session.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ mac: clientMAC }, { currentIP: clientIP }],
        status: "ACTIVE",
        expiresAt: { gt: new Date() }
      },
      include: { plan: true }
    });

    if (activeSession) {
      // User has active session
      const timeRemaining = Math.max(0, Math.floor((activeSession.expiresAt.getTime() - Date.now()) / 1000));

      // Get data usage
      const dataUsed = await mikrotikService.getDataUsage(tenant.id, activeSession.id);

      return res.json({
        hasActiveSession: true,
        session: {
          id: activeSession.id,
          planName: activeSession.plan.name,
          expiresAt: activeSession.expiresAt,
          timeRemaining,
          dataUsed,
          dataCap: activeSession.dataCapMB
        },
        tenant: {
          name: tenant.name,
          brandColor: tenant.brandColor,
          logoUrl: tenant.logoUrl
        }
      });
    }
    res.json({
      hasActiveSession: false,
      tenant: {
        name: tenant.name,
        brandColor: tenant.brandColor,
        logoUrl: tenant.logoUrl,
        splashMessage: tenant.splashMessage
      },
      plans: tenant.plans.map((plan: any) => ({
        id: plan.id,
        name: plan.name,
        description: plan.description,
        hours: plan.hours,
        price: plan.price / 100, // Convert to major unit
        dataCap: plan.dataCap,
        dataCapGB: plan.dataCap ? (plan.dataCap / 1000).toFixed(1) : null,
        speedLimit: plan.speedLimit,
        isFeatured: plan.isFeatured,
        badge: plan.badge
      })),
      clientIP,
      clientMAC
    });
  } catch (error) {
    logger.error("Portal display error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Initiate payment
 * POST /payment/initiate
 */
export async function initiatePayment(req: TenantRequest, res: Response) {
  try {
    const { tenant, clientIP, clientMAC } = req;
    const { planId, phoneNumber } = req.body;

    if (!planId) {
      return res.status(400).json({ error: "Plan ID is required" });
    }

    // Get plan
    const plan = await prisma.plan.findFirst({
      where: {
        id: planId,
        tenantId: tenant.id,
        isActive: true
      }
    });

    if (!plan) {
      return res.status(404).json({ error: "Plan not found" });
    }

    // Check for existing active session
    const existingSession = await prisma.session.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ mac: clientMAC }, { currentIP: clientIP }],
        status: "ACTIVE",
        expiresAt: { gt: new Date() }
      },
      include: { plan: true }
    });

    if (existingSession) {
      return res.status(400).json({
        error: "You already have an active session",
        session: {
          planName: existingSession.plan.name,
          expiresAt: existingSession.expiresAt
        }
      });
    }

    // Calculate expiry
    const expiresAt = new Date(Date.now() + plan.hours * 60 * 60 * 1000);

    // Handle FREE plans
    if (plan.price === 0) {
      const session = await prisma.session.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          mac: clientMAC!,
          currentIP: clientIP,
          ipHistory: [clientIP!],
          status: "ACTIVE",
          expiresAt,
          dataCapMB: plan.dataCap
        }
      });
      // Grant access
      const granted = await mikrotikService.grantAccess({
        tenantId: tenant.id,
        mac: clientMAC!,
        ip: clientIP!,
        sessionId: session.id,
        duration: plan.hours,
        dataCap: plan.dataCap || undefined,
        speedLimit: plan.speedLimit || undefined
      });

      if (!granted) {
        await prisma.session.delete({ where: { id: session.id } });
        return res.status(500).json({ error: "Failed to grant access" });
      }

      return res.json({
        success: true,
        message: "Free access granted! Enjoy your browsing.",
        session: {
          id: session.id,
          planName: plan.name,
          expiresAt: session.expiresAt
        }
      });
    }
    // Handle PAID plans
    if (!phoneNumber) {
      return res.status(400).json({
        error: "Phone number is required for paid plans"
      });
    }
    try {
      const formattedPhone = mpesaService.formatPhoneNumber(phoneNumber);
      // Create transaction first
      const transaction = await prisma.transaction.create({
        data: {
          tenantId: tenant.id,
          phoneNumber: formattedPhone,
          amount: plan.price,
          status: "PENDING"
        }
      });
      // Create pending session
      const session = await prisma.session.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          mac: clientMAC!,
          currentIP: clientIP,
          ipHistory: [clientIP!],
          status: "PENDING",
          expiresAt,
          dataCapMB: plan.dataCap,
          transactionId: transaction.id
        }
      });

      // Initiate STK push
      const stkResponse = await mpesaService.initiateStkPush({
        tenantId: tenant.id,
        phoneNumber: formattedPhone,
        amount: plan.price / 100, // Convert to major unit
        accountReference: tenant.name,
        transactionDesc: `${plan.name} - ${tenant.name}`
      });

      if (stkResponse.ResponseCode !== "0") {
        // STK push failed
        await prisma.transaction.update({
          where: { id: transaction.id },
          data: { status: "FAILED", failureReason: stkResponse.ResponseDescription }
        });

        await prisma.session.delete({ where: { id: session.id } });

        return res.status(500).json({
          error: "Payment initiation failed",
          message: stkResponse.ResponseDescription
        });
      }

      // Update transaction with checkout ID
      await prisma.transaction.update({
        where: { id: transaction.id },
        data: {
          checkoutRequestId: stkResponse.CheckoutRequestID,
          merchantRequestId: stkResponse.MerchantRequestID
        }
      });

      return res.json({
        success: true,
        message: "Payment request sent to your phone. Enter M-Pesa PIN to complete.",
        checkoutRequestId: stkResponse.CheckoutRequestID,
        sessionId: session.id
      });
    } catch (error: any) {
      logger.error("Payment initiation error:", error);
      return res.status(500).json({
        error: "Payment initiation failed",
        message: error.message
      });
    }
  } catch (error) {
    logger.error("Initiate payment error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Check session status
 * GET /session/status
 */
export async function getSessionStatus(req: TenantRequest, res: Response) {
  try {
    const { tenant, clientIP, clientMAC } = req;

    const session = await prisma.session.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ mac: clientMAC }, { currentIP: clientIP }],
        status: { in: ["PENDING", "ACTIVE"] },
        expiresAt: { gt: new Date() }
      },
      include: { plan: true },
      orderBy: { createdAt: "desc" }
    });

    if (!session) {
      return res.json({
        hasActiveSession: false,
        status: "NO_SESSION"
      });
    }

    // Get data usage for active sessions
    let dataUsed = 0;
    if (session.status === "ACTIVE") {
      dataUsed = await mikrotikService.getDataUsage(tenant.id, session.id);

      // Update session with data usage
      await prisma.session.update({
        where: { id: session.id },
        data: {
          dataUsedMB: dataUsed,
          lastSeenAt: new Date()
        }
      });

      // Check if data cap exceeded
      if (session.dataCapMB && dataUsed >= session.dataCapMB) {
        await mikrotikService.discon(tenant.id, clientIP!, session.id);

        await prisma.session.update({
          where: { id: session.id },
          data: {
            status: "DATA_EXCEEDED",
            terminationReason: "data_cap",
            disconnectedAt: new Date()
          }
        });

        return res.json({
          hasActiveSession: false,
          status: "DATA_EXCEEDED",
          message: "Data cap exceeded. Session terminated."
        });
      }
    }

    const timeRemaining = Math.max(0, Math.floor((session.expiresAt.getTime() - Date.now()) / 1000));

    res.json({
      hasActiveSession: session.status === "ACTIVE",
      status: session.status,
      session: {
        id: session.id,
        planName: session.plan.name,
        expiresAt: session.expiresAt,
        timeRemaining,
        dataUsed,
        dataCap: session.dataCapMB,
        dataCapGB: session.dataCapMB ? (session.dataCapMB / 1000).toFixed(1) : null,
        remainingMB: session.dataCapMB ? Math.max(0, session.dataCapMB - dataUsed) : null,
        percentUsed: session.dataCapMB ? Math.min(100, (dataUsed / session.dataCapMB) * 100) : null
      }
    });
  } catch (error) {
    logger.error("Session status error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * Disconnect session
 */
export async function disconnectSession(req: TenantRequest, res: Response) {
  try {
    const { tenant, clientIP, clientMAC } = req;

    const session = await prisma.session.findFirst({
      where: {
        tenantId: tenant.id,
        OR: [{ mac: clientMAC }, { currentIP: clientIP }],
        status: "ACTIVE",
        expiresAt: { gt: new Date() }
      }
    });

    if (!session) {
      return res.status(404).json({
        error: "No active session found"
      });
    }
    await mikrotikService.discon(tenant.id, clientIP!, session.id);
    await prisma.session.update({
      where: { id: session.id },
      data: {
        status: "TERMINATED",
        terminationReason: "manual",
        disconnectedAt: new Date()
      }
    });

    res.json({
      success: true,
      message: "Session disconnected successfully"
    });
  } catch (error) {
    logger.error("Disconnect session error:", error);
    res.status(500).json({ error: "Server error" });
  }
}

/**
 * M-Pesa callback handler
 */
export async function mpesaCallback(req: Request, res: Response) {
  try {
    await mpesaService.processCallback(req.body);
    res.send("OK");
  } catch (error) {
    logger.error("M-Pesa callback error:", error);
    res.status(500).send("Error");
  }
}
