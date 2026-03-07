/**
 * Firestore User Profile Service
 * Manages user profiles in Firestore's "users" collection.
 * This is the source of truth for roles and user metadata.
 *
 * Collection: users/{uid}
 * Document shape: UserProfile
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  startAfter,
  getCountFromServer,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { auth } from "@/lib/firebase/config";
import { getFirestore } from "firebase/firestore";

// ─── Types ──────────────────────────────────────────────────────

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  role: "ADMIN" | "STATION";
  stationId: string | null;
  stationName: string | null;
  disabled: boolean;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface CreateUserProfileData {
  uid: string;
  name: string;
  email: string;
  role: "ADMIN" | "STATION";
  stationId?: string | null;
  stationName?: string | null;
}

// ─── Firestore instance ─────────────────────────────────────────

const USERS_COLLECTION = "users";

function getDb() {
  return getFirestore(auth.app);
}

// ─── Read Operations ────────────────────────────────────────────

/**
 * Fetches a user profile by Firebase UID.
 * Returns null if the profile doesn't exist.
 */
export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const docRef = doc(getDb(), USERS_COLLECTION, uid);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) return null;

  return docToProfile(uid, snapshot.data());
}

/**
 * Fetches a user profile by email address.
 */
export async function getUserProfileByEmail(email: string): Promise<UserProfile | null> {
  const q = query(
    collection(getDb(), USERS_COLLECTION),
    where("email", "==", email),
    limit(1)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docSnap = snapshot.docs[0];
  return docToProfile(docSnap.id, docSnap.data());
}

/**
 * Lists user profiles with pagination and optional filters.
 */
export async function listUserProfiles(params: {
  pageSize?: number;
  role?: string;
  search?: string;
  lastDocId?: string;
}): Promise<{ users: UserProfile[]; total: number }> {
  const constraints: Parameters<typeof query>[1][] = [];

  if (params.role && params.role !== "ALL") {
    constraints.push(where("role", "==", params.role));
  }

  constraints.push(orderBy("createdAt", "desc"));

  if (params.pageSize) {
    constraints.push(limit(params.pageSize));
  }

  if (params.lastDocId) {
    const lastDoc = await getDoc(doc(getDb(), USERS_COLLECTION, params.lastDocId));
    if (lastDoc.exists()) {
      constraints.push(startAfter(lastDoc));
    }
  }

  const q = query(collection(getDb(), USERS_COLLECTION), ...constraints);
  const snapshot = await getDocs(q);

  let users = snapshot.docs.map((d) => docToProfile(d.id, d.data()));

  // Client-side search filtering (Firestore doesn't support full-text search)
  if (params.search) {
    const term = params.search.toLowerCase();
    users = users.filter(
      (u) =>
        u.name.toLowerCase().includes(term) ||
        u.email.toLowerCase().includes(term)
    );
  }

  // Get total count
  const countQuery = params.role && params.role !== "ALL"
    ? query(collection(getDb(), USERS_COLLECTION), where("role", "==", params.role))
    : collection(getDb(), USERS_COLLECTION);
  const countSnapshot = await getCountFromServer(countQuery);

  return { users, total: countSnapshot.data().count };
}

// ─── Write Operations ───────────────────────────────────────────

/**
 * Creates a new user profile in Firestore.
 */
export async function createUserProfile(data: CreateUserProfileData): Promise<UserProfile> {
  const docRef = doc(getDb(), USERS_COLLECTION, data.uid);
  const now = serverTimestamp();

  await setDoc(docRef, {
    name: data.name,
    email: data.email,
    role: data.role,
    stationId: data.stationId || null,
    stationName: data.stationName || null,
    disabled: false,
    createdAt: now,
    updatedAt: now,
  });

  return {
    uid: data.uid,
    name: data.name,
    email: data.email,
    role: data.role,
    stationId: data.stationId || null,
    stationName: data.stationName || null,
    disabled: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

/**
 * Updates an existing user profile.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, "name" | "role" | "stationId" | "stationName" | "disabled">>
): Promise<void> {
  const docRef = doc(getDb(), USERS_COLLECTION, uid);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Deletes a user profile from Firestore.
 */
export async function deleteUserProfile(uid: string): Promise<void> {
  const docRef = doc(getDb(), USERS_COLLECTION, uid);
  await deleteDoc(docRef);
}

// ─── Helpers ────────────────────────────────────────────────────

function docToProfile(uid: string, data: DocumentData): UserProfile {
  return {
    uid,
    name: data.name || "",
    email: data.email || "",
    role: data.role || "STATION",
    stationId: data.stationId || null,
    stationName: data.stationName || null,
    disabled: data.disabled || false,
    createdAt: data.createdAt?.toDate?.() || null,
    updatedAt: data.updatedAt?.toDate?.() || null,
  };
}
