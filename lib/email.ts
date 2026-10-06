// Shared email helpers for auth routes + pages.
// Rule: emails are trimmed + lowercased at the boundary (server AND client),
// stored normalized, and compared with exact `eq` — never `ilike` on raw
// input (LIKE wildcards %/_ in user input could match the wrong row).

/** Trim + lowercase. Returns "" for non-strings. */
export function normalizeEmail(email: unknown): string {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

// Practical format check (not full RFC 5322): local@domain.tld, no spaces.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** True for plausible emails up to 254 chars (SMTP limit). */
export function isValidEmail(email: string): boolean {
  return email.length > 0 && email.length <= 254 && EMAIL_RE.test(email);
}

/** Signup/login password floor (matches reset-password route). */
export const MIN_PASSWORD_LENGTH = 8;
