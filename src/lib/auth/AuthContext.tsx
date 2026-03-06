/**
 * Authentication Context Provider
 * Manages user session state across the application.
 * Stores JWT token and user info in localStorage.
 * Handles 2FA login flow.
 */

"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";

// ─── Types ──────────────────────────────────────────────────────

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  stationId?: string | null;
  stationName?: string | null;
  twoFactorEnabled?: boolean;
}

interface TwoFactorChallenge {
  twoFaToken: string;
  userId: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<TwoFactorChallenge | null>;
  verifyTwoFactor: (twoFaToken: string, code: string, useBackupCode?: boolean) => Promise<void>;
  logout: () => void;
  updateUser: (updates: Partial<User>) => void;
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

  // Restore session from localStorage on mount
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem("pimisa_token");
      const storedUser = localStorage.getItem("pimisa_user");

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
      }
    } catch {
      // Invalid stored data, clear it
      localStorage.removeItem("pimisa_token");
      localStorage.removeItem("pimisa_user");
    }
    setIsLoading(false);
  }, []);

  // Login function - calls the auth API
  // Returns a TwoFactorChallenge if 2FA is required, otherwise null (login complete)
  const login = useCallback(async (email: string, password: string): Promise<TwoFactorChallenge | null> => {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "Login failed");
    }

    // 2FA required — return the challenge for the login page to handle
    if (data.data.requiresTwoFactor) {
      return {
        twoFaToken: data.data.twoFaToken,
        userId: data.data.userId,
      };
    }

    // No 2FA — complete login
    const { token: newToken, user: newUser } = data.data;
    localStorage.setItem("pimisa_token", newToken);
    localStorage.setItem("pimisa_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
    return null;
  }, []);

  // Verify 2FA code after login
  const verifyTwoFactor = useCallback(async (twoFaToken: string, code: string, useBackupCode = false) => {
    const response = await fetch("/api/auth/2fa/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ twoFaToken, token: code, useBackupCode }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || "2FA verification failed");
    }

    const { token: newToken, user: newUser } = data.data;
    localStorage.setItem("pimisa_token", newToken);
    localStorage.setItem("pimisa_user", JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  }, []);

  // Logout function - clears session
  const logout = useCallback(() => {
    localStorage.removeItem("pimisa_token");
    localStorage.removeItem("pimisa_user");
    setToken(null);
    setUser(null);
  }, []);

  const updateUser = useCallback(
    (updates: Partial<User>) => {
      setUser((current) => {
        if (!current) return current;
        const updated = { ...current, ...updates };
        localStorage.setItem("pimisa_user", JSON.stringify(updated));
        return updated;
      });
    },
    []
  );

  const value: AuthContextType = {
    user,
    token,
    isLoading,
    login,
    verifyTwoFactor,
    logout,
    updateUser,
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
