import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { useLanguage } from "@/i18n";
import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { useSiteSettings, defaultSettings } from "@/hooks/use-site-settings";

interface FAQItem {
  question_ar: string;
  question_en: string;
  answer_ar: string;
  answer_en: string;
}

function getFaqItems(settings: Record<string, string> | undefined): FAQItem[] {
  const raw = settings?.faq_items ?? defaultSettings.faq_items;
  try { return JSON.parse(raw); } catch { return []; }
}

function FAQItemRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        className="w-full flex items-center justify-between py-5 text-start gap-4 hover:text-foreground/80 transition-colors"
        onClick={() => setOpen(!open)}
        data-testid={`button-faq-${question.slice(0, 10)}`}
      >
        <span className="font-medium text-sm sm:text-base">{question}</span>
        <ChevronDown className={`w-5 h-5 shrink-0 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <p className="pb-5 text-sm text-muted-foreground leading-relaxed" data-testid="text-faq-answer">
          {answer}
        </p>
      )}
    </div>
  );
}

export default function FAQ() {
  const { t, language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const items = getFaqItems(settings);
  const isAr = language === "ar";

  return (
    <div className="min-h-screen flex flex-col pt-navbar">
      <Navbar />
      <main className="flex-1">
        <section className="bg-secondary py-16 sm:py-24">
          <div className="w-full px-4 sm:px-6 lg:px-8 text-center">
            <h1 className="font-display text-3xl sm:text-5xl tracking-widest uppercase mb-4" data-testid="text-faq-title">
              {t.faq.title}
            </h1>
            <p className="text-muted-foreground max-w-xl mx-auto" data-testid="text-faq-subtitle">
              {t.faq.subtitle}
            </p>
          </div>
        </section>
        <section className="w-full px-4 sm:px-6 lg:px-8 py-12 sm:py-16 max-w-3xl mx-auto">
          {items.map((item, i) => (
            <FAQItemRow
              key={i}
              question={isAr ? item.question_ar : item.question_en}
              answer={isAr ? item.answer_ar : item.answer_en}
            />
          ))}
        </section>
      </main>
      <Footer />
    </div>
  );
}
