/**
 * Canonical public frontend origin for shareable links (invites, etc.).
 * Set NEXT_PUBLIC_APP_URL in .env.local / Vercel — must match backend CLIENT_BASE_URL for emails.
 */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  if (typeof window !== "undefined") return window.location.origin;
  return "http://localhost:3000";
}