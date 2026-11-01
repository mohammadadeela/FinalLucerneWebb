import { useEffect, useMemo, useState } from "react";
import { useRoute, Link } from "wouter";
import { motion, useReducedMotion } from "framer-motion";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useOrder } from "@/hooks/use-orders";
import { useLanguage } from "@/i18n";
import { JADE, ROSE, SealShape, SealTick } from "@/components/ui/success-seal";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import {
  Check, Copy, Package, PackageCheck, ShoppingBag, Store, Truck, ClipboardCheck, UserRound, Gift,
  MessageCircle, ShieldCheck, Shirt, MapPin, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getOrderItemImage } from "@/lib/utils";
import OrderTracker from "@/components/orders/OrderTracker";
import { clearGuestCheckoutMemory } from "@/lib/guest-checkout-memory";

/* The page a customer lands on after ordering. It should feel like a big shopping app: a clear celebration,
   a receipt they can screenshot, where their order is right now, when to expect it, and what happens next. */

const CONFETTI_COLORS = ["#e0587c", "#f0c987", "#7bd0c0", "#c9a6d8", "#1a1a1a", "#f4a9a0"];

function Confetti() {
  const reduce = useReducedMotion();
  if (reduce) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] overflow-hidden" aria-hidden="true" data-testid="confetti">
      <style>{`@keyframes cf-fall{0%{transform:translate3d(0,-30px,0) rotate(0);opacity:0}10%{opacity:1}100%{transform:translate3d(var(--dx),420px,0) rotate(var(--rot));opacity:0}}`}</style>
      {Array.from({ length: 38 }).map((_, i) => (
        <span
          key={i}
          className="absolute top-0 block rounded-[2px]"
          style={{
            left: `${(i * 29 + 5) % 100}%`,
            width: 6 + (i % 3) * 3,
            height: 9 + (i % 4) * 2,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            ["--dx" as any]: `${((i * 17) % 90) - 45}px`,
            ["--rot" as any]: `${360 + ((i * 53) % 540)}deg`,
            animation: `cf-fall ${2.4 + (i % 5) * 0.35}s ease-out ${(i % 9) * 0.07}s 1 both`,
          }}
        />
      ))}
    </div>
  );
}

/* The success seal: the checkout scene glides its rose seal into exactly this spot, so here it is already in place
   and simply turns jade green as a ring traces around it, with a small burst of brand-coloured sparks. */
const SPARKS = ["#e0587c", "#f0c987", "#3ee0a0", "#c9a6d8", "#0ea371", "#f4a9a0", "#e0587c", "#f0c987", "#3ee0a0", "#0ea371"];

