import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { Truck, RotateCcw, AlertCircle } from "lucide-react";
import { useSiteSettings, defaultSettings } from "@/hooks/use-site-settings";

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

  const shippingLines = get("shipping_details_ar", "shipping_details_en");
  const returnsLines = get("returns_details_ar", "returns_details_en");

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        <section className="bg-secondary py-16 sm:py-24">
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
          </div>

          {note && (
            <div className="border-t border-border pt-12">
              <div className="flex items-start gap-3 bg-secondary rounded-lg p-6">
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
