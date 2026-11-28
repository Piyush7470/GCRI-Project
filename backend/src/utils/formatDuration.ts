/**
 * Human-readable expiry text for emails (minutes in → "1 hour", "24 hours", "1 hour and 30 minutes", etc.).
 */
export function formatDurationFromMinutes(totalMinutes: number): string {
  const minutes = Math.max(0, Math.round(totalMinutes));
  if (minutes === 0) return "a short time";
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} day${days === 1 ? "" : "s"}`);
  }
  if (hours > 0) {
    parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
  }
  if (mins > 0 && days === 0) {
    parts.push(`${mins} minute${mins === 1 ? "" : "s"}`);
  }

  if (parts.length === 0) return `${minutes} minutes`;
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts[0]}, ${parts[1]}, and ${parts[2]}`;
}

export function formatDurationFromHours(hours: number): string {
  return formatDurationFromMinutes(Math.round(hours * 60));
}