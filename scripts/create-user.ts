/**
 * Create User Script
 * Creates a user in Firebase Auth + Firestore with a specified role.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/create-user.ts <email> <password> <name> <role> [stationId] [stationName]
 *
 * Examples:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/create-user.ts station1@pimisa.com Pass@1234 "Station Lusaka" STATION "station-1" "Lusaka Main"
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/create-user.ts admin2@pimisa.com Pass@1234 "Admin Two" ADMIN
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });
config({ path: resolve(process.cwd(), ".env") });

// ─── Parse args ─────────────────────────────────────────────────

const [,, email, password, name, role, stationId, stationName] = process.argv;

if (!email || !password || !name || !role) {
  console.error("Usage: ts-node scripts/create-user.ts <email> <password> <name> <role> [stationId] [stationName]");
  console.error("  role: ADMIN or STATION");
  process.exit(1);
}

if (role !== "ADMIN" && role !== "STATION") {
  console.error('❌ Role must be "ADMIN" or "STATION"');
  process.exit(1);
}

if (role === "STATION" && !stationId) {
  console.error("❌ Station users require a stationId");
  process.exit(1);
}

// ─── Firebase Admin Init ────────────────────────────────────────

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin credentials in .env.local");
  process.exit(1);
}

if (getApps().length === 0) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

const auth = getAuth();
const db = getFirestore();

// ─── Main ───────────────────────────────────────────────────────

async function main() {
  try {
    // Create Firebase Auth user
    const user = await auth.createUser({
      email,
      password,
      displayName: name,
      emailVerified: true,
    });
    console.log(`✅ Created Firebase Auth user: ${email} (${user.uid})`);

    // Create Firestore profile
    await db.collection("users").doc(user.uid).set({
      name,
      email,
      role,
      stationId: stationId || null,
      stationName: stationName || null,
      disabled: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✅ Created Firestore profile: role=${role}`);

    // Set custom claims
    await auth.setCustomUserClaims(user.uid, { role });
    console.log(`✅ Set custom claims: { role: "${role}" }`);

    console.log(`\n   User ready: ${email} / ${password}\n`);
  } catch (error: any) {
    if (error.code === "auth/email-already-exists") {
      console.error(`❌ User ${email} already exists in Firebase Auth`);
    } else {
      console.error("❌ Failed:", error.message);
    }
    process.exit(1);
  }
}

main();
