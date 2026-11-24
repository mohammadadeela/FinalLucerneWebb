import { useEffect } from "react";
import { useLocation } from "wouter";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
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
            className={`absolute top-0 flex h-full w-full max-w-[430px] flex-col bg-background shadow-2xl ${isAr ? "left-0" : "right-0"}`}
            initial={{ x: from }}
            animate={{ x: 0 }}
            exit={{ x: from }}
            transition={{ type: "tween", duration: 0.32, ease: [0.2, 0.8, 0.2, 1] }}
            data-testid="drawer-cart"
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
              <div className="font-display text-xl font-semibold">
                {t.cart.title}
                {count > 0 && <span className="ms-2 font-sans text-[15px] font-medium text-muted-foreground">({count})</span>}
              </div>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-full transition-colors hover:bg-blush" aria-label={isAr ? "إغلاق" : "Close"} data-testid="button-cart-drawer-close">
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
