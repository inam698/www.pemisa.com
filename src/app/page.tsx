/**
 * Root Page
 * Redirects to login or appropriate portal based on auth state.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Spinner } from "@/components/ui/spinner";

export default function HomePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace("/login");
    } else if (user.role === "ADMIN") {
      router.replace("/admin/dashboard");
    } else {
      router.replace("/station/verify");
    }
  }, [user, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <Spinner size="lg" className="mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-primary">
          Pimisa Voucher System
        </h1>
        <p className="text-muted-foreground mt-2">Loading...</p>
      </div>
    </div>
  );
}
