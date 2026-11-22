import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { useEffect } from "react";
import { Link } from "wouter";
import { Truck, RotateCcw, AlertCircle, LogIn, ArrowLeftRight, Ruler, Send, ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useSiteSettings, defaultSettings } from "@/hooks/use-site-settings";
import { useAuth } from "@/hooks/use-auth";

export default function ShippingReturns() {
  const { t, language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const isAr = language === "ar";

  const get = (keyAr: string, keyEn: string): string[] => {
    const raw = settings?.[isAr ? keyAr : keyEn] ?? defaultSettings[isAr ? keyAr : keyEn] ?? "";
    return raw.split("\n").filter(Boolean);
  };

  const note = settings?.[isAr ? "shipping_note_ar" : "shipping_note_en"]
    ?? defaultSettings[isAr ? "shipping_note_ar" : "shipping_note_en"]
    ?? "";

  // ── "How do I exchange?" guide ──
  // Shown only while exchanges are switched on in the dashboard. The time limit is read from
  // the same dashboard setting the exchange feature itself uses, so the two never disagree.
  const { data: user } = useAuth();
  const exchangesEnabled = settings?.exchanges_enabled !== "false";
  const windowDays = (() => {
    const n = parseFloat(settings?.exchange_window_days ?? "");
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  const windowLabel = !windowDays
    ? ""
    : isAr
      ? windowDays === 1 ? "يوم واحد" : windowDays === 2 ? "يومين" : `${windowDays} أيام`
      : windowDays === 1 ? "one day" : `${windowDays} days`;
  const exchangeNote = (settings?.exchange_note ?? "").trim();
  const exchangeSteps = [
    { icon: LogIn, ar: "سجّلي الدخول", en: "Sign in", dAr: "ادخلي إلى حسابك الذي طلبتِ منه.", dEn: "Open the account you ordered with." },
    { icon: ArrowLeftRight, ar: "افتحي «الاستبدال»", en: "Open “Exchanges”", dAr: "في صفحة حسابك تجدين طلباتك المؤهلة للتبديل.", dEn: "Your account page lists the orders you can exchange." },
    { icon: Ruler, ar: "اختاري القطعة", en: "Pick the piece", dAr: "حددي القطعة والمقاس المطلوب واكتبي السبب.", dEn: "Choose the piece, the size you want, and the reason." },
    { icon: Send, ar: "أرسلي الطلب", en: "Send the request", dAr: "يصلك إشعار بالرد على طلبك.", dEn: "You get a notification with our answer." },
  ];
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  // Links such as /shipping-returns#how-to-exchange land on the guide.
  useEffect(() => {
    if (window.location.hash !== "#how-to-exchange") return;
    const id = window.setTimeout(() => {
      document.getElementById("how-to-exchange")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 250);
    return () => window.clearTimeout(id);
  }, []);

  const shippingLines = get("shipping_details_ar", "shipping_details_en");
  const returnsLines = get("returns_details_ar", "returns_details_en");

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        <section className="bg-blush py-16 sm:py-24">
          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-display text-3xl sm:text-5xl tracking-widest uppercase mb-4" data-testid="text-shipping-title">
              {t.shipping.title}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-shipping-subtitle">
              {t.shipping.subtitle}
            </p>
          </div>
        </section>

        <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-4xl mx-auto space-y-16">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <Truck className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-xl uppercase tracking-widest" data-testid="text-shipping-section">
                {t.shipping.shippingTitle}
              </h2>
            </div>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              {shippingLines.map((line, i) => (
                <p key={i} data-testid={`text-shipping-detail-${i}`}>{line}</p>
              ))}
            </div>
          </div>

          <div className="border-t border-border pt-12">
            <div className="flex items-center gap-3 mb-6">
              <RotateCcw className="w-6 h-6 shrink-0" />
              <h2 className="font-display text-xl uppercase tracking-widest" data-testid="text-returns-section">
                {t.shipping.returnsTitle}
              </h2>
            </div>
            <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
              {returnsLines.map((line, i) => (
                <p key={i} data-testid={`text-returns-detail-${i}`}>{line}</p>
              ))}
            </div>

            {exchangesEnabled && (
              <div
                id="how-to-exchange"
                className="mt-10 scroll-mt-28 rounded-[1.5rem] bg-blush p-5 sm:p-8"
                data-testid="how-to-exchange"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-lg font-semibold text-berry-deep sm:text-xl">
                    {isAr ? "كيف أبدّل طلبي؟" : "How do I exchange my order?"}
                  </h3>
                  {windowLabel && (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-berry" data-testid="text-exchange-window">
                      <Clock className="h-3.5 w-3.5" />
                      {isAr ? `خلال ${windowLabel} من استلام الطرد` : `Within ${windowLabel} of receiving the parcel`}
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm text-foreground/70">
                  {isAr ? "من حسابك على الموقع، في أربع خطوات:" : "From your account on the site, in four steps:"}
                </p>
                <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  {exchangeSteps.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <li key={i} className="relative rounded-2xl bg-white p-4" data-testid={`exchange-step-${i + 1}`}>
                        <div className="flex items-center gap-3 lg:flex-col lg:items-start">
                          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-berry text-white">
                            <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
                          </span>
                          <div className="min-w-0">
                            <p className="price-text text-[11px] font-semibold text-berry">
                              {isAr ? `الخطوة ${i + 1}` : `Step ${i + 1}`}
                            </p>
                            <p className="text-[15px] font-semibold leading-snug text-foreground">{isAr ? step.ar : step.en}</p>
                          </div>
                        </div>
                        <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{isAr ? step.dAr : step.dEn}</p>
                      </li>
                    );
                  })}
                </ol>
                {exchangeNote && (
                  <p className="mt-4 flex items-start gap-2 text-[13px] leading-relaxed text-foreground/75" data-testid="text-exchange-note">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-berry" />
                    {exchangeNote}
                  </p>
                )}
                <div className="mt-5 flex justify-center sm:justify-start">
                  <Link
                    href={user ? "/profile?tab=exchanges&subtab=eligible" : "/auth"}
                    className="inline-flex h-11 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background transition-colors hover:bg-berry"
                    data-testid="button-start-exchange"
                  >
                    {user
                      ? isAr ? "ابدئي طلب تبديل" : "Start an exchange"
                      : isAr ? "سجّلي الدخول لبدء التبديل" : "Sign in to start an exchange"}
                    <Arrow className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}
          </div>

          {note && (
            <div className="border-t border-border pt-12">
              <div className="flex items-start gap-3 bg-blush rounded-lg p-6">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-muted-foreground" />
                <p className="text-sm text-muted-foreground leading-relaxed" data-testid="text-shipping-note">
                  {note}
                </p>
              </div>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
