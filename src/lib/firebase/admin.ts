/**
 * Firebase Admin SDK
 * Server-side Firebase initialization for verifying ID tokens.
 * Used by API routes to authenticate requests.
 *
 * Required env vars:
 *   FIREBASE_ADMIN_PROJECT_ID
 *   FIREBASE_ADMIN_CLIENT_EMAIL
 *   FIREBASE_ADMIN_PRIVATE_KEY
 */

import { initializeApp, getApps, cert, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) {
    return existing[0];
  }

  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  // Private key comes with escaped newlines from env — unescape them
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "Missing Firebase Admin credentials. Set FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL, and FIREBASE_ADMIN_PRIVATE_KEY in .env.local"
    );
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
}

let adminAuth: Auth | null = null;
let adminFirestore: Firestore | null = null;

/**
 * Returns the Firebase Admin Auth instance.
 * Lazily initializes on first call.
 */
export function getAdminAuth(): Auth {
  if (!adminAuth) {
    adminAuth = getAuth(getAdminApp());
  }
  return adminAuth;
}

/**
 * Returns the Firebase Admin Firestore instance.
 * Lazily initializes on first call.
 */
export function getAdminFirestore(): Firestore {
  if (!adminFirestore) {
    adminFirestore = getFirestore(getAdminApp());
  }
  return adminFirestore;
}

/**
 * Verifies a Firebase ID token.
 * Returns the decoded token or null if invalid/expired.
 */
export async function verifyFirebaseToken(idToken: string) {
  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    return decoded;
  } catch {
    return null;
  }
}
