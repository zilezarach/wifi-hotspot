import { PrismaClient } from "@prisma/client";
import crypto from "crypto";

const prisma = new PrismaClient();

/**
 * Encrypts a field value using the ENCRYPTION_KEY environment variable.
 * Must match the encryption used in mpesaService.ts.
 */
function encryptField(value: string): string {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error("ENCRYPTION_KEY environment variable is required for seeding");
  }
  const keyBuffer = Buffer.from(key.slice(0, 32).padEnd(32, "0"), "utf8");
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing seed data
  await prisma.plan.deleteMany({ where: { tenant: { slug: "example-cafe" } } });
  await prisma.tenant.deleteMany({ where: { slug: "example-cafe" } });

  // Create an example tenant
  const tenant = await prisma.tenant.create({
    data: {
      name: "Example Cafe",
      slug: "example-cafe",
      ownerName: "Jane Doe",
      ownerPhone: "254712345678",
      ownerEmail: "jane@example.com",
      mikrotikId: crypto.randomBytes(16).toString("hex"),
      tunnelKey: crypto.randomBytes(32).toString("hex"),
      mikrotikHost: "192.168.88.1",
      mikrotikUser: "admin",
      mikrotikPass: encryptField("admin_password"),
      mikrotikPort: 8728,
      brandColor: "#4F46E5",
      splashMessage: "Welcome to Example Cafe WiFi! Stay connected.",
      isActive: true,
    },
  });

  console.log(`✅ Created tenant: ${tenant.name} (slug: ${tenant.slug})`);

  // Create example plans
  const plans = await Promise.all([
    prisma.plan.create({
      data: {
        tenantId: tenant.id,
        name: "1 Hour Pass",
        description: "Perfect for quick browsing",
        hours: 1,
        price: 1000, // KSh 10.00 (in cents)
        dataCap: 200, // 200 MB
        speedLimit: "5M/5M",
        isActive: true,
        isFeatured: false,
        sortOrder: 1,
      },
    }),
    prisma.plan.create({
      data: {
        tenantId: tenant.id,
        name: "4 Hour Pass",
        description: "Great for half a day",
        hours: 4,
        price: 3000, // KSh 30.00
        dataCap: 500,
        speedLimit: "10M/10M",
        isActive: true,
        isFeatured: false,
        sortOrder: 2,
      },
    }),
    prisma.plan.create({
      data: {
        tenantId: tenant.id,
        name: "Daily Pass",
        description: "Full day unlimited browsing",
        hours: 24,
        price: 10000, // KSh 100.00
        dataCap: null, // Unlimited
        speedLimit: "10M/10M",
        isActive: true,
        isFeatured: true,
        badge: "POPULAR",
        sortOrder: 3,
      },
    }),
    prisma.plan.create({
      data: {
        tenantId: tenant.id,
        name: "Weekly Pass",
        description: "Best value for the week",
        hours: 168,
        price: 50000, // KSh 500.00
        dataCap: null,
        speedLimit: "10M/10M",
        isActive: true,
        isFeatured: false,
        badge: "BEST VALUE",
        sortOrder: 4,
      },
    }),
  ]);

  console.log(`✅ Created ${plans.length} plans for ${tenant.name}`);
  console.log("\n🎉 Seeding complete!");
  console.log(`\nPortal URL: http://localhost:5000/example-cafe`);
  console.log(`Tenant ID:  ${tenant.id}`);
}

main()
  .catch((error) => {
    console.error("❌ Seeding failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
