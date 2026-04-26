import { useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/store/use-cart";
import { useToast } from "@/hooks/use-toast";
import { useLanguage } from "@/i18n";

const REMINDER_INTERVAL_MS = 23 * 60 * 60 * 1000; // 23 hours
const CHECK_INTERVAL_MS = 30 * 60 * 1000;          // re-check every 30 min while tab is open

function storageKey(userId: number) {
  return `cart_reminder_${userId}`;
}

export function useAbandonedCartReminder() {
  const { data: user, isLoading } = useAuth();
  const { items } = useCart();
  const { toast } = useToast();
  const { language } = useLanguage();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (isLoading || !user || items.length === 0) return;
    if (location === "/cart" || location === "/checkout") return;

    const key = storageKey(user.id);
    const stored = localStorage.getItem(key);
    const now = Date.now();

    function showReminder() {
      localStorage.setItem(key, String(Date.now()));
      const isAr = language === "ar";
      toast({
        title: isAr ? "🛍️ سلتك تنتظرك!" : "🛍️ Your cart is waiting!",
        description: isAr
          ? "لديكِ منتجات في سلتك — لا تنسي إتمام طلبك."
          : "You have items in your cart — ready to complete your order?",
        onClick: () => navigate("/cart"),
      });
    }

    // Show immediately if no record yet OR if the interval has elapsed
    const lastShown = stored ? parseInt(stored, 10) : 0;
    if (now - lastShown >= REMINDER_INTERVAL_MS) {
      showReminder();
    }

    // Continue checking on interval
    const interval = setInterval(() => {
      const s = localStorage.getItem(key);
      const t = s ? parseInt(s, 10) : 0;
      if (Date.now() - t >= REMINDER_INTERVAL_MS) {
        showReminder();
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [user?.id, isLoading, items.length, location]);
}
