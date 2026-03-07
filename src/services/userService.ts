/**
 * User Service
 * CRUD operations for managing admin and station users.
 * Uses Firebase Admin SDK for auth + Firestore for profiles.
 */

import { getAdminAuth, getAdminFirestore } from "@/lib/firebase/admin";
import type { UserRole } from "@/types";

const USERS_COLLECTION = "users";

export async function getUsers(params: {
  page?: number;
  pageSize?: number;
  role?: string;
  search?: string;
}) {
  const page = params.page || 1;
  const pageSize = params.pageSize || 50;
  const db = getAdminFirestore();

  let q: FirebaseFirestore.Query = db.collection(USERS_COLLECTION).orderBy("createdAt", "desc");

  if (params.role && params.role !== "ALL") {
    q = q.where("role", "==", params.role);
  }

  const allDocs = await q.get();
  let users = allDocs.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      name: data.name || "",
      email: data.email || "",
      role: data.role || "STATION",
      stationId: data.stationId || null,
      stationName: data.stationName || null,
      createdAt: data.createdAt?.toDate?.()?.toISOString() || new Date().toISOString(),
    };
  });

  // Client-side search filtering
  if (params.search) {
    const term = params.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
    );
  }

  const total = users.length;
  const start = (page - 1) * pageSize;
  const paged = users.slice(start, start + pageSize);

  return {
    data: paged,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  };
}

export async function createUser(data: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  stationId?: string | null;
  stationName?: string | null;
}) {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Create Firebase Auth user
  const firebaseUser = await auth.createUser({
    email: data.email,
    password: data.password,
    displayName: data.name,
    emailVerified: true,
  });

  // Create Firestore profile
  await db.collection(USERS_COLLECTION).doc(firebaseUser.uid).set({
    name: data.name,
    email: data.email,
    role: data.role,
    stationId: data.stationId || null,
    stationName: data.stationName || null,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  // Set custom claims for role
  await auth.setCustomUserClaims(firebaseUser.uid, { role: data.role });

  return {
    id: firebaseUser.uid,
    name: data.name,
    email: data.email,
    role: data.role,
    stationId: data.stationId || null,
    stationName: data.stationName || null,
  };
}

export async function updateUser(
  id: string,
  data: { name?: string; email?: string; role?: UserRole; stationId?: string | null; stationName?: string | null }
) {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Check email uniqueness if changing email
  if (data.email) {
    try {
      const existing = await auth.getUserByEmail(data.email);
      if (existing.uid !== id) {
        throw new Error("Another user with this email already exists");
      }
    } catch (err: any) {
      if (err.code !== "auth/user-not-found") {
        if (err.message?.includes("Another user")) throw err;
      }
    }
  }

  // Update Firebase Auth
  const authUpdate: Record<string, string> = {};
  if (data.name) authUpdate.displayName = data.name;
  if (data.email) authUpdate.email = data.email;
  if (Object.keys(authUpdate).length > 0) {
    await auth.updateUser(id, authUpdate);
  }

  // Update Firestore profile
  const profileUpdate: Record<string, unknown> = { updatedAt: new Date() };
  if (data.name) profileUpdate.name = data.name;
  if (data.email) profileUpdate.email = data.email;
  if (data.role) profileUpdate.role = data.role;
  if (data.stationId !== undefined) profileUpdate.stationId = data.stationId || null;
  if (data.stationName !== undefined) profileUpdate.stationName = data.stationName || null;

  await db.collection(USERS_COLLECTION).doc(id).update(profileUpdate);

  // Update custom claims if role changed
  if (data.role) {
    await auth.setCustomUserClaims(id, { role: data.role });
  }

  const doc = await db.collection(USERS_COLLECTION).doc(id).get();
  const profile = doc.data()!;

  return {
    id,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    stationId: profile.stationId || null,
    stationName: profile.stationName || null,
  };
}

export async function deleteUser(id: string) {
  const auth = getAdminAuth();
  const db = getAdminFirestore();

  // Delete from Firebase Auth
  await auth.deleteUser(id);

  // Delete from Firestore
  await db.collection(USERS_COLLECTION).doc(id).delete();
}

export async function resetUserPassword(id: string, newPassword: string) {
  const auth = getAdminAuth();
  await auth.updateUser(id, { password: newPassword });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  // With Firebase, password changes should be done client-side using
  // reauthenticateWithCredential + updatePassword.
  // Server-side, we can only force-reset (no current password check).
  // For security, this should be called from a client that has already
  // reauthenticated the user.
  const auth = getAdminAuth();
  await auth.updateUser(userId, { password: newPassword });
}
