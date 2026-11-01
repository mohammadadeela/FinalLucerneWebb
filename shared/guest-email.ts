import { z } from "zod";

const guestEmailSchema = z.string().max(160).email();
export function normalizeGuestEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  return guestEmailSchema.safeParse(email).success ? email : null;
}

// Suggestions only: never silently change the address or block a real custom domain.
export function guestEmailSuggestion(value: string): string | null {
  const email = normalizeGuestEmail(value);
  if (!email) return null;
  const [local, domain] = email.split("@");
  const corrections: Record<string, string> = {
    "gmial.com": "gmail.com", "gamil.com": "gmail.com", "gmai.com": "gmail.com",
    "gmail.con": "gmail.com", "gmail.co": "gmail.com", "gmail.comm": "gmail.com",
    "hotmial.com": "hotmail.com", "hotmail.con": "hotmail.com",
    "outlok.com": "outlook.com", "outlook.con": "outlook.com", "yahoo.con": "yahoo.com",
  };
  return corrections[domain] ? `${local}@${corrections[domain]}` : null;
}
