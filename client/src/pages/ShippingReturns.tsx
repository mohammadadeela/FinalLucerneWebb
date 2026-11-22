import { useLanguage } from "@/i18n";
import { useEffect } from "react";
import { Link } from "wouter";
import { Truck, AlertCircle, Check, MapPin, ArrowLeftRight, Ruler, Send, ArrowLeft, ArrowRight, Clock } from "lucide-react";
import { useSiteSettings, defaultSettings, getShippingZones } from "@/hooks/use-site-settings";
import { rememberPostLoginTarget } from "@/lib/post-login";
import { SupportPage, SupportHeading, Rise } from "@/components/support/SupportShell";
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
    { icon: ArrowLeftRight, ar: "اذهبي إلى «الاستبدال»", en: "Go to “Exchanges”", dAr: "في صفحة حسابك تجدين طلباتك المؤهلة للتبديل.", dEn: "Your account page lists the orders you can exchange." },
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

  const zones = getShippingZones(settings);

  return (
    <SupportPage
      current="shipping"
      title={t.shipping.title}
      subtitle={t.shipping.subtitle}
      titleTestId="text-shipping-title"
      subtitleTestId="text-shipping-subtitle"
      heroExtra={
        <div className="flex flex-wrap justify-center gap-2">
          <a href="#shipping" className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:text-berry-deep" data-testid="jump-shipping">
            {t.shipping.shippingTitle}
          </a>
          <a href="#exchange-policy" className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-foreground/80 transition-colors hover:text-berry-deep" data-testid="jump-exchange">
            {t.shipping.returnsTitle}
          </a>
          {exchangesEnabled && (
            <a href="#how-to-exchange" className="rounded-full bg-berry px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-berry-deep" data-testid="jump-how">
              {isAr ? "كيف أبدّل طلبي؟" : "How do I exchange?"}
            </a>
          )}
        </div>
      }
    >
      <div className="space-y-10 sm:space-y-14">
        {/* Shipping */}
        <Rise>
          <section id="shipping" className="scroll-mt-28">
            <SupportHeading icon={Truck} testId="text-shipping-section">{t.shipping.shippingTitle}</SupportHeading>

            {zones.length > 0 && (
              <div className={`mb-3 grid gap-2.5 ${zones.length >= 3 ? "grid-cols-3" : "grid-cols-2"}`} data-testid="shipping-zones">
                {zones.map((zone) => (
                  <div key={zone.id} className="rounded-2xl bg-white p-3 text-center sm:p-5" data-testid={`shipping-zone-${zone.id}`}>
                    <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-blush text-berry">
                      <MapPin className="h-4 w-4" strokeWidth={1.8} />
                    </span>
                    <p className="mt-2 text-[13px] font-semibold leading-snug text-foreground sm:text-sm">{isAr ? zone.nameAr : zone.nameEn}</p>
                    <p className="price-text mt-1 text-lg font-bold text-berry-deep sm:text-2xl">
                      {Number(zone.price) > 0 ? `₪${zone.price}` : isAr ? "مجاني" : "Free"}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <ul className="space-y-3 rounded-2xl bg-white p-5 sm:p-6">
              {shippingLines.map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/75" data-testid={`text-shipping-detail-${i}`}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blush text-berry">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </Rise>

        {/* Exchange policy */}
        <Rise>
          <section id="exchange-policy" className="scroll-mt-28">
            <SupportHeading icon={ArrowLeftRight} testId="text-returns-section">{t.shipping.returnsTitle}</SupportHeading>
            <ul className="space-y-3 rounded-2xl bg-white p-5 sm:p-6">
              {returnsLines.map((line, i) => (
                <li key={i} className="flex items-start gap-3 text-sm leading-relaxed text-foreground/75" data-testid={`text-returns-detail-${i}`}>
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blush text-berry">
                    <Check className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  {line}
                </li>
              ))}
            </ul>
          </section>
        </Rise>

            {exchangesEnabled && (
              <div
                id="how-to-exchange"
                className="scroll-mt-28 rounded-[1.5rem] bg-blush p-5 sm:p-8"
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
                  {isAr ? "من حسابك على الموقع، في ثلاث خطوات:" : "From your account on the site, in three steps:"}
                </p>
                <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {exchangeSteps.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <li key={i} className="relative rounded-2xl bg-white p-4" data-testid={`exchange-step-${i + 1}`}>
                        <div className="flex items-center gap-3 sm:flex-col sm:items-start">
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
                    onClick={() => { if (!user) rememberPostLoginTarget("/profile?tab=exchanges&subtab=eligible"); }}
                    data-testid="button-start-exchange"
                  >
                    {isAr ? "ابدئي طلب تبديل" : "Start an exchange"}
                    <Arrow className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            )}

        {note && (
          <Rise>
            <div className="flex items-start gap-3 rounded-2xl bg-white p-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-berry" />
              <p className="text-sm leading-relaxed text-foreground/75" data-testid="text-shipping-note">{note}</p>
            </div>
          </Rise>
        )}
      </div>
    </SupportPage>
  );
}
