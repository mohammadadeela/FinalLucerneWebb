import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { storage } from "./storage";
import { db } from "./db";

/* Helpers for guest checkout and online pickup.
   Kept in their own module so the order routes stay readable. */

export const PICKUP_REGION = "pickup";
export const PICKUP_ADDRESS_PLACEHOLDER = "Store pickup — استلام من المتجر";
export const PICKUP_CITY_PLACEHOLDER = "رام الله";

/** Admin switch: may customers order without an account? On unless set to "false". */
export async function isGuestCheckoutEnabled(): Promise<boolean> {
  try {
    return (await storage.getSiteSetting("guest_checkout_enabled")) !== "false";
  } catch {
    return true;
  }
}

/** Admin switch: can customers choose to collect their order from the store? On unless "false". */
export async function isOnlinePickupEnabled(): Promise<boolean> {
  try {
    return (await storage.getSiteSetting("online_pickup_enabled")) !== "false";
  } catch {
    return true;
  }
}

/* ── Signed link for guest orders ───────────────────────────────────────────
   A guest has no account, so there is nothing to prove they own an order. The
   confirmation link carries an HMAC of the order id instead: unguessable, can't
   be forged without the server secret, and lets the guest reopen their pickup
   code later (it is also put in the WhatsApp / email message). */
function tokenSecret(): string {
  return process.env.SESSION_SECRET || "lucerne-dev-secret-change-me";
}

export function guestOrderToken(orderId: number): string {
  return createHmac("sha256", tokenSecret()).update(`guest-order:${orderId}`).digest("hex").slice(0, 32);
}

export function verifyGuestOrderToken(orderId: number, token: unknown): boolean {
  if (typeof token !== "string" || token.length !== 32) return false;
  const expected = Buffer.from(guestOrderToken(orderId));
  const given = Buffer.from(token);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/* ── Pickup codes ───────────────────────────────────────────────────────────
   6 characters, no look-alikes (0/O, 1/I/L) so staff can read them out loud or
   type them without mistakes. */
const PICKUP_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export async function generateUniquePickupCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    let code = "";
    for (let i = 0; i < 6; i++) code += PICKUP_ALPHABET[randomInt(PICKUP_ALPHABET.length)];
    const existing = await db.execute(sql`SELECT 1 FROM orders WHERE pickup_code = ${code} LIMIT 1`);
    const rows = (existing as any).rows ?? existing;
    if (!rows || rows.length === 0) return code;
  }
  // Astronomically unlikely; fall back to a longer code rather than failing the order.
  let code = "";
  for (let i = 0; i < 8; i++) code += PICKUP_ALPHABET[randomInt(PICKUP_ALPHABET.length)];
  return code;
}

/* ── Guest information ──────────────────────────────────────────────────────
   Guests must give the same contact details a signed-in customer would. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function cleanGuestEmail(value: unknown): string | null {
  const v = typeof value === "string" ? value.trim() : "";
  return v && EMAIL_RE.test(v) && v.length <= 160 ? v : null;
}

/** Returns a machine-readable error code, or null when the guest details are acceptable. */
export function validateGuestInfo(
  order: { fullName?: unknown; phone?: unknown; address?: unknown; city?: unknown; guestEmail?: unknown },
  deliveryMethod: "delivery" | "pickup",
): string | null {
  const name = typeof order.fullName === "string" ? order.fullName.trim() : "";
  const phoneDigits = typeof order.phone === "string" ? order.phone.replace(/\D/g, "") : "";
  if (name.length < 2 || name.length > 120) return "guest_name_required";
  if (phoneDigits.length < 9 || phoneDigits.length > 15) return "guest_phone_invalid";
  if (deliveryMethod === "delivery") {
    const address = typeof order.address === "string" ? order.address.trim() : "";
    const city = typeof order.city === "string" ? order.city.trim() : "";
    if (address.length < 3) return "guest_address_required";
    if (city.length < 2) return "guest_city_required";
  }
  const rawEmail = typeof order.guestEmail === "string" ? order.guestEmail.trim() : "";
  if (rawEmail && !cleanGuestEmail(rawEmail)) return "guest_email_invalid";
  return null;
}
