import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import mikrotikService from "../services/mikrotik-service";
import mpesaService from "../services/mpesaService";
import logger from "../utils/logger";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Create new tenant (location)
 * POST /api/admin/tenants
 */
export async function createTenant(req: Request, res: Response) {
  try {
    const {
      name,
      ownerName,
      ownerPhone,
      ownerEmail,
      mikrotikHost,
      mikrotikUser = "admin",
      mikrotikPass,
      mikrotikPort = 8728,
      mpesaShortcode,
      mpesaKey,
      mpesaSecret,
      mpesaPasskey
    } = req.body;

    // Validate required fields
    if (!name || !ownerName || !ownerPhone || !mikrotikHost || !mikrotikPass) {
      return res.status(400).json({
        error: "Missing required fields"
      });
    }

    // Generate unique identifiers
    const slug = generateSlug(name);
    const mikrotikId = crypto.randomBytes(16).toString("hex");
    const tunnelKey = crypto.randomBytes(32).toString("hex");

    // Encrypt MikroTik password
    const encryptedPass = mpesaService.encryptField(mikrotikPass);

    // Encrypt M-Pesa credentials if provided
    const usesOwnMpesa = !!(mpesaShortcode && mpesaKey && mpesaSecret && mpesaPasskey);

    const tenant = await prisma.tenant.create({
      data: {
        name,
        slug,
        ownerName,
        ownerPhone,
        ownerEmail,
        mikrotikId,
        tunnelKey,
        mikrotikHost,
        mikrotikUser,
        mikrotikPass: encryptedPass,
        mikrotikPort,
        usesOwnMpesa,
        mpesaShortcode: mpesaShortcode || null,
        mpesaKey: mpesaKey ? mpesaService.encryptField(mpesaKey) : null,
        mpesaSecret: mpesaSecret ? mpesaService.encryptField(mpesaSecret) : null,
        mpesaPasskey: mpesaPasskey ? mpesaService.encryptField(mpesaPasskey) : null
      }
    });

    // Create default plans
    await createDefaultPlans(tenant.id);

    // Generate installation script
    const installScript = generateMikroTikScript(tenant);

    logger.info(`Created tenant: ${tenant.name} (${tenant.id})`);

    res.json({
      success: true,
      tenant: {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        portalUrl: getPortalUrl(tenant.slug)
      },
      installScript,
      instructions: getInstallationInstructions(tenant)
    });
  } catch (error: any) {
    logger.error("Create tenant error:", error);

    if (error.code === "P2002") {
      return res.status(400).json({
        error: "A tenant with this name or configuration already exists"
      });
    }

    res.status(500).json({ error: "Failed to create tenant" });
  }
}

/**
 * List all tenants
 * GET /api/admin/tenants
 */
export async function listTenants(req: Request, res: Response) {
  try {
    const tenants = await prisma.tenant.findMany({
      include: {
        _count: {
          select: {
            sessions: { where: { status: "ACTIVE" } },
            transactions: { where: { status: "COMPLETED" } }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    const tenantsWithStatus = tenants.map(tenant => {
      const isOnline = tenant.lastSeen
        ? Date.now() - tenant.lastSeen.getTime() < 600000 // 10 minutes
        : false;

      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        ownerName: tenant.ownerName,
        ownerPhone: tenant.ownerPhone,
        isActive: tenant.isActive,
        isOnline,
        lastSeen: tenant.lastSeen,
        activeSessions: tenant._count.sessions,
        totalTransactions: tenant._count.transactions,
        portalUrl: getPortalUrl(tenant.slug),
        createdAt: tenant.createdAt
      };
    });

    res.json({
      success: true,
      tenants: tenantsWithStatus,
      totalTenants: tenants.length,
      onlineTenants: tenantsWithStatus.filter(t => t.isOnline).length
    });
  } catch (error) {
    logger.error("List tenants error:", error);
    res.status(500).json({ error: "Failed to list tenants" });
  }
}

/**
 * Get tenant details
 * GET /api/admin/tenants/:tenantId
 */
export async function getTenant(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;

    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        plans: { orderBy: { sortOrder: "asc" } },
        _count: {
          select: {
            sessions: true,
            transactions: true
          }
        }
      }
    });

    if (!tenant) {
      return res.status(404).json({ error: "Tenant not found" });
    }

    // Get router stats
    const routerStats = await mikrotikService.getRouterStats(tenantId);

    res.json({
      success: true,
      tenant: {
        ...tenant,
        mikrotikPass: undefined, // Don't send password
        mpesaKey: undefined,
        mpesaSecret: undefined,
        mpesaPasskey: undefined,
        portalUrl: getPortalUrl(tenant.slug),
        routerStats
      }
    });
  } catch (error) {
    logger.error("Get tenant error:", error);
    res.status(500).json({ error: "Failed to get tenant" });
  }
}

