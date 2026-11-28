export function isPasswordAcceptable(password: string): boolean {
  const value = password.trim();
  if (value.length < 8) return false;

  let score = 0;
  if (value.length >= 10) score++;
  if (/[a-z]/.test(value)) score++;
  if (/[A-Z]/.test(value)) score++;
  if (/\d/.test(value)) score++;
  if (/[^a-zA-Z0-9]/.test(value)) score++;

  return score >= 2;
}