import { Link } from "wouter";
import { Phone, MapPin, Clock, ArrowLeft, ArrowRight } from "lucide-react";
import { SiWhatsapp, SiInstagram } from "react-icons/si";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";
import { SupportPage, Rise, useWhatsapp } from "@/components/support/SupportShell";

const INSTAGRAM_URL = "https://www.instagram.com/lucerne.boutique/";

export default function Contact() {
  const { t, language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const isAr = language === "ar";
  const wa = useWhatsapp();
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  const address = getSetting(settings, isAr ? "contact_address_ar" : "contact_address_en");
  const hours = getSetting(settings, isAr ? "contact_hours_ar" : "contact_hours_en");

  const tile = "group flex items-center gap-3 rounded-2xl bg-white p-4 transition-shadow duration-300 hover:shadow-[0_10px_30px_-14px_rgba(120,40,70,0.3)] sm:p-5";
  const chip = "flex h-11 w-11 shrink-0 items-center justify-center rounded-full";

  return (
    <SupportPage
      current="contact"
      title={t.contact.title}
      subtitle={t.contact.subtitle}
      titleTestId="text-contact-title"
      subtitleTestId="text-contact-subtitle"
      hideHelp
    >
      {/* The fastest way first */}
      <Rise>
        <a
          href={wa.href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="button-contact-whatsapp"
          className="flex flex-col items-center gap-4 rounded-[1.5rem] bg-blush p-6 text-center sm:flex-row sm:p-8 sm:text-start"
        >
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#25D366] text-white">
            <SiWhatsapp className="h-7 w-7" />
          </span>
          <span className="flex-1">
            <span className="block text-lg font-semibold text-berry-deep sm:text-xl">{isAr ? "واتساب" : "WhatsApp"}</span>
            <span className="mt-1 block text-sm text-foreground/65" data-testid="text-contact-cta">{t.contact.cta}</span>
          </span>
          <span className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-foreground px-6 text-sm font-semibold text-background">
            {t.contact.whatsappButton}
            <Arrow className="h-4 w-4" />
          </span>
        </a>
      </Rise>

      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Rise delay={0.04}>
          <a href={wa.telHref} className={tile} data-testid="link-contact-phone">
            <span className={`${chip} bg-blush text-berry`}><Phone className="h-5 w-5" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-berry">{t.contact.phoneLabel}</span>
              <span className="price-text block text-[15px] font-semibold text-foreground" dir="ltr" style={{ textAlign: isAr ? "right" : "left" }}>{wa.displayPhone}</span>
            </span>
            <Arrow className="h-4 w-4 text-foreground/30 transition-colors group-hover:text-berry" />
          </a>
        </Rise>

        <Rise delay={0.08}>
          <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer" className={tile} data-testid="link-contact-instagram">
            <span className={`${chip} bg-blush text-berry`}><SiInstagram className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-berry">{isAr ? "إنستغرام" : "Instagram"}</span>
              <span className="block text-[15px] font-semibold text-foreground" dir="ltr" style={{ textAlign: isAr ? "right" : "left" }}>@lucerne.boutique</span>
            </span>
            <Arrow className="h-4 w-4 text-foreground/30 transition-colors group-hover:text-berry" />
          </a>
        </Rise>

        <Rise delay={0.12}>
          <Link href="/our-location" className={tile} data-testid="link-contact-location">
            <span className={`${chip} bg-blush text-berry`}><MapPin className="h-5 w-5" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-berry">{t.contact.addressLabel}</span>
              <span className="block text-sm font-semibold leading-snug text-foreground" data-testid="text-contact-address">{address}</span>
            </span>
            <Arrow className="h-4 w-4 text-foreground/30 transition-colors group-hover:text-berry" />
          </Link>
        </Rise>

        <Rise delay={0.16}>
          <div className={tile}>
            <span className={`${chip} bg-blush text-berry`}><Clock className="h-5 w-5" strokeWidth={1.8} /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-semibold text-berry">{t.contact.hoursLabel}</span>
              <span className="block text-sm font-semibold leading-snug text-foreground" data-testid="text-contact-hours">{hours}</span>
            </span>
          </div>
        </Rise>
      </div>
    </SupportPage>
  );
}
