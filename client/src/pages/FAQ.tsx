import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Search, X } from "lucide-react";
import { useLanguage } from "@/i18n";
import { useSiteSettings, defaultSettings } from "@/hooks/use-site-settings";
import { SupportPage, Rise } from "@/components/support/SupportShell";

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

// Arabic search should not care about hamzas, taa marbuta or diacritics.
const fold = (s: string) =>
  s.toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي");

// Quick topics offered under the search box — only the ones that actually match a question are shown.
const TOPICS = [
  { ar: "التوصيل", en: "Delivery" },
  { ar: "الدفع", en: "Payment" },
  { ar: "التبديل", en: "Exchange" },
  { ar: "المقاسات", en: "Sizes" },
  { ar: "الطلب", en: "Order" },
];
const topicStem = (w: string) => fold(w).replace(/^ال/, "").replace(/(ات|s)$/, "");

function FAQItemRow({ index, question, answer, open, onToggle }: {
  index: number; question: string; answer: string; open: boolean; onToggle: () => void;
}) {
  return (
    <div
      className={`rounded-2xl bg-white transition-shadow duration-300 ${open ? "shadow-[0_10px_30px_-14px_rgba(120,40,70,0.3)]" : "shadow-[0_1px_0_rgba(0,0,0,0.04)]"}`}
    >
      <button
        className="flex w-full items-center gap-3 p-4 text-start sm:gap-4 sm:p-5"
        onClick={onToggle}
        aria-expanded={open}
        data-testid={`button-faq-${question.slice(0, 10)}`}
      >
        <span className={`price-text flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${open ? "bg-berry text-white" : "bg-blush text-berry"}`}>
          {String(index + 1).padStart(2, "0")}
        </span>
        <span className="flex-1 text-sm font-semibold leading-snug text-foreground sm:text-base">{question}</span>
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${open ? "rotate-180 bg-foreground text-background" : "bg-blush/70 text-berry"}`}>
          <ChevronDown className="h-4 w-4" />
        </span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="px-4 pb-5 text-sm leading-relaxed text-muted-foreground ps-[3.75rem] sm:px-5 sm:ps-[4.25rem]" data-testid="text-faq-answer">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function FAQ() {
  const { t, language } = useLanguage();
  const { data: settings } = useSiteSettings();
  const isAr = language === "ar";
  const [query, setQuery] = useState("");
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  const items = useMemo(
    () => getFaqItems(settings).map((item, index) => ({
      index,
      question: isAr ? item.question_ar : item.question_en,
      answer: isAr ? item.answer_ar : item.answer_en,
    })),
    [settings, isAr],
  );

  const matches = (needle: string) => {
    const n = topicStem(needle);
    return items.filter((it) => fold(`${it.question} ${it.answer}`).includes(n));
  };
  const visible = query.trim() ? matches(query.trim()) : items;
  const topics = TOPICS.map((tp) => (isAr ? tp.ar : tp.en)).filter((label) => matches(label).length > 0);

  const pick = (value: string) => { setQuery(value); setOpenIndex(null); };

  return (
    <SupportPage
      current="faq"
      title={t.faq.title}
      subtitle={t.faq.subtitle}
      titleTestId="text-faq-title"
      subtitleTestId="text-faq-subtitle"
      heroExtra={
        <div className="relative mx-auto max-w-md">
          <Search className="pointer-events-none absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-berry ltr:left-4 rtl:right-4" />
          <input
            type="search"
            value={query}
            onChange={(e) => pick(e.target.value)}
            placeholder={isAr ? "ابحثي عن سؤالك…" : "Search your question…"}
            className="h-12 w-full rounded-full border-0 bg-white px-11 text-sm text-foreground shadow-[0_6px_20px_-10px_rgba(120,40,70,0.35)] outline-none placeholder:text-foreground/40 focus:ring-2 focus:ring-berry/30 [&::-webkit-search-cancel-button]:hidden"
            data-testid="input-faq-search"
          />
          {query && (
            <button
              onClick={() => pick("")}
              aria-label={isAr ? "مسح البحث" : "Clear search"}
              className="absolute top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-blush text-berry ltr:right-3 rtl:left-3"
              data-testid="button-faq-clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      }
    >
      {topics.length > 1 && (
        <div className="mb-5 flex flex-wrap justify-center gap-2" data-testid="faq-topics">
          {topics.map((label) => {
            const active = topicStem(query.trim()) === topicStem(label);
            return (
              <button
                key={label}
                onClick={() => pick(active ? "" : label)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${active ? "bg-berry text-white" : "bg-white text-foreground/75 hover:bg-blush hover:text-berry-deep"}`}
                data-testid={`faq-topic-${label}`}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      <div className="mx-auto max-w-3xl space-y-2.5">
        {visible.map((item, i) => (
          <Rise key={item.index} delay={Math.min(i, 6) * 0.04}>
            <FAQItemRow
              index={item.index}
              question={item.question}
              answer={item.answer}
              open={openIndex === item.index}
              onToggle={() => setOpenIndex(openIndex === item.index ? null : item.index)}
            />
          </Rise>
        ))}

        {visible.length === 0 && (
          <div className="rounded-2xl bg-white p-8 text-center" data-testid="faq-empty">
            <p className="text-base font-semibold text-foreground">
              {isAr ? "ما لقينا سؤال بهذه الكلمات" : "No question matches those words"}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {isAr ? "جرّبي كلمة أخرى، أو اسألينا مباشرة على واتساب." : "Try another word, or ask us directly on WhatsApp."}
            </p>
            <button
              onClick={() => pick("")}
              className="mt-4 inline-flex h-10 items-center rounded-full bg-foreground px-5 text-sm font-semibold text-background"
              data-testid="button-faq-show-all"
            >
              {isAr ? "عرض كل الأسئلة" : "Show all questions"}
            </button>
          </div>
        )}
      </div>
    </SupportPage>
  );
}
