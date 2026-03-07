/**
 * Login Page
 * Shared login for Admin and Station users.
 * Uses Firebase Authentication for email/password login.
 * Redirects based on role after successful authentication.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { Droplets, LogIn } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, user, isLoading } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  // If already logged in, redirect
  useEffect(() => {
    if (!isLoading && user) {
      addToast({
        title: "Welcome back!",
        description: `Logged in as ${user.name}`,
        variant: "success",
      });
      if (user.role === "ADMIN") {
        router.replace("/admin/dashboard");
      } else {
        router.replace("/station/verify");
      }
    }
  }, [user, isLoading, router, addToast]);

  /**
   * Translates Firebase error codes into user-friendly messages.
   */
  const getFirebaseErrorMessage = (code: string): string => {
    switch (code) {
      case "auth/user-not-found":
      case "auth/wrong-password":
      case "auth/invalid-credential":
        return "Invalid email or password";
      case "auth/too-many-requests":
        return "Too many attempts. Please try again later.";
      case "auth/user-disabled":
        return "This account has been disabled.";
      default:
        return "Login failed. Please try again.";
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await login(email, password);
      // Don't show success toast here — wait for AuthContext to resolve.
      // The useEffect above will redirect once user is set.
      // If the profile doesn't exist in Firestore, AuthContext will sign out
      // and user will remain on the login page.
    } catch (error: unknown) {
      const firebaseError = error as { code?: string; message?: string };
      addToast({
        title: "Login Failed",
        description: firebaseError.code
          ? getFirebaseErrorMessage(firebaseError.code)
          : firebaseError.message || "Invalid credentials",
        variant: "destructive",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          {/* Logo / Branding */}
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            <Droplets className="h-8 w-8 text-primary" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">
              Pimisa Voucher System
            </CardTitle>
            <CardDescription className="mt-2">
              Sign in to access the voucher management portal
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@pimisa.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="email"
                className="h-11"
              />
            </div>

            {/* Password Field */}
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isSubmitting}
                autoComplete="current-password"
                className="h-11"
              />
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              className="w-full h-11"
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  Signing in...
                </>
              ) : (
                <>
                  <LogIn className="mr-2 h-4 w-4" />
                  Sign In
                </>
              )}
            </Button>
          </form>

          {/* Help Text */}
          <p className="text-xs text-muted-foreground text-center mt-6">
            Contact your administrator if you need access.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
