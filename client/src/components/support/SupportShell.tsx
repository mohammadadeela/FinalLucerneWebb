import type { ReactNode } from "react";
import { Link } from "wouter";
import { motion } from "framer-motion";
import { HelpCircle, Truck, Phone, MapPin } from "lucide-react";
import { SiWhatsapp } from "react-icons/si";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { BrandButterfly } from "@/components/ui/BrandButterfly";
import { useLanguage } from "@/i18n";
import { useSiteSettings, getSetting } from "@/hooks/use-site-settings";

/* The four support pages share one frame so they read as a single help centre:
   a pink header, a tab bar to move between them, and a "still need help?" card at the end. */

export type SupportKey = "faq" | "shipping" | "contact" | "location";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/** Rises gently into place the first time it scrolls into view. */
export function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div
      className={className}
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.55, ease: EASE, delay }}
    >
      {children}
    </motion.div>
  );
}

/** WhatsApp link built from the phone number saved in the dashboard. */
export function useWhatsapp() {
  const { language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const rawPhone = getSetting(settings, "contact_phone") || "970597314193";
  const digits = rawPhone.replace(/\D/g, "");
  const text = encodeURIComponent(
    language === "ar" ? "مرحباً، أود الاستفسار عن منتجاتكم 😊" : "Hello, I would like to inquire about your products 😊",
  );
  return {
    href: `https://wa.me/${digits}?text=${text}`,
    displayPhone: rawPhone.trim().startsWith("+") ? rawPhone.trim() : `+${digits}`,
    telHref: `tel:+${digits}`,
  };
}

/** Section heading used across the support pages: burgundy icon chip + title. */
export function SupportHeading({ icon: Icon, children, testId }: { icon: typeof Truck; children: ReactNode; testId?: string }) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blush text-berry">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-semibold text-foreground sm:text-xl" data-testid={testId}>{children}</h2>
    </div>
  );
}

export function SupportPage({
  current, title, subtitle, titleTestId, subtitleTestId, heroExtra, hideHelp, children,
}: {
  current: SupportKey;
  title: string;
  subtitle?: string;
  titleTestId?: string;
  subtitleTestId?: string;
  heroExtra?: ReactNode;
  hideHelp?: boolean;
  children: ReactNode;
}) {
  const { t, language } = useLanguage();
  const isAr = language === "ar";
  const wa = useWhatsapp();

  const tabs: { key: SupportKey; href: string; label: string; icon: typeof Truck }[] = [
    { key: "faq", href: "/faq", label: t.footer.faq, icon: HelpCircle },
    { key: "shipping", href: "/shipping-returns", label: t.footer.shippingReturns, icon: Truck },
    { key: "contact", href: "/contact", label: t.footer.contactUs, icon: Phone },
    { key: "location", href: "/our-location", label: t.footer.ourLocation, icon: MapPin },
  ];

  return (
    <div className="flex min-h-screen flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        {/* Header */}
        <section className="relative overflow-hidden bg-blush px-4 pb-16 pt-9 text-center sm:px-6 sm:pb-20 sm:pt-14">
          <BrandButterfly className="pointer-events-none absolute -top-2 h-24 w-24 -rotate-12 opacity-[0.16] ltr:-left-4 rtl:-right-4 sm:h-36 sm:w-36" />
          <BrandButterfly className="pointer-events-none absolute bottom-6 h-16 w-16 rotate-12 opacity-[0.14] ltr:right-2 rtl:left-2 sm:h-24 sm:w-24" />
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="relative mx-auto max-w-2xl"
          >
            <p className="text-xs font-semibold text-berry">{isAr ? "مركز المساعدة" : "Help centre"}</p>
            <h1 className="mt-2 text-[1.75rem] font-bold leading-tight text-berry-deep sm:text-5xl" data-testid={titleTestId}>
              {title}
            </h1>
            {subtitle && (
              <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-foreground/65 sm:text-base" data-testid={subtitleTestId}>
                {subtitle}
              </p>
            )}
            {heroExtra && <div className="mt-5">{heroExtra}</div>}
          </motion.div>
        </section>

        {/* Tab bar — overlaps the header like an app's segmented control */}
        <nav className="relative z-10 mx-auto -mt-9 max-w-2xl px-3 sm:-mt-10 sm:px-6" aria-label={isAr ? "صفحات المساعدة" : "Help pages"}>
          <div className="grid grid-cols-4 gap-1 rounded-[1.4rem] bg-white p-1.5 shadow-[0_10px_30px_-12px_rgba(120,40,70,0.28)]">
            {tabs.map(({ key, href, label, icon: Icon }) => {
              const active = key === current;
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  data-testid={`support-tab-${key}`}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl px-1 py-2.5 text-center transition-colors sm:flex-row sm:gap-2 sm:py-3 ${
                    active ? "bg-foreground text-background" : "text-foreground/70 hover:bg-blush/60 hover:text-berry-deep"
                  }`}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                  <span className="text-[11px] font-semibold leading-tight sm:text-[13px]">{label}</span>
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="mx-auto w-full max-w-4xl px-4 pb-14 pt-8 sm:px-6 sm:pb-20 sm:pt-12">
          {children}

          {!hideHelp && (
            <Rise className="mt-10 sm:mt-14">
              <div className="flex flex-col items-center gap-4 rounded-[1.5rem] bg-blush p-6 text-center sm:flex-row sm:justify-between sm:p-8 sm:text-start" data-testid="support-help-card">
                <div>
                  <p className="text-lg font-semibold text-berry-deep">{isAr ? "لسّا عندك سؤال؟" : "Still have a question?"}</p>
                  <p className="mt-1 text-sm text-foreground/65">
                    {isAr ? "راسلينا على واتساب وبنرد عليكِ بأسرع وقت." : "Message us on WhatsApp and we'll get back to you quickly."}
                  </p>
                </div>
                <a
                  href={wa.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="support-help-whatsapp"
                  className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-6 text-sm font-semibold text-white transition-colors hover:bg-[#1fb857]"
                >
                  <SiWhatsapp className="h-[18px] w-[18px]" />
                  {isAr ? "راسلينا على واتساب" : "Chat on WhatsApp"}
                </a>
              </div>
            </Rise>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
