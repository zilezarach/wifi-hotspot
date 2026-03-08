import dotenv from "dotenv";

dotenv.config();

const requiredVars: Array<{ name: string; description: string }> = [
  { name: "DATABASE_URL", description: "PostgreSQL connection string" },
  { name: "NODE_ENV", description: "Application environment (development/production)" },
  { name: "SERVER_PORT", description: "Port the server listens on" },
  { name: "SERVER_IP", description: "IP address the server binds to" },
  { name: "DOMAIN", description: "Public URL of your server" },
  { name: "MPESA_CONSUMER_KEY", description: "Daraja API consumer key" },
  { name: "MPESA_CONSUMER_SECRET", description: "Daraja API consumer secret" },
  { name: "MPESA_SHORTCODE", description: "M-Pesa paybill or till number" },
  { name: "MPESA_PASSKEY", description: "Lipa Na M-Pesa passkey" },
  { name: "MPESA_CALLBACK_URL", description: "Public HTTPS URL for payment callbacks" },
  { name: "ENCRYPTION_KEY", description: "32-character key for encrypting stored secrets" },
];

function validateEnv(): void {
  console.log("🔍 Validating environment variables...\n");

  const missing: typeof requiredVars = [];
  const present: typeof requiredVars = [];

  for (const variable of requiredVars) {
    if (process.env[variable.name]) {
      present.push(variable);
    } else {
      missing.push(variable);
    }
  }

  for (const variable of present) {
    console.log(`  ✅  ${variable.name}`);
  }

  if (missing.length > 0) {
    console.log("");
    console.error("  ❌  Missing required environment variables:\n");
    for (const variable of missing) {
      console.error(`       ${variable.name.padEnd(25)} – ${variable.description}`);
    }
    console.log("\n  Copy backend/.env.example to backend/.env and fill in the missing values.");
    process.exit(1);
  }

  // Extra validation (only when variables are present)
  const encKey = process.env.ENCRYPTION_KEY;
  if (encKey !== undefined && encKey.length < 16) {
    console.error("\n  ❌  ENCRYPTION_KEY is too short. Use at least 16 characters (32 recommended).");
    process.exit(1);
  }

  const callbackUrl = process.env.MPESA_CALLBACK_URL;
  if (callbackUrl !== undefined && process.env.NODE_ENV === "production" && !callbackUrl.startsWith("https://")) {
    console.warn("\n  ⚠️   MPESA_CALLBACK_URL should use https:// in production.");
  }

  console.log("\n✅  All required environment variables are set.");
}

validateEnv();
