/**
 * Theme Toggle Button
 * Cycles between light, dark, and system themes.
 */

"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Sun, Moon, Monitor } from "lucide-react";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-9 h-9" />;

  const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";

  const Icon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <button
      onClick={() => setTheme(next)}
      className="inline-flex items-center justify-center rounded-lg border border-input bg-background p-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      title={`Switch to ${next} mode`}
    >
      <Icon className="h-5 w-5" />
    </button>
  );
}