function AnimatedCheck() {
  const reduce = useReducedMotion();
  return (
    <div className="relative mx-auto w-28 h-28" data-testid="success-check">
      <motion.span className="absolute inset-2 rounded-full" aria-hidden initial={{ boxShadow: "0 18px 40px -14px rgba(224,88,124,0.55)" }} animate={{ boxShadow: "0 18px 40px -14px rgba(14,163,113,0.55)" }} transition={{ delay: 0.55, duration: 0.6 }} />
      {/* ripples, after the colour has turned */}
      {!reduce && [0, 1].map((i) => (
        <motion.span key={i} className="absolute inset-0 rounded-full border-2" style={{ borderColor: JADE[0] }} aria-hidden
          initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: [0.9, 1.9], opacity: [0.55, 0] }} transition={{ delay: 0.85 + i * 0.3, duration: 1.1, ease: "easeOut" }} />
      ))}
      {/* a thin ring traces around the seal, rose first, then settles green and slowly turns */}
      <svg viewBox="0 0 120 120" className="absolute -inset-2 w-[calc(100%+1rem)] h-[calc(100%+1rem)] -rotate-90" aria-hidden>
        <motion.circle cx="60" cy="60" r="56" fill="none" stroke={ROSE[0]} strokeWidth="2.5" strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0, opacity: 1 }} animate={{ pathLength: 1, opacity: 0 }} transition={{ pathLength: { delay: 0.1, duration: 0.6, ease: "easeInOut" }, opacity: { delay: 0.75, duration: 0.4 } }} />
        <motion.circle cx="60" cy="60" r="56" fill="none" stroke={JADE[0]} strokeWidth="2.5" strokeLinecap="round" strokeDasharray="4 6"
          initial={reduce ? false : { pathLength: 0, opacity: 0, rotate: 0 }} animate={reduce ? { opacity: 0.7 } : { pathLength: 1, opacity: 0.7, rotate: 360 }}
          transition={{ pathLength: { delay: 0.7, duration: 0.5 }, opacity: { delay: 0.7, duration: 0.3 }, rotate: { duration: 14, repeat: Infinity, ease: "linear" } }} style={{ originX: 0.5, originY: 0.5 }} />
      </svg>
      {/* the seal: rose underneath, jade fades in over it */}
      <div className="absolute inset-0">
        <SealShape id="confirm-seal-rose" colors={ROSE} className="absolute inset-0 w-full h-full" />
        <motion.div className="absolute inset-0" initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.5 }}>
          <SealShape id="confirm-seal-jade" colors={JADE} className="absolute inset-0 w-full h-full" />
        </motion.div>
        <motion.span className="absolute -inset-1 rounded-full" aria-hidden initial={{ opacity: 0 }} animate={reduce ? undefined : { opacity: [0, 0.35, 0] }} transition={{ delay: 1.2, duration: 2.2, repeat: Infinity, repeatDelay: 1 }}
          style={{ background: "radial-gradient(circle, rgba(255,255,255,.55) 0%, rgba(255,255,255,0) 70%)" }} />
        <SealTick className="absolute inset-0 w-full h-full" draw={false} />
      </div>
      {/* sparks burst out as the colour turns */}
      {!reduce && SPARKS.map((c, i) => {
        const a = (i / SPARKS.length) * Math.PI * 2 - Math.PI / 2; const d = 62 + (i % 2) * 14;
        return (
          <motion.span key={i} className={`absolute left-1/2 top-1/2 block ${i % 3 === 0 ? "w-1.5 h-3 rounded-[2px]" : "w-2 h-2 rounded-full"}`} style={{ background: c, marginLeft: -4, marginTop: -4 }} aria-hidden
            initial={{ x: 0, y: 0, opacity: 0, scale: 0.4 }} animate={{ x: Math.cos(a) * d, y: Math.sin(a) * d, opacity: [0, 1, 0], scale: [0.4, 1, 0.6], rotate: 160 + i * 25 }} transition={{ delay: 0.65, duration: 0.85, ease: "easeOut" }} />
        );
      })}
    </div>
  );
}

const fadeUp = (i: number, reduce: boolean | null) => ({
  initial: reduce ? false : { opacity: 0, y: 18 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.15 + i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] as const },
});

