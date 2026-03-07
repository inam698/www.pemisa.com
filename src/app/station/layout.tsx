/**
 * Station Layout
 * Wraps station pages with auth guard and simple header.
 * Optimized for tablet/mobile use.
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthContext";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Droplets, LogOut, MapPin } from "lucide-react";

export default function StationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();

  // Auth guard
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const handleLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white dark:from-gray-900 dark:to-gray-950">
      {/* ─── Header ─────────────────────────────────────────────── */}
      <header className="bg-white dark:bg-gray-900 border-b shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Pimisa Station</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {user.stationName || "Station Portal"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={handleLogout}>
            <LogOut className="h-4 w-4 mr-1" />
            Logout
          </Button>
        </div>
      </header>

      {/* ─── Content ────────────────────────────────────────────── */}
      <main className="max-w-2xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
