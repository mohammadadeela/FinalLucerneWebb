import { useMemo } from "react";
import { motion, useReducedMotion, type Transition } from "framer-motion";
import { Check, ClipboardCheck, Clock, Home, PackageCheck, PackageOpen, ShoppingBag, Store, Truck, XCircle } from "lucide-react";
import { useLanguage } from "@/i18n";

/* The animated order-progress tracker. One component, used both on the "thank you" page right after ordering and
   in the order details window of the customer's account, so the two always look and behave the same:
   the line fills with green, finished steps get a check, and the NEXT step pulses in amber. */

/** The store is closed on Fridays (open Saturday–Thursday), so deliveries skip Fridays. */
export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 5) left--;
  }
  return d;
}

/* the small motion each icon makes while the order is at (or heading to) that step */
const ICON_MOTION: Record<string, { animate: Record<string, number[]>; transition: Transition }> = {
  pop:    { animate: { scale: [1, 1.18, 1] }, transition: { duration: 1.6, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" } },
  wiggle: { animate: { rotate: [0, -12, 12, -8, 8, 0], y: [0, -1, 0, -1, 0, 0] }, transition: { duration: 1.1, repeat: Infinity, repeatDelay: 0.9, ease: "easeInOut" } },
  drive:  { animate: { x: [0, 2.5, 0, -1.5, 0], y: [0, -1, 0, -1, 0] }, transition: { duration: 0.9, repeat: Infinity, ease: "easeInOut" } },
  bounce: { animate: { y: [0, -4, 0], scale: [1, 1.08, 1] }, transition: { duration: 1.0, repeat: Infinity, repeatDelay: 0.8, ease: "easeOut" } },
  swing:  { animate: { rotate: [0, 10, -10, 6, -6, 0] }, transition: { duration: 1.4, repeat: Infinity, repeatDelay: 1.0, ease: "easeInOut" } },
};

type TrackedOrder = { status?: string | null; deliveryMethod?: string | null; createdAt?: string | Date | null };

export default function OrderTracker({ order }: { order: TrackedOrder }) {
  const { language } = useLanguage();
  const reduce = useReducedMotion();
  const ar = language === "ar";
  const locale = ar ? "ar-u-nu-latn" : "en-GB";
  const status = order.status || "Pending";
  const isPickup = order.deliveryMethod === "pickup";
  const cancelled = status === "Cancelled";

  // Every step has its own icon (an open box for "preparing", a home for "delivered") and its own little motion,
  // which plays on the step the order is at and on the step that is coming next.
  const steps = useMemo(() => isPickup
    ? [
        { ar: "تم استلام الطلب", en: "Order received", icon: ClipboardCheck, motion: "pop" },
        { ar: "قيد التجهيز", en: "Preparing", icon: PackageOpen, motion: "wiggle" },
        { ar: "جاهز للاستلام", en: "Ready for pickup", icon: Store, motion: "bounce" },
        { ar: "تم الاستلام", en: "Collected", icon: ShoppingBag, motion: "swing" },
      ]
    : [
        { ar: "تم استلام الطلب", en: "Order received", icon: ClipboardCheck, motion: "pop" },
        { ar: "قيد التجهيز", en: "Preparing", icon: PackageOpen, motion: "wiggle" },
        { ar: "في الطريق إليك", en: "On the way", icon: Truck, motion: "drive" },
        { ar: "تم التسليم", en: "Delivered", icon: Home, motion: "bounce" },
      ], [isPickup]);
  const reached = status === "Delivered" ? 3 : status === "OnTheWay" || status === "ReadyForPickup" ? 2 : 0;

  if (cancelled) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200 dark:bg-red-950/30 dark:border-red-900" role="status" data-testid="tracker-cancelled">
        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
        <p className="text-sm font-semibold text-red-700 dark:text-red-300">{ar ? "تم إلغاء هذا الطلب" : "This order was cancelled"}</p>
      </div>
    );
  }

  // The line under the steps says what matters for THIS status (not always a delivery estimate).
  const placedAt = order.createdAt ? new Date(order.createdAt) : new Date();
  const eta = !isPickup ? addBusinessDays(placedAt, 2) : null;
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const etaPassed = !!eta && eta < startOfToday;
  const fmt = (d: Date) => d.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long" });
  let footer: { icon: typeof Clock; tone: string; text: string };
  if (status === "Delivered") {
    footer = isPickup
      ? { icon: PackageCheck, tone: "text-emerald-600", text: ar ? "تم استلام طلبك، شكراً لك" : "Collected, thank you" }
      : { icon: PackageCheck, tone: "text-emerald-600", text: ar ? "تم تسليم طلبك" : "Your order was delivered" };
  } else if (isPickup) {
    footer = status === "ReadyForPickup"
      ? { icon: Store, tone: "text-violet-600", text: ar ? "طلبك جاهز للاستلام من المتجر" : "Your order is ready to collect" }
      : { icon: Store, tone: "text-violet-600", text: ar ? "سنخبرك فور جهوزية طلبك للاستلام" : "We'll tell you the moment it's ready to collect" };
  } else {
    footer = { icon: Clock, tone: "text-emerald-600", text: eta && !etaPassed
      ? (ar ? `التوصيل المتوقع: ${fmt(eta)}` : `Estimated delivery: ${fmt(eta)}`)
      : (ar ? "سيصلك طلبك قريباً" : "Arriving soon") };
  }
  const FooterIcon = footer.icon;

  return (
    <div data-testid="order-progress">
      <ol className="relative flex items-start justify-between">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i <= reached;
          const inProgress = !done && i === reached + 1 && reached < 3;
          return (
            <li key={i} className="relative flex-1 flex flex-col items-center text-center" data-testid={`tracker-step-${i}`} data-state={done ? "done" : inProgress ? "active" : "todo"}>
              {i < steps.length - 1 && (
                <span className="absolute top-5 start-1/2 w-full h-0.5 bg-border" aria-hidden>
                  <motion.span
                    className="absolute inset-y-0 start-0 bg-emerald-500"
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width: i < reached ? "100%" : "0%" }}
                    transition={{ delay: 0.6 + i * 0.2, duration: 0.6 }}
                  />
                </span>
              )}
              <span className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors ${
                done ? "bg-emerald-500 border-emerald-500 text-white" : inProgress ? "bg-background border-amber-400 text-amber-600" : "bg-background border-border text-muted-foreground"
              }`}>
                {inProgress && !reduce && <span className="absolute inset-0 rounded-full border-2 border-amber-400 animate-ping opacity-60" aria-hidden />}
                {done && i < reached ? <Check className="w-4 h-4" /> : (
                  <motion.span className="flex" style={{ originX: 0.5, originY: 1 }}
                    animate={!reduce && (done || inProgress) ? ICON_MOTION[s.motion].animate : undefined}
                    transition={ICON_MOTION[s.motion].transition}>
                    <Icon className="w-4 h-4" />
                  </motion.span>
                )}
              </span>
              <span className={`mt-2 text-[10px] sm:text-xs font-semibold leading-tight px-0.5 ${done ? "text-emerald-700 dark:text-emerald-400" : inProgress ? "text-amber-700" : "text-muted-foreground"}`}>
                {ar ? s.ar : s.en}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex items-center justify-center gap-2 rounded-xl bg-muted/60 px-4 py-2.5 text-xs sm:text-sm" data-testid="text-eta">
        <FooterIcon className={`w-4 h-4 shrink-0 ${footer.tone}`} />
        <span className="font-semibold">{footer.text}</span>
      </div>
    </div>
  );
}
