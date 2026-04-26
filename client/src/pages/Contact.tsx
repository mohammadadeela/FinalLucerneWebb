import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { Phone, MapPin, Clock, MessageCircle } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { useSiteSettings, defaultSettings } from "@/hooks/use-site-settings";

export default function Contact() {
  const { t, language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const isAr = language === "ar";

  const rawPhone = settings?.contact_phone ?? defaultSettings.contact_phone ?? "970597314193";
  const phone = rawPhone.replace(/\D/g, "");
  const displayPhone = rawPhone.startsWith("+") ? rawPhone : `+${rawPhone}`;
  const address = isAr
    ? (settings?.contact_address_ar ?? defaultSettings.contact_address_ar ?? "")
    : (settings?.contact_address_en ?? defaultSettings.contact_address_en ?? "");
  const hours = isAr
    ? (settings?.contact_hours_ar ?? defaultSettings.contact_hours_ar ?? "")
    : (settings?.contact_hours_en ?? defaultSettings.contact_hours_en ?? "");

  const message = encodeURIComponent(isAr ? "مرحباً، أود الاستفسار عن منتجاتكم 😊" : "Hello, I would like to inquire about your products 😊");
  const whatsappHref = `https://wa.me/${phone}?text=${message}`;

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        <section className="bg-secondary py-16 sm:py-24">
          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-display text-3xl sm:text-5xl tracking-widest uppercase mb-4" data-testid="text-contact-title">
              {t.contact.title}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-contact-subtitle">
              {t.contact.subtitle}
            </p>
          </div>
        </section>

        <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-3xl mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest mb-3">
                <Phone className="w-4 h-4" />
                <span>{t.contact.phoneLabel}</span>
              </div>
              <a href={`tel:${displayPhone}`} className="text-muted-foreground hover:text-foreground transition-colors text-sm" data-testid="link-contact-phone">
                {displayPhone}
              </a>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest mb-3">
                <MessageCircle className="w-4 h-4" />
                <span>{t.contact.whatsappLabel}</span>
              </div>
              <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors" data-testid="link-contact-whatsapp">
                <SiWhatsapp className="w-4 h-4 text-[#25D366]" />
                {t.contact.whatsapp}
              </a>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest mb-3">
                <MapPin className="w-4 h-4" />
                <span>{t.contact.addressLabel}</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed" data-testid="text-contact-address">{address}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-widest mb-3">
                <Clock className="w-4 h-4" />
                <span>{t.contact.hoursLabel}</span>
              </div>
              <p className="text-muted-foreground text-sm leading-relaxed" data-testid="text-contact-hours">{hours}</p>
            </div>
          </div>

          <div className="mt-12 border-t border-border pt-12 text-center">
            <p className="text-muted-foreground text-sm mb-6" data-testid="text-contact-cta">{t.contact.cta}</p>
            <a href={whatsappHref} target="_blank" rel="noopener noreferrer" data-testid="button-contact-whatsapp" className="inline-flex items-center gap-2 bg-[#25D366] hover:bg-[#20bb5a] text-white text-sm font-medium px-6 py-3 rounded-full transition-colors">
              <SiWhatsapp className="w-5 h-5" />
              {t.contact.whatsappButton}
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
