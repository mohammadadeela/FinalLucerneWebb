// ── Cart offers ───────────────────────────────────────────────────────────────
// Three offers a customer can unlock, and ONE of them is applied to an order:
//
//   delivery  spend enough → free delivery to Jerusalem and the West Bank,
//             or a fixed amount off the delivery price for the Interior
//   gift      spend enough → a free gift is packed with the order
//   bundle    buy enough pieces → a percentage off the pieces
//
// The same function runs in the browser (to show the customer what she gets) and on the
// server (which decides the real price), so the two can never disagree.

export type CartOfferId = "delivery" | "gift" | "bundle";

export interface CartOfferSettings {
  deliveryOn: boolean;
  /** Spend (after any discount code) from which the delivery offer unlocks. */
  deliveryOver: number;
  /** Amount taken off the delivery price for the Interior, where delivery is never fully free. */
  interiorDiscount: number;
  giftOn: boolean;
  giftOver: number;
  giftTextAr: string;
  giftTextEn: string;
  bundleOn: boolean;
  bundleQty: number;
  bundlePercent: number;
}

export const DEFAULT_CART_OFFERS: CartOfferSettings = {
  deliveryOn: true,
  deliveryOver: 300,
  interiorDiscount: 30,
  giftOn: true,
  giftOver: 200,
  giftTextAr: "هدية مجانية",
  giftTextEn: "Free gift",
  bundleOn: true,
  bundleQty: 3,
  bundlePercent: 10,
};

/** Reads the offer settings from the site settings (key → value). Missing or broken values fall back to the defaults. */
export function readCartOfferSettings(settings: Record<string, string | null | undefined> | null | undefined): CartOfferSettings {
  const s = settings || {};
  const d = DEFAULT_CART_OFFERS;
  const flag = (key: string, fallback: boolean) => (s[key] == null || s[key] === "" ? fallback : s[key] === "true" || s[key] === "1");
  const number = (key: string, fallback: number, min: number, max: number) => {
    const n = Number(s[key]);
    return s[key] != null && s[key] !== "" && Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const text = (key: string, fallback: string) => (typeof s[key] === "string" && s[key]!.trim() ? s[key]!.trim().slice(0, 60) : fallback);
  return {
    deliveryOn: flag("offer_delivery_on", d.deliveryOn),
    deliveryOver: number("offer_delivery_over", d.deliveryOver, 1, 100000),
    interiorDiscount: number("offer_interior_discount", d.interiorDiscount, 0, 1000),
    giftOn: flag("offer_gift_on", d.giftOn),
    giftOver: number("offer_gift_over", d.giftOver, 1, 100000),
    giftTextAr: text("offer_gift_text_ar", d.giftTextAr),
    giftTextEn: text("offer_gift_text_en", d.giftTextEn),
    bundleOn: flag("offer_bundle_on", d.bundleOn),
    bundleQty: Math.round(number("offer_bundle_qty", d.bundleQty, 2, 50)),
    bundlePercent: number("offer_bundle_percent", d.bundlePercent, 1, 90),
  };
}

/** The Interior pays for delivery even with the offer; every other zone gets it free. */
export function isInteriorZone(region: string | null | undefined): boolean {
  return /^interior$|48|inside|الداخل/i.test(String(region || ""));
}

export interface CartOfferInput {
  /** Value of the pieces after any discount code. */
  spend: number;
  /** Number of pieces in the cart. */
  itemCount: number;
  /** Delivery zone id, or empty while the customer has not picked one. */
  region?: string | null;
  /** Normal delivery price for that zone (0 when unknown). */
  shipping: number;
  /** A pickup order has no delivery to discount. */
  pickup?: boolean;
  /** The offer the customer picked, if she picked one. */
  chosen?: string | null;
}

export interface CartOfferState {
  id: CartOfferId;
  unlocked: boolean;
  /** 0..1 toward unlocking. */
  progress: number;
  /** Money still to spend (delivery, gift) or pieces still to add (bundle). */
  remaining: number;
  /** What it takes off the order in money (0 for the gift). */
  saving: number;
}

export interface CartOfferQuote {
  offers: CartOfferState[];
  /** The one offer applied to this order, or null. */
  applied: CartOfferId | null;
  shippingDiscount: number;
  bundleDiscount: number;
  gift: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function quoteCartOffers(settings: CartOfferSettings, input: CartOfferInput): CartOfferQuote {
  const spend = Math.max(0, Number(input.spend) || 0);
  const count = Math.max(0, Math.floor(Number(input.itemCount) || 0));
  const shipping = input.pickup ? 0 : Math.max(0, Number(input.shipping) || 0);
  const offers: CartOfferState[] = [];

  if (settings.deliveryOn && !input.pickup) {
    const unlocked = count > 0 && spend >= settings.deliveryOver;
    const saving = !unlocked ? 0 : isInteriorZone(input.region) ? Math.min(settings.interiorDiscount, shipping) : shipping;
    offers.push({ id: "delivery", unlocked, progress: Math.min(1, spend / settings.deliveryOver), remaining: round2(Math.max(0, settings.deliveryOver - spend)), saving: round2(saving) });
  }
  if (settings.giftOn) {
    const unlocked = count > 0 && spend >= settings.giftOver;
    offers.push({ id: "gift", unlocked, progress: Math.min(1, spend / settings.giftOver), remaining: round2(Math.max(0, settings.giftOver - spend)), saving: 0 });
  }
  if (settings.bundleOn) {
    const unlocked = count >= settings.bundleQty;
    offers.push({ id: "bundle", unlocked, progress: Math.min(1, count / settings.bundleQty), remaining: Math.max(0, settings.bundleQty - count), saving: unlocked ? round2(spend * (settings.bundlePercent / 100)) : 0 });
  }

  // One offer only. The customer's own pick wins when it is unlocked; otherwise she gets the
  // one that saves her the most money, and the gift when no money offer is unlocked.
  const unlocked = offers.filter((o) => o.unlocked);
  const picked = unlocked.find((o) => o.id === input.chosen);
  const best = [...unlocked].sort((a, b) => b.saving - a.saving)[0];
  const applied = picked || best || null;

  return {
    offers,
    applied: applied ? applied.id : null,
    shippingDiscount: applied?.id === "delivery" ? applied.saving : 0,
    bundleDiscount: applied?.id === "bundle" ? applied.saving : 0,
    gift: applied?.id === "gift",
  };
}
