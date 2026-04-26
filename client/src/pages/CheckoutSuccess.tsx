import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useCart } from "@/store/use-cart";
import { useLanguage } from "@/i18n";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function CheckoutSuccess() {
  const [, setLocation] = useLocation();
  const { clearCart } = useCart();
  const { t } = useLanguage();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [orderId, setOrderId] = useState<number | null>(null);

  useEffect(() => {
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
            <div className="space-y-4">
              <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />
              <p className="text-lg" data-testid="text-checkout-processing">{t.checkout.processing}</p>
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
              <div className="flex gap-4 justify-center pt-4">
                <Button
                  onClick={() => setLocation(orderId ? `/profile?order=${orderId}` : "/profile")}
                  className="rounded-md uppercase tracking-widest text-sm"
                  data-testid="button-view-orders"
                >
                  {t.profile.orderHistory}
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
