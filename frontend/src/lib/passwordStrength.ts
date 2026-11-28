export type PasswordStrengthLabel = "empty" | "weak" | "okay" | "strong";

export function getPasswordStrength(password: string): PasswordStrengthLabel {
  const value = password.trim();
  if (!value) return "empty";
  if (value.length < 8) return "weak";

  let score = 0;
  if (value.length >= 10) score++;
  if (/[a-z]/.test(value)) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;

  if (score >= 4) return "strong";
  if (score >= 2) return "okay";
  return "weak";
}

export const strengthDisplay: Record<
  PasswordStrengthLabel,
  { label: string; barClass: string; textClass: string }
> = {
  empty: { label: "", barClass: "bg-slate-200", textClass: "text-slate-400" },
  weak: { label: "Weak", barClass: "bg-rose-500", textClass: "text-rose-600" },
  okay: { label: "Okay", barClass: "bg-amber-500", textClass: "text-amber-700" },
  strong: { label: "Strong", barClass: "bg-emerald-500", textClass: "text-emerald-700" },
};

export function strengthBarWidth(strength: PasswordStrengthLabel): string {
  switch (strength) {
    case "weak":
      return "w-1/3";
    case "okay":
      return "w-2/3";
    case "strong":
      return "w-full";
    default:
      return "w-0";
  }
}

export const PASSWORD_REQUIREMENTS = [
  "At least 8 characters",
  "Mix of upper- and lowercase letters",
  "At least one number",
  "At least one symbol (recommended for Strong)",
] as const;

/** Actionable hints for the current password (empty when strong or empty). */
export function getPasswordSuggestions(password: string): string[] {
  const value = password.trim();
  if (!value) return [];
  if (getPasswordStrength(value) === "strong") return [];

  const hints: string[] = [];
  if (value.length < 8) hints.push("Use at least 8 characters");
  if (!/[a-z]/.test(value)) hints.push("Add a lowercase letter");
  if (!/[A-Z]/.test(value)) hints.push("Add an uppercase letter");
  if (!/\d/.test(value)) hints.push("Add a number");
  if (!/[^a-zA-Z0-9]/.test(value)) hints.push("Add a symbol (e.g. ! @ #)");
  if (hints.length === 0 && getPasswordStrength(value) !== "strong") {
    hints.push("Use a longer passphrase with mixed character types");
  }
  return hints;
}

export function isPasswordAcceptable(password: string): boolean {
  const value = password.trim();
  if (value.length < 8) return false;
  return getPasswordStrength(value) !== "weak";
}