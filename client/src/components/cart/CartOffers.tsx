import { useEffect, useState } from "react";
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
  if (!quote.offers.length) return null;
  const tr = (ar: string, en: string) => (isAr ? ar : en);
  const gift = isAr ? settings.giftTextAr : settings.giftTextEn;
  const unlockedCount = quote.offers.filter((o) => o.unlocked).length;
  const interior = isInteriorZone(region);

  const label = (id: CartOfferId, unlocked: boolean, remaining: number, saving: number): string => {
    if (id === "delivery") {
      if (!unlocked) {
        return region
          ? interior
            ? tr(`أضيفي ${money(remaining)} واحصلي على خصم ${money(settings.interiorDiscount)} على التوصيل`, `Add ${money(remaining)} for ${money(settings.interiorDiscount)} off delivery`)
            : tr(`أضيفي ${money(remaining)} للتوصيل المجاني`, `Add ${money(remaining)} for free delivery`)
          : tr(`أضيفي ${money(remaining)} للتوصيل المجاني للقدس والضفة (خصم ${money(settings.interiorDiscount)} للداخل)`, `Add ${money(remaining)} for free delivery to Jerusalem & the West Bank (${money(settings.interiorDiscount)} off for the Interior)`);
      }
      if (!region) return tr(`توصيل مجاني للقدس والضفة · خصم ${money(settings.interiorDiscount)} للداخل`, `Free delivery to Jerusalem & the West Bank · ${money(settings.interiorDiscount)} off for the Interior`);
      return interior ? tr(`خصم ${money(saving)} على التوصيل`, `${money(saving)} off delivery`) : tr("توصيل مجاني", "Free delivery");
    }
    if (id === "gift") return unlocked ? tr(`${gift} مع طلبك`, `${gift} with your order`) : tr(`أضيفي ${money(remaining)} واحصلي على ${gift}`, `Add ${money(remaining)} to get a ${gift.toLowerCase()}`);
    return unlocked
      ? tr(`خصم ${settings.bundlePercent}% على القطع (${money(saving)})`, `${settings.bundlePercent}% off your pieces (${money(saving)})`)
      : tr(`أضيفي ${remaining === 1 ? "قطعة واحدة" : remaining === 2 ? "قطعتين" : `${remaining} قطع`} ووفّري ${settings.bundlePercent}%`, `Add ${remaining} more ${remaining === 1 ? "piece" : "pieces"} to save ${settings.bundlePercent}%`);
  };
  const Icon = { delivery: Truck, gift: Gift, bundle: Layers } as const;

  return (
    <div className="rounded-2xl bg-blush/60 p-3.5 sm:p-4" data-testid="panel-cart-offers">
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
              <p className={`flex items-center gap-2 text-[13px] font-medium leading-snug ${offer.unlocked ? "text-foreground" : "text-muted-foreground"}`}>
                <OfferIcon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 text-start">{label(offer.id, offer.unlocked, offer.remaining, offer.saving)}</span>
                {applied && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-foreground px-2 py-0.5 text-[10px] font-semibold text-background">
                    <Check className="h-3 w-3" />
                    {tr("مُفعّل", "Applied")}
                  </span>
                )}
                {selectable && !applied && <span className="shrink-0 text-[11px] font-semibold underline underline-offset-2">{tr("اختاري", "Choose")}</span>}
              </p>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-background">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${offer.unlocked ? "bg-foreground" : "bg-foreground/35"}`}
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
              className={`rounded-xl p-2 text-start transition-colors ${applied ? "bg-background shadow-sm" : "hover:bg-background/60"}`}
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
