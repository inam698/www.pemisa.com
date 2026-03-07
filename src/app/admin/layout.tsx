/**
 * Admin Layout
 * Wraps all admin pages with navigation sidebar and auth guard.
 */

"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthContext";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  LayoutDashboard,
  Upload,
  Ticket,
  LogOut,
  Droplets,
  Menu,
  X,
  Users,
  Building2,
  FileText,
  History,
  Layers,
  Eye,
  Download,
  Settings,
  Cpu,
  ShoppingCart,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

// Navigation items for admin sidebar
const navItems = [
  {
    href: "/admin/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/admin/upload",
    label: "Upload CSV",
    icon: Upload,
  },
  {
    href: "/admin/vouchers",
    label: "Vouchers",
    icon: Ticket,
  },
  {
    href: "/admin/users",
    label: "Users",
    icon: Users,
  },
  {
    href: "/admin/stations",
    label: "Stations",
    icon: Building2,
  },
  {
    href: "/admin/batches",
    label: "Batches",
    icon: Layers,
  },
  {
    href: "/admin/beneficiaries",
    label: "Beneficiaries",
    icon: Eye,
  },
  {
    href: "/admin/machines",
    label: "Machines",
    icon: Cpu,
  },
  {
    href: "/admin/sales",
    label: "Sales",
    icon: ShoppingCart,
  },
  {
    href: "/admin/audit-trail",
    label: "Audit Trail",
    icon: History,
  },
  {
    href: "/admin/reports",
    label: "Reports",
    icon: Download,
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
  },
];

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading, isAdmin, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Auth guard: redirect non-admin users
  useEffect(() => {
    if (isLoading) return;
    if (!user) {
      router.replace("/login");
    } else if (!isAdmin) {
      router.replace("/station/verify");
    }
  }, [user, isLoading, isAdmin, router]);

  if (isLoading || !user || !isAdmin) {
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
    <div className="min-h-screen flex bg-muted/30">
      {/* ─── Mobile Sidebar Overlay ─────────────────────────────── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ─── Sidebar ────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-3 px-6 py-5">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Droplets className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Pimisa</h1>
              <p className="text-xs text-muted-foreground">Admin Portal</p>
            </div>
            {/* Mobile close button */}
            <button
              className="ml-auto lg:hidden"
              onClick={() => setSidebarOpen(false)}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <Separator />

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <Separator />

          {/* User Info & Logout */}
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{user.name}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {user.email}
                </p>
              </div>
              <ThemeToggle />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </div>
      </aside>

      {/* ─── Main Content ───────────────────────────────────────── */}
      <main className="flex-1 min-w-0">
        {/* Mobile Header */}
        <header className="lg:hidden sticky top-0 z-30 bg-background border-b px-4 py-3 flex items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <button onClick={() => setSidebarOpen(true)}>
              <Menu className="h-6 w-6" />
            </button>
            <h1 className="font-bold">Pimisa Admin</h1>
          </div>
          <ThemeToggle />
        </header>

        {/* Page Content */}
        <div className="p-4 md:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