/**
 * Update tenant
 * PUT /api/admin/tenants/:tenantId
 */
export async function updateTenant(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    const updates = req.body;

    // Don't allow updating certain fields
    delete updates.id;
    delete updates.mikrotikId;
    delete updates.tunnelKey;
    delete updates.createdAt;

    // Encrypt password if provided
    if (updates.mikrotikPass) {
      updates.mikrotikPass = mpesaService.encryptField(updates.mikrotikPass);
    }

    // Encrypt M-Pesa credentials if provided
    if (updates.mpesaKey) {
      updates.mpesaKey = mpesaService.encryptField(updates.mpesaKey);
    }
    if (updates.mpesaSecret) {
      updates.mpesaSecret = mpesaService.encryptField(updates.mpesaSecret);
    }
    if (updates.mpesaPasskey) {
      updates.mpesaPasskey = mpesaService.encryptField(updates.mpesaPasskey);
    }

    const tenant = await prisma.tenant.update({
      where: { id: tenantId },
      data: updates
    });

    logger.info(` Updated tenant: ${tenant.name}`);

    res.json({
      success: true,
      tenant
    });
  } catch (error) {
    logger.error("Update tenant error:", error);
    res.status(500).json({ error: "Failed to update tenant" });
  }
}

/**
 * Delete tenant
 * DELETE /api/admin/tenants/:tenantId
 */
export async function deleteTenant(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;

    // Disconnect from router first
    await mikrotikService.discon(tenantId);

    // Delete tenant (cascade will delete sessions, transactions, etc.)
    await prisma.tenant.delete({
      where: { id: tenantId }
    });

    logger.info(`✅ Deleted tenant: ${tenantId}`);

    res.json({
      success: true,
      message: "Tenant deleted successfully"
    });
  } catch (error) {
    logger.error("Delete tenant error:", error);
    res.status(500).json({ error: "Failed to delete tenant" });
  }
}

/**
 * Test tenant's MikroTik connection
 * POST /api/admin/tenants/:tenantId/test
 */
export async function testTenantConnection(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;

    const result = await mikrotikService.testConnection(tenantId);

    res.json(result);
  } catch (error) {
    logger.error("Test connection error:", error);
    res.status(500).json({
      success: false,
      message: "Connection test failed"
    });
  }
}

/**
 * Get dashboard statistics
 * GET /api/admin/dashboard
 */
export async function getDashboard(req: Request, res: Response) {
  try {
    const now = new Date();
    const todayStart = new Date(now.setHours(0, 0, 0, 0));

    const [tenants, activeSessions, todayTransactions, todayRevenue] = await Promise.all([
      prisma.tenant.count({ where: { isActive: true } }),
      prisma.session.count({
        where: { status: "ACTIVE", expiresAt: { gt: new Date() } }
      }),
      prisma.transaction.count({
        where: {
          status: "COMPLETED",
          createdAt: { gte: todayStart }
        }
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          status: "COMPLETED",
          createdAt: { gte: todayStart }
        }
      })
    ]);

    res.json({
      success: true,
      stats: {
        totalLocations: tenants,
        activeUsers: activeSessions,
        todayTransactions,
        todayRevenue: (todayRevenue._sum.amount || 0) / 100
      }
    });
  } catch (error) {
    logger.error("Dashboard error:", error);
    res.status(500).json({ error: "Failed to load dashboard" });
  }
}

/**
 * Get tenant analytics
 * GET /api/admin/tenants/:tenantId/analytics
 */
