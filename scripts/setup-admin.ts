/**
 * Setup Admin User Script
 * Creates the initial admin user in Firebase Auth + Firestore.
 *
 * Usage:
 *   npx ts-node --compiler-options '{"module":"CommonJS"}' scripts/setup-admin.ts
 *
 * Or with npm script:
 *   npm run setup:admin
 *
 * Required env vars (from .env.local):
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 */

import { initializeApp, cert, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { config } from "dotenv";
import { resolve } from "path";

// Load .env.local
config({ path: resolve(process.cwd(), ".env.local") });
// Fallback to .env
config({ path: resolve(process.cwd(), ".env") });

// ─── Configuration ──────────────────────────────────────────────

const ADMIN_EMAIL = process.argv[2] || "admin@pimisa.com";
const ADMIN_PASSWORD = process.argv[3] || "Admin@123456";
const ADMIN_NAME = process.argv[4] || "System Administrator";

// ─── Firebase Admin Init ────────────────────────────────────────

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

if (!projectId || !clientEmail || !privateKey) {
  console.error("❌ Missing Firebase Admin credentials.");
  console.error("   Set these in .env.local:");
  console.error("   - FIREBASE_ADMIN_PROJECT_ID");
  console.error("   - FIREBASE_ADMIN_CLIENT_EMAIL");
  console.error("   - FIREBASE_ADMIN_PRIVATE_KEY");
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
  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   Pimisa Voucher System — Admin Setup       ║");
  console.log("╚══════════════════════════════════════════════╝\n");

  try {
    // Step 1: Create or get the Firebase Auth user
    let uid: string;
    try {
      const existing = await auth.getUserByEmail(ADMIN_EMAIL);
      uid = existing.uid;
      console.log(`✅ Firebase Auth user already exists: ${ADMIN_EMAIL} (${uid})`);

      // Update password in case it changed
      await auth.updateUser(uid, { password: ADMIN_PASSWORD, displayName: ADMIN_NAME });
      console.log(`   Updated password and display name.`);
    } catch (err: any) {
      if (err.code === "auth/user-not-found") {
        const newUser = await auth.createUser({
          email: ADMIN_EMAIL,
          password: ADMIN_PASSWORD,
          displayName: ADMIN_NAME,
          emailVerified: true,
        });
        uid = newUser.uid;
        console.log(`✅ Created Firebase Auth user: ${ADMIN_EMAIL} (${uid})`);
      } else {
        throw err;
      }
    }

    // Step 2: Create Firestore user profile
    const userDocRef = db.collection("users").doc(uid);
    const existingProfile = await userDocRef.get();

    if (existingProfile.exists) {
      // Update the role to ensure they're admin
      await userDocRef.update({
        role: "ADMIN",
        name: ADMIN_NAME,
        updatedAt: new Date(),
      });
      console.log(`✅ Updated Firestore profile to ADMIN role.`);
    } else {
      await userDocRef.set({
        name: ADMIN_NAME,
        email: ADMIN_EMAIL,
        role: "ADMIN",
        stationId: null,
        stationName: null,
        disabled: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(`✅ Created Firestore profile with ADMIN role.`);
    }

    // Step 3: Set custom claims (optional, for extra verification)
    await auth.setCustomUserClaims(uid, { role: "ADMIN" });
    console.log(`✅ Set custom claims: { role: "ADMIN" }`);

    console.log("\n══════════════════════════════════════════════");
    console.log("   Admin user is ready!");
    console.log(`   Email:    ${ADMIN_EMAIL}`);
    console.log(`   Password: ${ADMIN_PASSWORD}`);
    console.log(`   UID:      ${uid}`);
    console.log("══════════════════════════════════════════════");
    console.log("\n⚠️  Change the password after first login for security.\n");

  } catch (error) {
    console.error("❌ Setup failed:", error);
    process.exit(1);
  }
}

main();