export default function OrderConfirmation() {
  const [, params] = useRoute("/order-confirmation/:id");
  const orderId = params?.id ? Number(params.id) : 0;
  // A guest (no account) opens this page from a signed link: /order-confirmation/12?t=<token>
  const guestToken = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("t") : null;
  const { data: orderDetails, isLoading } = useOrder(orderId, guestToken);
  const { t, language } = useLanguage();
  const { data: siteSettings } = useSiteSettings();
  const reduce = useReducedMotion();
  const ar = language === "ar";
  const [copied, setCopied] = useState(false);

  // The order is placed: forget the guest's checkout draft, code and verification (also covers returning from online payment)
  useEffect(() => { clearGuestCheckoutMemory(); }, []);
  // Always show the confirmation page from the top (checkout leaves the page scrolled down)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, []);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const order = orderDetails?.order as any;
  const isPickup = order?.deliveryMethod === "pickup";
  const isGuestOrder = !!order && order.userId == null;
  const status: string = order?.status || "Pending";
  const guestPoints = isGuestOrder && siteSettings?.loyalty_points_enabled !== "false"
    ? Math.floor(Math.max(0, parseFloat(order.totalAmount) - parseFloat(order.shippingCost || "0")) / 2)
    : 0;
  const orderRef = order ? `#${String(order.id).padStart(6, "0")}` : "";
  const firstName = (order?.fullName || "").trim().split(/\s+/)[0] || "";
  const locale = ar ? "ar-u-nu-latn" : "en-GB";
  const placedAt = order?.createdAt ? new Date(order.createdAt) : new Date();

  const statusLabel = (t.orderStatus as any)?.[status] || status;
  const statusTone: Record<string, string> = {
    Pending: "bg-amber-100 text-amber-800",
    ReadyForPickup: "bg-violet-100 text-violet-800",
    OnTheWay: "bg-blue-100 text-blue-800",
    Delivered: "bg-green-100 text-green-800",
    Cancelled: "bg-red-100 text-red-800",
  };

  const copyRef = async () => {
    try {
      await navigator.clipboard.writeText(orderRef);
      setCopied(true);
    } catch {
      /* clipboard may be blocked — the number is also selectable on screen */
    }
  };

  const payLabel = !order ? "" : /cash/i.test(order.paymentMethod)
    ? (ar ? "الدفع عند الاستلام" : "Cash on delivery")
    : /card|lahza/i.test(order.paymentMethod)
      ? (ar ? "بطاقة · دُفع أونلاين" : "Card · paid online")
      : order.paymentMethod;

  const phone = (getSetting(siteSettings, "contact_phone") || "970597314193").replace(/\D/g, "");
  const helpHref = `https://wa.me/${phone}?text=${encodeURIComponent(ar ? `مرحباً، بخصوص طلبي ${orderRef}` : `Hi, about my order ${orderRef}`)}`;

  const nextSteps = isPickup
    ? [
        { icon: Package, ar: "نجهّز طلبك", en: "We prepare your order", dAr: "نراجع قطعك ونغلّفها بعناية.", dEn: "We check your pieces and wrap them with care." },
        { icon: MessageCircle, ar: "نخبرك عندما يجهز", en: "We tell you when it's ready", dAr: "ستصلك رسالة على واتساب برمز الاستلام.", dEn: "You'll get a WhatsApp message with your pickup code." },
        { icon: Store, ar: "تمرّين على المتجر", en: "Pop in to collect", dAr: "اعرضي رمز الاستلام على الكاشير.", dEn: "Show your pickup code at the counter." },
      ]
    : [
        { icon: Package, ar: "نجهّز طلبك", en: "We prepare your order", dAr: "نراجع قطعك ونغلّفها بعناية.", dEn: "We check your pieces and wrap them with care." },
        { icon: Truck, ar: "نرسله إلى بابك", en: "It's on its way", dAr: "التوصيل خلال يومين من أيام العمل.", dEn: "Delivery within 2 business days." },
        { icon: Shirt, ar: "استمتعي بإطلالتك", en: "Enjoy your look", dAr: "ونحب أن نسمع رأيك!", dEn: "We'd love to hear what you think!" },
      ];

  // Open at the very top, and stay there while the page settles (the order loads, iOS finishes its toolbar dance),
  // so the seal is never hidden under the navbar. Only for the first moments after opening: never fights the user.
  const openedAt = useMemo(() => Date.now(), []);
  useEffect(() => {
    const toTop = () => { if (Date.now() - openedAt < 1500) window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior }); };
    toTop();
    const timers = [40, 160, 400, 800].map((ms) => window.setTimeout(toTop, ms));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [openedAt, order?.id]);

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="relative flex-1 overflow-hidden bg-gradient-to-b from-emerald-50/60 via-background to-background dark:from-emerald-950/20">
        {order && <Confetti />}
        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 py-10 sm:py-16 w-full">
          {isLoading ? (
            <div className="space-y-6">
              {/* the seal is already here while the order loads: the checkout scene just glided its seal to this exact spot */}
              <div className="relative mx-auto w-28 h-28" aria-hidden><SealShape id="loading-seal" colors={ROSE} className="absolute inset-0 w-full h-full" /><SealTick className="absolute inset-0 w-full h-full" draw={false} /></div>
              <div className="animate-pulse space-y-6">
              <div className="mx-auto h-8 w-64 bg-muted rounded" />
              <div className="mx-auto h-4 w-80 bg-muted rounded" />
              <div className="bg-muted rounded-2xl h-56 w-full" />
              <div className="bg-muted rounded-2xl h-32 w-full" />
              </div>
            </div>
          ) : orderDetails && order ? (
            <div className="space-y-8">
              {/* Celebration */}
              <div className="text-center">
                <AnimatedCheck />
                <motion.div {...fadeUp(0, reduce)}>
                <h1 className="font-display text-3xl sm:text-5xl mt-6 mb-3" data-testid="text-confirmation-title">{t.orderConfirmation.title}</h1>
                {firstName && (
                  <p className="text-base sm:text-lg font-semibold" data-testid="text-confirmation-thanks">
                    {ar ? `شكراً ${firstName}! طلبك وصلنا وبدأنا نجهّزه ❤️` : `Thank you, ${firstName}! We've got your order and we're on it ❤️`}
                  </p>
                )}
                <p className="text-muted-foreground mt-2 text-sm" data-testid="text-confirmation-notice">
                  {isGuestOrder && !order.guestEmail
                    ? (ar ? "احتفظي برقم طلبك ورابط هذه الصفحة لمتابعة طلبك" : "Keep your order number and this page's link to follow your order")
                    : t.orderConfirmation.emailSent}
                </p>
                </motion.div>
              </div>

              {/* Tracker */}
              <motion.section {...fadeUp(1, reduce)} className="rounded-2xl border border-border bg-card p-5 sm:p-6 shadow-sm" data-testid="order-tracker" aria-label={ar ? "حالة الطلب" : "Order progress"}>
                <OrderTracker order={order} />
              </motion.section>

              {/* Pickup code */}
              {isPickup && (
                <motion.div {...fadeUp(2, reduce)} className="rounded-2xl border-2 border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-950/30 p-6 text-center" data-testid="card-pickup-code">
                  <div className="flex items-center justify-center gap-2 mb-2 text-violet-800 dark:text-violet-300">
                    <Store className="w-5 h-5" />
                    <p className="text-sm font-bold">{ar ? "استلام من المتجر" : "Store pickup"}</p>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">{ar ? "اعرضي هذا الرمز عند الاستلام" : "Show this code when you collect your order"}</p>
                  <p className="font-mono text-4xl sm:text-5xl font-extrabold tracking-[0.35em] ps-[0.35em] select-all ltr-num" dir="ltr" data-testid="text-pickup-code">{order.pickupCode}</p>
                  <div className="mt-4 flex items-start justify-center gap-1.5 text-sm">
                    <MapPin className="w-4 h-4 mt-0.5 shrink-0 text-violet-600" />
                    <span>{ar ? getSetting(siteSettings, "location_address_ar") : getSetting(siteSettings, "location_address_en")}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{ar ? getSetting(siteSettings, "location_hours_ar") : getSetting(siteSettings, "location_hours_en")}</p>
                </motion.div>
              )}

              {/* Receipt ticket */}
              <motion.section {...fadeUp(3, reduce)} className="relative rounded-2xl bg-card border border-border shadow-md" data-testid="order-ticket">
                {/* ticket notches */}
                <span className="absolute -start-3 top-[118px] w-6 h-6 rounded-full bg-background border border-border" aria-hidden />
                <span className="absolute -end-3 top-[118px] w-6 h-6 rounded-full bg-background border border-border" aria-hidden />
                <div className="p-6 sm:p-8 pb-6">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] font-bold tracking-[0.35em] text-muted-foreground">LUCERNE BOUTIQUE</p>
                    <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold ${statusTone[status] || "bg-primary/10 text-primary"}`} data-testid="text-order-status">{statusLabel}</span>
                  </div>
                  <div className="mt-4 flex items-end justify-between gap-3">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">{t.orderConfirmation.orderNumber}</p>
                      <p className="text-3xl font-display font-bold select-all" data-testid="text-order-number"><span className="ltr-num">{orderRef}</span></p>
                    </div>
                    <button
                      type="button"
                      onClick={copyRef}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-semibold hover:bg-muted transition-colors"
                      data-testid="button-copy-order"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? (ar ? "تم النسخ" : "Copied") : (ar ? "نسخ الرقم" : "Copy")}
                    </button>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground ltr-num">{placedAt.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</p>
                </div>

                <div className="border-t-2 border-dashed border-border mx-4" aria-hidden />

                <div className="p-6 sm:p-8 pt-6 space-y-5">
                  <div className="space-y-3">
                    {orderDetails.items.map((item) => (
                      <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          {getOrderItemImage(item.product, item.color) && (
                            <img src={getOrderItemImage(item.product, item.color)} alt="" className="w-11 h-14 object-cover bg-muted rounded-md flex-shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-medium truncate">{item.product?.name}</p>
                            <p className="text-xs text-muted-foreground"><span className="ltr-num">{[item.size, item.color].filter(Boolean).join(" · ")} × {item.quantity}</span></p>
                          </div>
                        </div>
                        <span className="font-semibold ltr-num shrink-0">₪{(parseFloat(item.price) * item.quantity).toFixed(2)}</span>
                      </div>
                    ))}
                  </div>

                  {(() => {
                    const total = parseFloat(order.totalAmount);
                    const shipping = parseFloat(order.shippingCost || "0");
                    const discount = parseFloat(order.discountAmount || "0");
                    const credit = parseFloat(order.creditUsed || "0");
                    const subtotal = total - shipping + discount + credit;
                    return (
                      <div className="border-t border-border pt-4 space-y-2 text-sm">
                        <div className="flex justify-between text-muted-foreground"><span>{t.checkout.subtotal}</span><span data-testid="text-order-subtotal" className="ltr-num">₪{subtotal.toFixed(2)}</span></div>
                        {discount > 0 && (
                          <div className="flex justify-between text-rose-600 dark:text-rose-400">
                            <span className="flex items-center gap-1.5">{ar ? "خصم" : "Discount"}{order.discountCode && <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 font-semibold">{order.discountCode}</span>}</span>
                            <span className="font-medium ltr-num" data-testid="text-order-discount">−₪{discount.toFixed(2)}</span>
                          </div>
                        )}
                        {credit > 0 && <div className="flex justify-between text-amber-700 dark:text-amber-400"><span>{ar ? "رصيد مستخدم" : "Credit applied"}</span><span className="font-medium ltr-num" data-testid="text-order-credit-used">−₪{credit.toFixed(2)}</span></div>}
                        <div className="flex justify-between text-muted-foreground">
                          <span>{t.checkout.shipping}</span>
                          <span className="ltr-num">{shipping > 0 ? `₪${shipping.toFixed(2)}` : (ar ? "مجاني" : "Free")}</span>
                        </div>
                        {(discount + credit) > 0 && (
                          <div className="flex justify-between text-emerald-700 dark:text-emerald-400 text-xs pt-1"><span className="font-semibold">{ar ? "إجمالي ما وفّرتيه" : "You saved"}</span><span className="font-bold ltr-num">₪{(discount + credit).toFixed(2)}</span></div>
                        )}
                        <div className="flex justify-between text-xl font-bold pt-3 border-t border-border"><span>{t.checkout.total}</span><span className="ltr-num">₪{total.toFixed(2)}</span></div>
                      </div>
                    );
                  })()}

                  <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                    <div className="rounded-xl bg-muted/60 px-3 py-2.5"><p className="text-muted-foreground mb-0.5">{ar ? "طريقة الدفع" : "Payment"}</p><p className="font-semibold flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />{payLabel}</p></div>
                    <div className="rounded-xl bg-muted/60 px-3 py-2.5"><p className="text-muted-foreground mb-0.5">{ar ? "الاستلام" : "Delivery"}</p><p className="font-semibold flex items-center gap-1.5">{isPickup ? <Store className="w-3.5 h-3.5 text-violet-600 shrink-0" /> : <Truck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}{isPickup ? (ar ? "من المتجر" : "Store pickup") : (ar ? "توصيل إلى بابك" : "Home delivery")}</p></div>
                  </div>
                </div>
              </motion.section>

              {/* Guest sign-in invitation */}
              {isGuestOrder && (
                <motion.div {...fadeUp(4, reduce)} className="rounded-2xl border border-amber-200/80 dark:border-amber-800/60 bg-amber-50/70 dark:bg-amber-950/20 p-5 text-start flex items-start gap-3" data-testid="card-guest-signin">
                  <span className="w-9 h-9 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                    {guestPoints > 0 ? <Gift className="w-4 h-4 text-amber-700 dark:text-amber-400" /> : <UserRound className="w-4 h-4 text-amber-700 dark:text-amber-400" />}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-bold" data-testid="text-guest-points-cta">
                      {guestPoints > 0
                        ? (ar ? `سجّلي الدخول لتكسبي ${guestPoints} نقطة على طلب كهذا في المرة القادمة` : `Sign in next time to earn ${guestPoints} points on an order like this`)
                        : (ar ? "أنشئي حساباً لتتبّع طلباتك وكسب النقاط" : "Create an account to track your orders and earn points")}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">{ar ? "الطلبات كضيف لا تحصل على نقاط. حفظنا رابط هذه الصفحة لتعودي إليها." : "Guest orders don't earn points. Bookmark this page to come back to your order."}</p>
                    <Link href="/auth"><Button size="sm" variant="outline" className="mt-3" data-testid="button-guest-create-account">{ar ? "تسجيل الدخول / إنشاء حساب" : "Sign in / Create account"}</Button></Link>
                  </div>
                </motion.div>
              )}

              {/* What happens next */}
              <motion.section {...fadeUp(5, reduce)} data-testid="next-steps">
                <h2 className="text-sm font-bold tracking-wide mb-3 text-center">{ar ? "ماذا يحدث بعد ذلك؟" : "What happens next?"}</h2>
                <div className="grid sm:grid-cols-3 gap-3">
                  {nextSteps.map((s, i) => {
                    const Icon = s.icon;
                    return (
                      <div key={i} className="rounded-2xl border border-border bg-card p-4 text-center">
                        <span className="mx-auto mb-2 w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center"><Icon className="w-5 h-5" /></span>
                        <p className="text-sm font-bold">{ar ? s.ar : s.en}</p>
                        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{ar ? s.dAr : s.dEn}</p>
                      </div>
                    );
                  })}
                </div>
              </motion.section>

              {/* Actions */}
              <motion.div {...fadeUp(6, reduce)} className="flex flex-col sm:flex-row gap-3 justify-center">
                {!isGuestOrder && (
                  <Link href={`/profile?order=${orderId}`} className="w-full sm:w-auto">
                    <Button className="w-full sm:w-auto rounded-xl text-sm px-8 py-6" data-testid="button-track-order"><Package className="w-4 h-4 me-2" />{t.orderConfirmation.trackOrder}</Button>
                  </Link>
                )}
                <Link href="/shop" className="w-full sm:w-auto">
                  <Button variant={isGuestOrder ? "default" : "outline"} className="w-full sm:w-auto rounded-xl text-sm px-8 py-6" data-testid="button-continue-shopping"><ShoppingBag className="w-4 h-4 me-2" />{t.orderConfirmation.continueShopping}</Button>
                </Link>
                <a href={helpHref} target="_blank" rel="noopener noreferrer" className="w-full sm:w-auto">
                  <Button variant="outline" className="w-full sm:w-auto rounded-xl text-sm px-8 py-6" data-testid="button-order-help"><MessageCircle className="w-4 h-4 me-2" />{ar ? "تحتاجين مساعدة؟" : "Need help?"}</Button>
                </a>
              </motion.div>
            </div>
          ) : (
            <div className="text-center py-20">
              <p className="text-muted-foreground">Order not found</p>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
