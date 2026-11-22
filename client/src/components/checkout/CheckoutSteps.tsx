import { Check } from "lucide-react";
import { useLanguage } from "@/i18n";

/** Cart → Checkout → Done. A small progress strip shared by the cart and checkout pages,
 *  so the customer always sees where she is and how little is left. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 }) {
  const { language } = useLanguage();
  const isAr = language === "ar";
  const steps = [
    isAr ? "السلة" : "Cart",
    isAr ? "إتمام الطلب" : "Checkout",
    isAr ? "تم الطلب" : "Done",
  ];
  return (
    <ol className="flex items-center justify-center gap-1.5 sm:gap-3" data-testid="checkout-steps">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <li key={label} className="flex items-center gap-1.5 sm:gap-3">
            <span className={`flex items-center gap-1.5 rounded-full py-1 pe-3 ps-1 text-xs font-semibold transition-colors ${
              active ? "bg-foreground text-background" : done ? "bg-blush text-berry-deep" : "bg-white text-foreground/45"
            }`}>
              <span className={`price-text flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                active ? "bg-background text-foreground" : done ? "bg-berry text-white" : "bg-blush/70 text-foreground/50"
              }`}>
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : n}
              </span>
              {label}
            </span>
            {n < steps.length && <span className={`h-0.5 w-4 rounded-full sm:w-10 ${done ? "bg-berry" : "bg-blush"}`} />}
          </li>
        );
      })}
    </ol>
  );
}
