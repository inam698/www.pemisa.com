/**
 * API Client Utility
 * Centralized fetch wrapper that includes auth token.
 */

"use client";

export async function apiClient<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("pimisa_token")
      : null;

  const headers: HeadersInit = {
    ...(options.headers || {}),
  };

  // Add auth token if available
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  // Add Content-Type for JSON requests (skip for FormData)
  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    // Handle 401 - redirect to login
    if (response.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("pimisa_token");
      localStorage.removeItem("pimisa_user");
      window.location.href = "/login";
    }
    throw new Error(data.error || `Request failed with status ${response.status}`);
  }

  return data;
}
