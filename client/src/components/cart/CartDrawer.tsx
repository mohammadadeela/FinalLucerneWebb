import { useEffect } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { BrandButterfly } from "@/components/ui/BrandButterfly";
import { useCartDrawer } from "@/store/use-cart-drawer";
import { CartContents } from "@/pages/Cart";
import { useCart } from "@/store/use-cart";
import { useLanguage } from "@/i18n";

/* The cart as a panel that slides in from the side when the bag icon is pressed,
   so the customer never leaves the page she is shopping on. */

export function CartDrawer() {
  const open = useCartDrawer((s) => s.open);
  const setOpen = useCartDrawer((s) => s.setOpen);
  const { items } = useCart();
  const { t, language } = useLanguage();
  const [location] = useLocation();
  const isAr = language === "ar";
  const count = items.reduce((n, item) => n + item.quantity, 0);

  // Close when the page changes, lock the page behind it, and close on Escape.
  useEffect(() => setOpen(false), [location, setOpen]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, setOpen]);

  // It always opens from the right, in both languages.
  const from = "100%";

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80]" dir={isAr ? "rtl" : "ltr"}>
          <motion.div
            className="absolute inset-0 bg-black/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setOpen(false)}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label={t.cart.title}
            className={`sima-skin absolute top-0 flex h-full w-[86vw] max-w-[420px] flex-col overflow-hidden bg-background shadow-2xl right-0 rounded-l-[1.75rem]`}
            initial={{ x: from }}
            animate={{ x: 0 }}
            exit={{ x: from }}
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            data-testid="drawer-cart"
          >
            {/* The top of the cart keeps the shop's own look: the Lucerne wordmark on white. */}
            <header className="flex h-[64px] shrink-0 items-center justify-between gap-3 border-b border-black/10 bg-white px-4 text-[#1a1a1a] sm:px-5">
              <div className="flex flex-col items-center leading-none" dir="ltr" aria-label="Lucerne Boutique">
                <span className="flex items-end gap-1.5">
                  <span className="display-latin keep-tracking text-[1.4rem] font-medium leading-none" style={{ ["--tracking" as any]: "0.12em" }}>LUCERNE</span>
                  <BrandButterfly className="-mb-0.5 h-7 w-auto" />
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className="h-px w-4 bg-[#a5375b]/60" />
                  <span className="keep-tracking text-[8.5px] font-medium uppercase text-black/70" style={{ ["--tracking" as any]: "0.42em", fontFamily: "var(--font-sans)" }}>Boutique</span>
                  <span className="h-px w-4 bg-[#a5375b]/60" />
                </span>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-black/5" aria-label={isAr ? "إغلاق" : "Close"} data-testid="button-cart-drawer-close">
                <X className="h-5 w-5" />
              </button>
            </header>
            <CartContents mode="drawer" onNavigate={() => setOpen(false)} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
