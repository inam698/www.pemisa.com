/**
 * Login Page
 * Shared login for Admin and Station users.
 * Redirects based on role after successful authentication.
 * Supports 2FA verification step.
 */

"use client";

import { useState } from "react";
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
import { Droplets, LogIn, ShieldCheck, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFaState, setTwoFaState] = useState<{ twoFaToken: string; userId: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const { login, verifyTwoFactor } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  const redirectByRole = () => {
    const storedUser = localStorage.getItem("pimisa_user");
    const user = storedUser ? JSON.parse(storedUser) : null;

    addToast({
      title: "Welcome back!",
      description: `Logged in as ${user?.name || email}`,
      variant: "success",
    });

    if (user?.role === "ADMIN") {
      router.push("/admin/dashboard");
    } else {
      router.push("/station/verify");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const challenge = await login(email, password);

      if (challenge) {
        // 2FA required — show 2FA input
        setTwoFaState(challenge);
      } else {
        // No 2FA — redirect immediately
        redirectByRole();
      }
    } catch (error) {
      addToast({
        title: "Login Failed",
        description:
          error instanceof Error ? error.message : "Invalid credentials",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleTwoFaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!twoFaState) return;
    setIsSubmitting(true);

    try {
      await verifyTwoFactor(twoFaState.twoFaToken, twoFaCode, useBackupCode);
      redirectByRole();
    } catch (error) {
      addToast({
        title: "2FA Verification Failed",
        description:
          error instanceof Error ? error.message : "Invalid code",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setTwoFaState(null);
    setTwoFaCode("");
    setUseBackupCode(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 to-emerald-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center space-y-4">
          {/* Logo / Branding */}
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center">
            {twoFaState ? (
              <ShieldCheck className="h-8 w-8 text-primary" />
            ) : (
              <Droplets className="h-8 w-8 text-primary" />
            )}
          </div>
          <div>
            <CardTitle className="text-2xl font-bold">
              {twoFaState ? "Two-Factor Authentication" : "Pimisa Voucher System"}
            </CardTitle>
            <CardDescription className="mt-2">
              {twoFaState
                ? "Enter the 6-digit code from your authenticator app"
                : "Sign in to access the voucher management portal"}
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          {twoFaState ? (
            /* ─── 2FA Verification Form ────────────────────── */
            <form onSubmit={handleTwoFaSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="twoFaCode">
                  {useBackupCode ? "Backup Code" : "Authentication Code"}
                </Label>
                <Input
                  id="twoFaCode"
                  type="text"
                  placeholder={useBackupCode ? "Enter backup code" : "000000"}
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value)}
                  required
                  disabled={isSubmitting}
                  autoComplete="one-time-code"
                  className="h-11 text-center text-lg tracking-widest"
                  maxLength={useBackupCode ? 20 : 6}
                />
              </div>

              <Button
                type="submit"
                className="w-full h-11"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <ShieldCheck className="mr-2 h-4 w-4" />
                    Verify
                  </>
                )}
              </Button>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={handleBackToLogin}
                  className="text-sm text-muted-foreground hover:text-foreground flex items-center gap-1"
                >
                  <ArrowLeft className="h-3 w-3" />
                  Back to login
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTwoFaCode("");
                  }}
                  className="text-sm text-primary hover:underline"
                >
                  {useBackupCode ? "Use authenticator app" : "Use backup code"}
                </button>
              </div>
            </form>
          ) : (
            /* ─── Login Form ────────────────────── */
            <>
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
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
