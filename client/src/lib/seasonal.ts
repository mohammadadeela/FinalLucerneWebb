/* Seasonal themes: Christmas, Eid al-Fitr, Eid al-Adha.

   The admin picks ONE theme (or none) with the `seasonal_theme` setting, so two seasons can never be
   on at once. Eid dates follow the moon, so the optional countdown date is set by hand in the admin. */

export type SeasonalTheme = "christmas" | "eid_fitr" | "eid_adha";
export const SEASONAL_THEMES: SeasonalTheme[] = ["christmas", "eid_fitr", "eid_adha"];

export interface SeasonInfo {
  id: SeasonalTheme;
  nameAr: string;
  nameEn: string;
  /** Used in countdown text: "12 days until …" */
  eventAr: string;
  eventEn: string;
  emoji: string;
  /** Separator between messages in the scrolling bar. */
  sep: string;
  barBg: string;
  barEdge: string;
  barText: string;
  accent: string;
  greetingAr: string;
  greetingEn: string;
  defaultBarAr: string[];
  defaultBarEn: string[];
}

export const SEASONS: Record<SeasonalTheme, SeasonInfo> = {
  christmas: {
    id: "christmas",
    nameAr: "الكريسماس", nameEn: "Christmas",
    eventAr: "الكريسماس", eventEn: "Christmas",
    emoji: "🎄", sep: "🎄",
    barBg: "linear-gradient(90deg,#7f1d1d 0%,#b91c1c 50%,#14532d 100%)",
    barEdge: "#7f1d1d",
    barText: "#ffffff",
    accent: "#fbbf24",
    greetingAr: "ميلاد مجيد وكل عام وأنتم بخير",
    greetingEn: "Merry Christmas from Lucerne",
    defaultBarAr: ["ميلاد مجيد وكل عام وأنتم بخير 🎄", "هدايا الأعياد بانتظارك في لوسيرن 🎁", "اختاري إطلالتك لليلة الميلاد ✨"],
    defaultBarEn: ["Merry Christmas from Lucerne 🎄", "Festive gifts are waiting for you 🎁", "Find your Christmas Eve look ✨"],
  },
  eid_fitr: {
    id: "eid_fitr",
    nameAr: "عيد الفطر", nameEn: "Eid al-Fitr",
    eventAr: "عيد الفطر", eventEn: "Eid al-Fitr",
    emoji: "🌙", sep: "🌙",
    barBg: "linear-gradient(90deg,#2e1065 0%,#5b21b6 50%,#3b0764 100%)",
    barEdge: "#2e1065",
    barText: "#fde68a",
    accent: "#fcd34d",
    greetingAr: "عيد فطر مبارك وكل عام وأنتم بخير",
    greetingEn: "Eid Mubarak from Lucerne",
    defaultBarAr: ["عيد فطر مبارك وكل عام وأنتم بخير 🌙", "إطلالات العيد وصلت إلى لوسيرن ✨", "تقبّل الله طاعاتكم 🤍"],
    defaultBarEn: ["Eid Mubarak from Lucerne 🌙", "Your Eid looks have arrived ✨", "Taqabbal Allahu minna wa minkum 🤍"],
  },
  eid_adha: {
    id: "eid_adha",
    nameAr: "عيد الأضحى", nameEn: "Eid al-Adha",
    eventAr: "عيد الأضحى", eventEn: "Eid al-Adha",
    emoji: "🕌", sep: "✦",
    barBg: "linear-gradient(90deg,#052e16 0%,#166534 50%,#064e3b 100%)",
    barEdge: "#052e16",
    barText: "#fde68a",
    accent: "#fcd34d",
    greetingAr: "عيد أضحى مبارك وكل عام وأنتم بخير",
    greetingEn: "Eid al-Adha Mubarak from Lucerne",
    defaultBarAr: ["عيد أضحى مبارك وكل عام وأنتم بخير 🕌", "اختاري إطلالة العيد من لوسيرن ✨", "عساكم من عوّاده 🌙"],
    defaultBarEn: ["Eid al-Adha Mubarak from Lucerne 🕌", "Pick your Eid look at Lucerne ✨", "Wishing you a blessed Eid 🌙"],
  },
};

/** The one active theme, or null. Unknown/empty values mean "none". */
export function getActiveTheme(settings: Record<string, string> | undefined): SeasonalTheme | null {
  const v = settings?.seasonal_theme;
  return v === "christmas" || v === "eid_fitr" || v === "eid_adha" ? v : null;
}

/** Scrolling-bar text: the admin's own text for the active season if set, otherwise friendly defaults. */
export function seasonBarText(
  settings: Record<string, string> | undefined,
  theme: SeasonalTheme,
  lang: "ar" | "en",
): string {
  const custom = (lang === "ar" ? settings?.seasonal_text_ar : settings?.seasonal_text_en) ?? "";
  if (custom.trim()) return custom;
  const s = SEASONS[theme];
  return (lang === "ar" ? s.defaultBarAr : s.defaultBarEn).join(" | ");
}

/** Whole days from today (local time) until `dateStr` (YYYY-MM-DD). null if missing/invalid; negative once passed. */
export function daysUntil(dateStr: string | undefined, now: Date = new Date()): number | null {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  if (Number.isNaN(target.getTime())) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** "12 days" / "12 يوماً" with correct Arabic number grammar (1 يوم واحد, 2 يومان, 3–10 أيام, 11+ يوماً). */
export function daysLabel(n: number, lang: "ar" | "en"): string {
  if (lang === "en") return `${n} ${n === 1 ? "day" : "days"}`;
  if (n === 1) return "يوم واحد";
  if (n === 2) return "يومان";
  if (n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
}
