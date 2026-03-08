import crypto from "crypto";

const key = crypto.randomBytes(32).toString("hex");

console.log("\n🔑 Generated ENCRYPTION_KEY:\n");
console.log(`   ENCRYPTION_KEY=${key}`);
console.log("\nAdd this value to your backend/.env file.");
console.log("⚠️  Keep this key secret and never commit it to version control.\n");
