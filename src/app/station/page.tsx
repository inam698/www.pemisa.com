/**
 * Station root page redirects to verify
 */

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function StationPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/station/verify");
  }, [router]);

  return null;
}
