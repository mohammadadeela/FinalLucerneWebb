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

/* ── Guest verification ─────────────────────────────────────────────────────
   A guest proves they control a phone (SMS code) or an email (emailed code) before ordering.
   The proof is a signed, short-lived token (stateless — it survives a server restart) tied to
   exactly that phone/email, and the order must be placed with the same contact. */

/** Admin switch for the SMS option. Email stays available. On unless set to "false". */
export async function isGuestSmsEnabled(): Promise<boolean> {
  try {
    return (await storage.getSiteSetting("guest_sms_enabled")) !== "false";
  } catch {
    return true;
  }
}

export type GuestChannel = "sms" | "email";
const PROOF_TTL_MS = 30 * 60 * 1000;

/** The one correct form of a local mobile number, or null when it isn't one.
 *  Customers pick +970 or +972 and type their 9 digits, and the two get mixed up all the time:
 *  Palestinian mobiles (059…, 056…) work on +970; Israeli mobiles (050/052/053/054/055/058…) only on +972 —
 *  "+970 52…" is rejected by the SMS provider as "not a valid phone number" (seen in the logs).
 *  Accepted spellings: "+970591234567", "0591234567", "00972521234567", "+970 0591234567", "972-52-123-4567". */
export function canonicalPhone(raw: unknown): string | null {
  let d = typeof raw === "string" ? raw.replace(/\D/g, "") : "";
  if (d.startsWith("00")) d = d.slice(2);
  if (/^(970|972)0\d{9}$/.test(d)) d = d.slice(0, 3) + d.slice(4);   // "+970 0591…" (country code + the local 0)
  if (/^05\d{8}$/.test(d)) d = (/^05[69]/.test(d) ? "970" : "972") + d.slice(1);
  if (/^(970|972)5\d{8}$/.test(d)) {
    if (d.startsWith("970") && !/^9705[69]/.test(d)) d = "972" + d.slice(3);   // Israeli mobile typed with +970
    return `+${d}`;
  }
  return null;
}

/** Canonical form of a contact: "+9705…" for phones, lower-case address for emails; null if unusable. */
export function normalizeGuestTarget(channel: GuestChannel, raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim() : "";
  if (channel === "sms") return canonicalPhone(v);
  const email = cleanGuestEmail(v);
  return email ? email.toLowerCase() : null;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function signGuestProof(channel: GuestChannel, target: string): string {
  const payload = b64url(JSON.stringify({ c: channel, t: target, e: Date.now() + PROOF_TTL_MS }));
  const sig = createHmac("sha256", tokenSecret()).update(`guest-proof:${payload}`).digest("hex").slice(0, 40);
  return `gv1.${payload}.${sig}`;
}

export function verifyGuestProof(proof: unknown): { channel: GuestChannel; target: string } | null {
  if (typeof proof !== "string") return null;
  const parts = proof.split(".");
  if (parts.length !== 3 || parts[0] !== "gv1") return null;
  const expected = createHmac("sha256", tokenSecret()).update(`guest-proof:${parts[1]}`).digest("hex").slice(0, 40);
  const a = Buffer.from(expected), b = Buffer.from(parts[2]);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    if ((data.c !== "sms" && data.c !== "email") || typeof data.t !== "string" || typeof data.e !== "number") return null;
    if (Date.now() > data.e) return null;
    return { channel: data.c, target: data.t };
  } catch {
    return null;
  }
}

/** The verified contact must be the one on the order — otherwise one verified phone could be reused for any order. */
export function guestProofMatchesOrder(
  proof: { channel: GuestChannel; target: string },
  order: { phone?: unknown; guestEmail?: unknown },
): boolean {
  if (proof.channel === "sms") {
    const orderDigits = typeof order.phone === "string" ? order.phone.replace(/\D/g, "") : "";
    const orderPhone = canonicalPhone(order.phone) ?? (orderDigits ? `+${orderDigits}` : "");
    return orderPhone.length > 0 && orderPhone === proof.target;
  }
  const orderEmail = typeof order.guestEmail === "string" ? order.guestEmail.trim().toLowerCase() : "";
  return orderEmail === proof.target;
}
