/* A guest's checkout survives a page refresh.

   Everything here lives in sessionStorage: it is kept when the page is refreshed, but it disappears when the tab is
   closed, and it is wiped as soon as the order is placed — so nothing lingers on a shared device. Three things are kept:
   - the one-time code the guest already asked for (which phone/email it went to, and when "resend" unlocks), so a
     refresh doesn't force them to ask for a new one (the server allows only 2 per number);
   - the proof that they already verified (valid for 30 minutes on the server), so they don't verify twice;
   - what they typed in the form, because the code step needs the phone/email to pick up where it left off. */

const PENDING_KEY = "lucerne.guestVerify.pending.v1";
const VERIFIED_KEY = "lucerne.guestVerify.verified.v1";
const DRAFT_KEY = "lucerne.guestCheckout.draft.v1";

/** A code stays valid for ~10 minutes on the server; if it has expired the server says so and they can ask again. */
const PENDING_TTL_MS = 15 * 60 * 1000;
/** The server's proof lasts 30 minutes; stop using it a little earlier. */
const VERIFIED_TTL_MS = 25 * 60 * 1000;
const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

export type PendingCode = { channel: "sms" | "email"; target: string; sentAt: number; cooldownEndsAt: number; sendsLeft: number | null; codeLength?: number };
export type VerifiedProof = { proof: string; channel: "sms" | "email"; target: string };
export type GuestDraft = {
  form: { fullName: string; phone: string; phone2: string; address: string; city: string; notes: string };
  phonePrefix: string;
  phone2Prefix: string;
  guestEmail: string;
  shippingRegion: string;
  deliveryMethod: "delivery" | "pickup";
  paymentMethod: "cod" | "card";
};

function read<T>(key: string, ttl: number): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { savedAt: number; data: T };
    if (!parsed || typeof parsed.savedAt !== "number" || Date.now() - parsed.savedAt > ttl) {
      window.sessionStorage.removeItem(key);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}
function write(key: string, data: unknown) {
  try { window.sessionStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* private mode / full: not critical */ }
}
function remove(key: string) {
  try { window.sessionStorage.removeItem(key); } catch { /* ignore */ }
}

export const loadPending = () => read<PendingCode>(PENDING_KEY, PENDING_TTL_MS);
export const savePending = (p: PendingCode) => write(PENDING_KEY, p);
export const clearPending = () => remove(PENDING_KEY);

export const loadVerified = () => read<VerifiedProof>(VERIFIED_KEY, VERIFIED_TTL_MS);
export function saveVerified(v: VerifiedProof | null) { if (v) write(VERIFIED_KEY, v); else remove(VERIFIED_KEY); }

export const loadDraft = () => read<GuestDraft>(DRAFT_KEY, DRAFT_TTL_MS);
export const saveDraft = (d: GuestDraft) => write(DRAFT_KEY, d);

/** Called once the order is placed. */
export function clearGuestCheckoutMemory() {
  remove(PENDING_KEY);
  remove(VERIFIED_KEY);
  remove(DRAFT_KEY);
}
