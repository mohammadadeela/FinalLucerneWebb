import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/store/use-cart";
import { useLanguage } from "@/i18n";
import { CheckCircle, Store, Gift } from "lucide-react";
import { useSiteSettings } from "@/hooks/use-site-settings";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const { clearCart } = useCart();
  const { t, language } = useLanguage();
  const ar = language === "ar";
  const { data: siteSettings } = useSiteSettings();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [orderId, setOrderId] = useState<number | null>(null);
  // Set for guests (no account): the signed token that lets them reopen this order.
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [placed, setPlaced] = useState<any>(null);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    const sessionId = params.get("session_id");

    if (reference) {
      fetch(`/api/lahza/verify?reference=${encodeURIComponent(reference)}`, {
        credentials: "include",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Payment verification failed");
          const data = await res.json();
          setOrderId(data.order?.id);
          setGuestToken(data.guestToken ?? null);
          setPlaced(data.order ?? null);
          setStatus("success");
          clearCart();
          })
          .catch(() => setStatus("error"));
          } else if (sessionId) {
      fetch(`/api/stripe/checkout-success?session_id=${sessionId}`, {
        credentials: "include",
      })
        .then(async (res) => {
          if (!res.ok) throw new Error("Payment verification failed");
          const data = await res.json();
          setOrderId(data.order?.id);
          setStatus("success");
          clearCart();
        })
        .catch(() => setStatus("error"));
    } else {
      setStatus("error");
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 py-20">
        <div className="text-center max-w-md">
          {status === "loading" && (
            <div className="space-y-6 animate-pulse">
              <div className="w-16 h-16 rounded-full bg-muted mx-auto" />
              <div className="h-6 w-48 bg-muted rounded mx-auto" />
              <div className="h-4 w-64 bg-muted rounded mx-auto" />
            </div>
          )}

          {status === "success" && (
            <div className="space-y-6">
              <CheckCircle className="w-16 h-16 mx-auto text-green-600" />
              <h1 className="font-display text-3xl" data-testid="text-checkout-success">{t.checkout.orderSuccess}</h1>
              <p className="text-muted-foreground">{t.checkout.orderSuccessDesc}</p>
              {orderId && (
              <p className="text-sm text-muted-foreground">
              {t.profile.orderNumber} #{orderId}
              </p>
              )}
              {placed?.deliveryMethod === "pickup" && placed?.pickupCode && (
              <div className="rounded-2xl border-2 border-violet-300 bg-violet-50 dark:bg-violet-950/30 p-5" data-testid="card-pickup-code">
              <div className="flex items-center justify-center gap-2 text-violet-800 dark:text-violet-300 mb-1"><Store className="w-4 h-4" /><p className="text-sm font-bold">{ar ? "رمز الاستلام من المتجر" : "Store pickup code"}</p></div>
              <p className="font-mono text-4xl font-extrabold tracking-[0.35em] ps-[0.35em] select-all ltr-num" dir="ltr" data-testid="text-pickup-code">{placed.pickupCode}</p>
              <p className="text-xs text-muted-foreground mt-2">{ar ? "اعرضيه عند الاستلام. سنخبرك على واتساب عندما يصبح جاهزاً." : "Show it when you collect. We'll message you on WhatsApp when it's ready."}</p>
              </div>
              )}
              {guestToken && siteSettings?.loyalty_points_enabled !== "false" && placed && (() => {
              const pts = Math.floor(Math.max(0, parseFloat(placed.totalAmount) - parseFloat(placed.shippingCost || "0")) / 2);
              return pts > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 dark:bg-amber-950/20 p-4 flex items-center gap-3 text-start" data-testid="card-guest-signin">
              <Gift className="w-5 h-5 text-amber-700 shrink-0" />
              <p className="text-sm font-semibold" data-testid="text-guest-points-cta">{ar ? `سجّلي الدخول في طلبك القادم لتكسبي ${pts} نقطة` : `Sign in on your next order to earn ${pts} points`}</p>
              </div>
              ) : null;
              })()}
              <div className="flex gap-4 justify-center pt-4">
              <Button
              onClick={() => setLocation(
              guestToken && orderId ? `/order-confirmation/${orderId}?t=${guestToken}`
              : orderId ? `/profile?order=${orderId}` : "/profile"
              )}
              className="rounded-md uppercase tracking-widest text-sm"
              data-testid="button-view-orders"
              >
              {guestToken ? (ar ? "عرض الطلب" : "View order") : t.profile.orderHistory}
              </Button>
                <Button
                  variant="outline"
                  onClick={() => setLocation("/shop")}
                  className="rounded-md uppercase tracking-widest text-sm"
                  data-testid="button-continue-shopping"
                >
                  {t.cart.continueShopping}
                </Button>
              </div>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-6">
              <h1 className="font-display text-3xl" data-testid="text-checkout-error">{t.checkout.checkoutFailed}</h1>
              <p className="text-muted-foreground">{t.checkout.paymentError}</p>
              <Button
                onClick={() => setLocation("/checkout")}
                className="rounded-md uppercase tracking-widest text-sm"
                data-testid="button-retry-checkout"
              >
                {t.checkout.tryAgain}
              </Button>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
