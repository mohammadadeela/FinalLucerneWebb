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

  // It opens from the side the bag icon is on: the left in Arabic, the right in English.
  const from = isAr ? "-100%" : "100%";

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
            className={`absolute top-0 flex h-full w-[86vw] max-w-[420px] flex-col overflow-hidden bg-background shadow-2xl ${isAr ? "left-0 rounded-e-[1.75rem]" : "right-0 rounded-s-[1.75rem]"}`}
            initial={{ x: from }}
            animate={{ x: 0 }}
            exit={{ x: from }}
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            data-testid="drawer-cart"
          >
            <header className="flex h-[60px] shrink-0 items-center justify-between gap-3 border-b border-border px-4 sm:px-5">
              <div className="flex shrink-0 items-end gap-2" dir="ltr">
                <span className="display-latin keep-tracking text-[1.3rem] font-medium leading-none" style={{ ["--tracking" as any]: "0.12em" }}>LUCERNE</span>
                <BrandButterfly className="-mb-0.5 h-6 w-auto" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-flex h-7 items-center gap-1 whitespace-nowrap rounded-full bg-secondary px-2.5 text-[12.5px] font-semibold text-foreground/80" data-testid="text-drawer-count">
                  <span className="hidden min-[400px]:inline">{t.cart.title}</span>
                  <span className="min-[400px]:hidden">{isAr ? "السلة" : "Cart"}</span>
                  {count > 0 && <span className="ltr-num">· {count}</span>}
                </span>
                <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-blush" aria-label={isAr ? "إغلاق" : "Close"} data-testid="button-cart-drawer-close">
                  <X className="h-5 w-5" />
                </button>
              </div>
            </header>
            <CartContents mode="drawer" onNavigate={() => setOpen(false)} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
