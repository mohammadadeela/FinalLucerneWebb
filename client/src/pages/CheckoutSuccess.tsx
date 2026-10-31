import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/store/use-cart";
import { useLanguage } from "@/i18n";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/* Where the online-payment page sends the customer back to. It confirms the payment with the server and then
   moves on to the order confirmation page (the same one cash-on-delivery orders land on). Opening or reloading
   this page again is safe: the server returns the same order. */
export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const { clearCart } = useCart();
  const { t, language } = useLanguage();
  const ar = language === "ar";
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
    const params = new URLSearchParams(window.location.search);
    const reference = params.get("reference");
    const sessionId = params.get("session_id");
    const startedAt = Date.now();

    const finish = (data: any) => {
      const id = data?.order?.id;
      if (!id) { setStatus("error"); return; }
      clearCart();
      const target = data.guestToken ? `/order-confirmation/${id}?t=${data.guestToken}` : `/order-confirmation/${id}`;
      // Let the "payment confirmed" moment register before moving on.
      window.setTimeout(() => setLocation(target, { replace: true }), Math.max(0, 900 - (Date.now() - startedAt)));
    };

    const url = reference
      ? `/api/lahza/verify?reference=${encodeURIComponent(reference)}`
      : sessionId
        ? `/api/stripe/checkout-success?session_id=${sessionId}`
        : null;
    if (!url) { setStatus("error"); return; }
    fetch(url, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("Payment verification failed");
        finish(await res.json());
      })
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 py-20">
        <div className="text-center max-w-md">
          {status === "loading" && (
            <div className="space-y-6" data-testid="payment-verifying">
              <div className="relative mx-auto w-24 h-24">
                <span className="absolute inset-0 rounded-full border-4 border-foreground/10" />
                <span className="absolute inset-0 rounded-full border-4 border-transparent border-t-foreground animate-spin" />
                <span className="absolute inset-0 flex items-center justify-center"><ShieldCheck className="w-9 h-9 text-emerald-600" /></span>
              </div>
              <h1 className="font-display text-2xl">{ar ? "نتحقق من دفعك بأمان…" : "Securely confirming your payment…"}</h1>
              <p className="text-sm text-muted-foreground">{ar ? "لحظات ونعرض لكِ تفاصيل طلبك. لا تغلقي الصفحة." : "One moment, then we'll show your order. Please keep this page open."}</p>
            </div>
          )}

          {status === "error" && (
            <div className="space-y-6">
              <h1 className="font-display text-3xl" data-testid="text-checkout-error">{t.checkout.checkoutFailed}</h1>
              <p className="text-muted-foreground">{t.checkout.paymentError}</p>
              <Button onClick={() => setLocation("/checkout")} className="rounded-md uppercase tracking-widest text-sm" data-testid="button-retry-checkout">
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
