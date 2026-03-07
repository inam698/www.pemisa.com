/**
 * Authentication Context Provider
 * Production-grade Firebase Authentication integration.
 *
 * - Uses Firebase Auth for login/logout
 * - Loads user profile (role, station) from Firestore
 * - Stores ID token for API requests (refreshed automatically)
 * - All role information comes from Firestore, NOT localStorage
 */

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  onIdTokenChanged,
  type User as FirebaseUser,
} from "firebase/auth";
import { auth as firebaseAuth } from "@/lib/firebase/config";
import { getUserProfile, type UserProfile } from "@/lib/firebase/firestore";

// ─── Types ──────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  stationId: string | null;
  stationName: string | null;
  twoFactorEnabled?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
  refreshProfile: () => Promise<void>;
  isAdmin: boolean;
  isStation: boolean;
}

// ─── Context ────────────────────────────────────────────────────

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ─── Provider ───────────────────────────────────────────────────

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const profileCache = useRef<Map<string, UserProfile>>(new Map());

  /**
   * Load user profile from Firestore and map to app User.
   * Caches profiles to avoid redundant reads on token refresh.
   */
  const loadProfile = useCallback(async (fbUser: FirebaseUser): Promise<User | null> => {
    // Check cache first
    const cached = profileCache.current.get(fbUser.uid);
    if (cached) {
      return profileToUser(cached);
    }

    const profile = await getUserProfile(fbUser.uid);

    if (!profile) {
      // User authenticated in Firebase but has no Firestore profile.
      // This happens if the admin hasn't created their profile yet.
      console.warn(`No Firestore profile for user ${fbUser.uid}. Access denied.`);
      return null;
    }

    if (profile.disabled) {
      console.warn(`User ${fbUser.uid} is disabled.`);
      return null;
    }

    profileCache.current.set(fbUser.uid, profile);
    return profileToUser(profile);
  }, []);

  /**
   * Listen for auth state changes AND token refreshes.
   * onIdTokenChanged fires on:
   *   - Initial sign-in
   *   - Token refresh (every ~55 minutes)
   *   - Sign-out
   */
  useEffect(() => {
    const unsubscribe = onIdTokenChanged(firebaseAuth, async (fbUser) => {
      if (fbUser) {
        try {
          const idToken = await fbUser.getIdToken();
          const appUser = await loadProfile(fbUser);

          if (appUser) {
            setToken(idToken);
            setUser(appUser);
            // Store token for apiClient to pick up
            localStorage.setItem("pimisa_token", idToken);
          } else {
            // Profile not found or disabled — force sign out
            await signOut(firebaseAuth);
            clearState();
          }
        } catch (err) {
          console.error("Failed to load user profile:", err);
          await signOut(firebaseAuth);
          clearState();
        }
      } else {
        clearState();
      }
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, [loadProfile]);

  /**
   * Proactively refresh the ID token before it expires.
   * Firebase tokens expire after 1 hour. We refresh at 50 minutes.
   */
  useEffect(() => {
    if (!user) return;

    const REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutes
    const interval = setInterval(async () => {
      const currentUser = firebaseAuth.currentUser;
      if (currentUser) {
        try {
          const newToken = await currentUser.getIdToken(true);
          setToken(newToken);
          localStorage.setItem("pimisa_token", newToken);
        } catch {
          // Token refresh failed — session may be revoked
          await signOut(firebaseAuth);
          clearState();
        }
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [user]);

  function clearState() {
    setToken(null);
    setUser(null);
    profileCache.current.clear();
    localStorage.removeItem("pimisa_token");
  }

  // ─── Actions ────────────────────────────────────────────────

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    // Firebase handles all authentication — onIdTokenChanged will fire
    await signInWithEmailAndPassword(firebaseAuth, email, password);
  }, []);

  const logout = useCallback(async () => {
    await signOut(firebaseAuth);
    clearState();
  }, []);

  const updateUser = useCallback((updates: Partial<User>) => {
    setUser((current) => {
      if (!current) return current;
      return { ...current, ...updates };
    });
    // Also invalidate profile cache so next read is fresh
    if (user?.id) {
      profileCache.current.delete(user.id);
    }
  }, [user?.id]);

  /**
   * Force-refresh the user profile from Firestore.
   * Use after admin updates a user's role or station.
   */
  const refreshProfile = useCallback(async () => {
    const currentUser = firebaseAuth.currentUser;
    if (!currentUser) return;

    // Clear cache to force re-read
    profileCache.current.delete(currentUser.uid);
    const appUser = await loadProfile(currentUser);
    if (appUser) {
      setUser(appUser);
    }
  }, [loadProfile]);

  // ─── Value ──────────────────────────────────────────────────

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    logout,
    updateUser,
    refreshProfile,
    isAdmin: user?.role === "ADMIN",
    isStation: user?.role === "STATION",
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// ─── Hook ───────────────────────────────────────────────────────

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

// ─── Helpers ────────────────────────────────────────────────────

function profileToUser(profile: UserProfile): User {
  return {
    id: profile.uid,
    name: profile.name,
    email: profile.email,
    role: profile.role,
    stationId: profile.stationId,
    stationName: profile.stationName,
  };
}
