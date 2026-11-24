import { useEffect, useRef, useState } from "react";
import { Check, Gift, Layers, Truck } from "lucide-react";
import { isInteriorZone, type CartOfferId, type CartOfferQuote, type CartOfferSettings } from "@shared/cartOffers";

/* The cart offers: progress toward each one, and — because an order gets ONE offer —
   a way to pick between the ones already unlocked. Used in the cart and at checkout. */

const STORAGE_KEY = "lucerne-cart-offer";

/** The offer the customer picked, remembered between the cart and the checkout. */
export function useCartOfferChoice(): [string | null, (id: CartOfferId) => void] {
  const [choice, setChoice] = useState<string | null>(() => {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  });
  useEffect(() => {
    try {
      if (choice) localStorage.setItem(STORAGE_KEY, choice);
    } catch {
      /* private mode: the choice simply is not remembered */
    }
  }, [choice]);
  return [choice, setChoice];
}

const money = (n: number) => `₪${Number.isInteger(n) ? n : n.toFixed(2)}`;

export function CartOffers({
  quote,
  settings,
  isAr,
  region,
  onChoose,
}: {
  quote: CartOfferQuote;
  settings: CartOfferSettings;
  isAr: boolean;
  /** Delivery zone, when the customer has picked one. */
  region?: string | null;
  onChoose: (id: CartOfferId) => void;
}) {
  // The offers are always written in Arabic, whichever language the rest of the site is in.
  void isAr;
  const tr = (ar: string, _en: string) => ar;
  const gift = settings.giftTextAr;
  const unlockedCount = quote.offers.filter((o) => o.unlocked).length;
  const interior = isInteriorZone(region);

  const label = (id: CartOfferId, unlocked: boolean, remaining: number, saving: number): string => {
    if (id === "delivery") {
      if (!unlocked) {
        return region
          ? interior
            ? tr(`أضيفي ${money(remaining)} واحصلي على خصم ${money(settings.interiorDiscount)} على التوصيل`, `Add ${money(remaining)} for ${money(settings.interiorDiscount)} off delivery`)
            : tr(`أضيفي ${money(remaining)} للتوصيل المجاني`, `Add ${money(remaining)} for free delivery`)
          : tr(`أضيفي ${money(remaining)} للتوصيل المجاني للقدس والضفة`, "");
      }
      if (!region) return tr("مبروك! توصيلك مجاني للقدس والضفة", "");
      return interior ? tr(`مبروك! حصلتِ على خصم ${money(saving)} على التوصيل`, `${money(saving)} off delivery`) : tr("مبروك! توصيلك مجاني", "Free delivery");
    }
    if (id === "gift") return unlocked ? tr(`${gift} مع طلبك`, `${gift} with your order`) : tr(`أضيفي ${money(remaining)} واحصلي على ${gift}`, `Add ${money(remaining)} to get a ${gift.toLowerCase()}`);
    return unlocked
      ? tr(`خصم ${settings.bundlePercent}% على القطع (${money(saving)})`, `${settings.bundlePercent}% off your pieces (${money(saving)})`)
      : tr(`أضيفي ${remaining === 1 ? "قطعة واحدة" : remaining === 2 ? "قطعتين" : `${remaining} قطع`} ووفّري ${settings.bundlePercent}%`, `Add ${remaining} more ${remaining === 1 ? "piece" : "pieces"} to save ${settings.bundlePercent}%`);
  };
  const Icon = { delivery: Truck, gift: Gift, bundle: Layers } as const;
  // Shown under the delivery offer until a zone is chosen: what the Interior gets.
  const interiorLine = !region ? `ولمنطقة الداخل خصم ${money(settings.interiorDiscount)} من سعر التوصيل` : "";

  // A short burst of confetti the moment an offer is reached (not when the cart simply opens
  // with it already reached), so the customer notices she earned it.
  const reached = quote.offers.filter((o) => o.unlocked).map((o) => o.id).join(",");
  const before = useRef<string | null>(null);
  const [party, setParty] = useState(0);
  useEffect(() => {
    const had = before.current;
    before.current = reached;
    if (had === null) return;
    const gained = reached.split(",").filter((id) => id && !had.split(",").includes(id));
    if (gained.length) setParty((n) => n + 1);
  }, [reached]);
  useEffect(() => {
    if (!party) return;
    const timer = setTimeout(() => setParty(0), 2200);
    return () => clearTimeout(timer);
  }, [party]);

  if (!quote.offers.length) return null;

  return (
    <div className={`relative rounded-3xl bg-secondary p-3.5 sm:p-4 ${party ? "offer-won" : ""}`} dir="rtl" lang="ar" data-testid="panel-cart-offers">
      {party > 0 && (
        <div key={party} className="pointer-events-none absolute inset-0 z-10 overflow-visible" aria-hidden="true" data-testid="offer-confetti">
          {Array.from({ length: 22 }).map((_, i) => (
            <span
              key={i}
              className="offer-confetti"
              style={{
                left: `${6 + ((i * 41) % 88)}%`,
                background: ["#F7B7CD", "#FCD9A8", "#C9A6D8", "#A8DCCF", "#FF9FC0", "#B8D8F2"][i % 6],
                animationDelay: `${(i % 7) * 45}ms`,
                ["--dx" as any]: `${((i * 37) % 90) - 45}px`,
                ["--rot" as any]: `${(i * 67) % 360}deg`,
                borderRadius: i % 3 === 0 ? "50%" : "2px",
              }}
            />
          ))}
        </div>
      )}
      {unlockedCount > 1 && (
        <p className="mb-2.5 text-[12px] font-semibold text-foreground/70">{tr("عرض واحد لكل طلب — اختاري عرضك:", "One offer per order — choose yours:")}</p>
      )}
      <div className="grid gap-2.5">
        {quote.offers.map((offer) => {
          const OfferIcon = Icon[offer.id];
          const applied = quote.applied === offer.id;
          const selectable = offer.unlocked && unlockedCount > 1;
          const row = (
            <>
              <p className={`flex w-full items-start gap-2 whitespace-normal text-[13.5px] font-medium leading-snug ${offer.unlocked ? "text-foreground" : "text-foreground/75"}`}>
                <OfferIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 whitespace-normal break-words text-start">
                  <span className={offer.unlocked ? "font-semibold" : ""}>{label(offer.id, offer.unlocked, offer.remaining, offer.saving)}</span>
                  {offer.id === "delivery" && interiorLine && <span className="mt-0.5 block text-[12px] font-normal text-foreground/65">{interiorLine}</span>}
                </span>
                {applied && unlockedCount > 1 && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <Check className="h-3 w-3" />
                    {tr("مُفعّل", "Applied")}
                  </span>
                )}
                {selectable && !applied && <span className="shrink-0 text-[11px] font-semibold text-primary underline underline-offset-2">{tr("اختاري", "Choose")}</span>}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${offer.unlocked ? "bg-primary" : "bg-gradient-to-r from-[#FAD0DE] to-[#F3A3BF] rtl:bg-gradient-to-l"}`}
                  style={{ width: `${Math.max(4, Math.min(100, offer.progress * 100))}%` }}
                />
              </div>
            </>
          );
          return selectable ? (
            <button
              key={offer.id}
              type="button"
              onClick={() => onChoose(offer.id)}
              aria-pressed={applied}
              className={`block h-auto w-full rounded-xl p-2 text-start transition-colors ${applied ? "bg-background shadow-sm" : "hover:bg-background/60"}`}
              data-testid={`button-cart-offer-${offer.id}`}
            >
              {row}
            </button>
          ) : (
            <div key={offer.id} className={applied && unlockedCount > 1 ? "rounded-xl bg-background p-2 shadow-sm" : "px-2"} data-testid={`row-cart-offer-${offer.id}`}>
              {row}
            </div>
          );
        })}
      </div>
    </div>
  );
}