export async function getTenantAnalytics(req: Request, res: Response) {
  try {
    const { tenantId } = req.params;
    const { days = 7 } = req.query;

    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days as string));

    const [sessions, transactions, revenue] = await Promise.all([
      prisma.session.groupBy({
        by: ["status"],
        where: {
          tenantId,
          createdAt: { gte: startDate }
        },
        _count: true
      }),
      prisma.transaction.groupBy({
        by: ["status"],
        where: {
          tenantId,
          createdAt: { gte: startDate }
        },
        _count: true
      }),
      prisma.transaction.aggregate({
        _sum: { amount: true },
        where: {
          tenantId,
          status: "COMPLETED",
          createdAt: { gte: startDate }
        }
      })
    ]);

    res.json({
      success: true,
      analytics: {
        sessions,
        transactions,
        totalRevenue: (revenue._sum.amount || 0) / 100,
        period: `${days} days`
      }
    });
  } catch (error) {
    logger.error("Tenant analytics error:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
}

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function getPortalUrl(slug: string): string {
  const domain = process.env.DOMAIN || "localhost:3000";
  return `https://${slug}.${domain}`;
}

function generateMikroTikScript(tenant: any): string {
  const serverIP = process.env.SERVER_IP || "YOUR_SERVER_IP";

  return `
# ============================================
# HOTSPOT SETUP FOR ${tenant.name}
# Generated: ${new Date().toISOString()}
# MadeBy: Zile
# ============================================

# Create API User
/user add name=hotspot-api password=${crypto.randomBytes(8).toString("hex")} group=full comment="API access"

# Enable API Service
/ip service set api address=${serverIP} disabled=no

# Configure Firewall
/ip firewall filter add chain=input src-address=${serverIP} protocol=tcp dst-port=8728 action=accept comment="Allow API"

# Configure Walled Garden
/ip hotspot walled-garden add dst-host=*.${process.env.DOMAIN} comment="Portal"
/ip hotspot walled-garden add dst-host=*.safaricom.co.ke comment="M-Pesa"

# Installation Complete!
# Portal URL: ${getPortalUrl(tenant.slug)}
`;
}

function getInstallationInstructions(tenant: any): string[] {
  return [
    "1. Download WinBox from mikrotik.com",
    `2. Connect to router (${tenant.mikrotikHost})`,
    "3. Login with admin credentials",
    "4. Open New Terminal",
    "5. Copy and paste the installation script",
    "6. Press Enter and wait ~2 minutes",
    `7. Test at: ${getPortalUrl(tenant.slug)}`
  ];
}

async function createDefaultPlans(tenantId: string): Promise<void> {
  const defaultPlans = [
    {
      name: "30 Minutes Free",
      description: "Perfect for quick browsing",
      hours: 0.5,
      price: 0,
      dataCap: 100,
      speedLimit: "2M/2M",
      sortOrder: 1,
      isFeatured: false
    },
    {
      name: "1 Hour - KSh 10",
      description: "Best for social media",
      hours: 1,
      price: 1000, // KSh 10.00 in cents
      dataCap: null,
      speedLimit: "5M/5M",
      sortOrder: 2,
      isFeatured: true,
      badge: "POPULAR"
    },
    {
      name: "4 Hours - KSh 30",
      description: "Great for work & streaming",
      hours: 4,
      price: 3000,
      dataCap: null,
      speedLimit: "5M/5M",
      sortOrder: 3,
      isFeatured: false
    },
    {
      name: "24 Hours - KSh 50",
      description: "Full day access",
      hours: 24,
      price: 5000,
      dataCap: 5000, // 5GB
      speedLimit: "10M/10M",
      sortOrder: 4,
      isFeatured: false,
      badge: "BEST VALUE"
    },
    {
      name: "Weekly Unlimited - KSh 200",
      description: "7 days of unlimited browsing",
      hours: 168,
      price: 20000,
      dataCap: null,
      speedLimit: "10M/10M",
      sortOrder: 5,
      isFeatured: false
    }
  ];

  for (const plan of defaultPlans) {
    await prisma.plan.create({
      data: {
        ...plan,
        tenantId,
        isActive: true
      }
    });
  }

  logger.info(` Created ${defaultPlans.length} default plans for tenant ${tenantId}`);
}
