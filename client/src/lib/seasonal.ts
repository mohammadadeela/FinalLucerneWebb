/* Seasonal themes: Christmas, Eid al-Fitr, Eid al-Adha.

   The admin picks ONE theme (or none) with the `seasonal_theme` setting, so two seasons can never be
   on at once. Eid dates follow the moon, so the optional countdown date is set by hand in the admin. */

export type SeasonalTheme = "christmas" | "eid_fitr" | "eid_adha";
export const SEASONAL_THEMES: SeasonalTheme[] = ["christmas", "eid_fitr", "eid_adha"];

export interface SeasonPalette {
  /** Deepest tone: backgrounds and bar edges. */
  night: string;
  /** Second background tone. */
  deep: string;
  /** Warm light: halos and glows. */
  glow: string;
  /** Text on dark. */
  light: string;
  /** Fine line-work and accents. */
  gold: string;
}

export interface SeasonInfo {
  id: SeasonalTheme;
  nameAr: string;
  nameEn: string;
  /** Used in countdown text: "12 days until …" */
  eventAr: string;
  eventEn: string;
  /** A single glyph for places that need one (kept for compatibility). */
  emoji: string;
  /** Divider between messages in the scrolling bar. */
  sep: string;
  barBg: string;
  barEdge: string;
  barText: string;
  accent: string;
  palette: SeasonPalette;
  /** The atmosphere laid over the hero image. */
  heroTint: string;
  /** Short headline greeting, then one line under it. */
  titleAr: string;
  titleEn: string;
  subAr: string;
  subEn: string;
  /** Full-sentence greeting. */
  greetingAr: string;
  greetingEn: string;
  /** One line describing the look, for the admin. */
  ideaAr: string;
  defaultBarAr: string[];
  defaultBarEn: string[];
}

/** Calligraphic (Ruqaa) face for the Arabic greetings. Loaded only while a season is switched on. */
export const SEASON_FONT_URL = "https://fonts.googleapis.com/css2?family=Aref+Ruqaa:wght@400;700&display=swap";

export const SEASONS: Record<SeasonalTheme, SeasonInfo> = {
  /* Bethlehem night: deep midnight, pine and candle gold. A glowing star and olive branches, not pine-tree clip art. */
  christmas: {
    id: "christmas",
    nameAr: "الكريسماس", nameEn: "Christmas",
    eventAr: "الكريسماس", eventEn: "Christmas",
    emoji: "•", sep: "•",
    barBg: "linear-gradient(90deg,#7A0F1C 0%,#B01E30 50%,#7A0F1C 100%)",
    barEdge: "#7A0F1C",
    barText: "#FFF6EC",
    accent: "#F5D48A",
    palette: { night: "#7A0F1C", deep: "#B01E30", glow: "#FFE3AE", light: "#FFF6EC", gold: "#F5D48A" },
    heroTint: "radial-gradient(ellipse at 50% 0%, rgba(255,227,174,.22), transparent 55%)",
    titleAr: "ميلاد مجيد", titleEn: "Merry Christmas",
    subAr: "وكل عام وأنتم بخير", subEn: "from all of us at Lucerne",
    greetingAr: "ميلاد مجيد وكل عام وأنتم بخير",
    greetingEn: "Merry Christmas from Lucerne",
    ideaAr: "ميلاد أحمر دافئ: نجمة بيت لحم، كرات زينة متأرجحة، ثلج يتساقط وكومة ثلج ناعمة",
    defaultBarAr: ["ميلاد مجيد وكل عام وأنتم بخير", "إطلالات ليلة الميلاد وصلت إلى لوسيرن", "هدايا تليق بمن تحبين"],
    defaultBarEn: ["Merry Christmas from Lucerne", "Your Christmas Eve looks have arrived", "Gifts she will actually wear"],
  },
  /* Dusk over the first sighting of the hilal: plum to mulberry, a rose and apricot horizon. */
  eid_fitr: {
    id: "eid_fitr",
    nameAr: "عيد الفطر", nameEn: "Eid al-Fitr",
    eventAr: "عيد الفطر", eventEn: "Eid al-Fitr",
    emoji: "•", sep: "•",
    barBg: "linear-gradient(90deg,#EADBC3 0%,#F4EADB 50%,#EADBC3 100%)",
    barEdge: "#EADBC3",
    barText: "#3B2A1C",
    accent: "#A8742A",
    palette: { night: "#F1E6D4", deep: "#E4D2B6", glow: "#F0B45E", light: "#3B2A1C", gold: "#A8742A" },
    heroTint: "linear-gradient(to bottom, rgba(241,230,212,.2), rgba(240,180,94,.18))",
    titleAr: "عيد فطر مبارك", titleEn: "Eid Mubarak",
    subAr: "تقبّل الله طاعاتكم وكل عام وأنتم بخير", subEn: "Taqabbal Allahu minna wa minkum",
    greetingAr: "عيد فطر مبارك وكل عام وأنتم بخير",
    greetingEn: "Eid Mubarak from Lucerne",
    ideaAr: "بيج دافئ وذهبي: هلال وفوانيس متأرجحة وفوانيس ورقية تصعد في السماء",
    defaultBarAr: ["عيد فطر مبارك وكل عام وأنتم بخير", "إطلالات العيد وصلت إلى لوسيرن", "تقبّل الله طاعاتكم"],
    defaultBarEn: ["Eid Mubarak from Lucerne", "Your Eid looks have arrived", "May your prayers and fasting be accepted"],
  },
  /* Arcades and sunrise: emerald and teal, a saffron sun rising behind a domed skyline. */
  eid_adha: {
    id: "eid_adha",
    nameAr: "عيد الأضحى", nameEn: "Eid al-Adha",
    eventAr: "عيد الأضحى", eventEn: "Eid al-Adha",
    emoji: "•", sep: "•",
    barBg: "linear-gradient(90deg,#E6D6BB 0%,#F2E7D3 50%,#E6D6BB 100%)",
    barEdge: "#E6D6BB",
    barText: "#3A2B1B",
    accent: "#9C6B23",
    palette: { night: "#EFE2CC", deep: "#DFCBA9", glow: "#EDAE4C", light: "#3A2B1B", gold: "#9C6B23" },
    heroTint: "linear-gradient(to bottom, rgba(239,226,204,.2), rgba(237,174,76,.2))",
    titleAr: "عيد أضحى مبارك", titleEn: "Eid al-Adha Mubarak",
    subAr: "عساكم من عوّاده وكل عام وأنتم بخير", subEn: "Wishing you a blessed Eid",
    greetingAr: "عيد أضحى مبارك وكل عام وأنتم بخير",
    greetingEn: "Eid al-Adha Mubarak from Lucerne",
    ideaAr: "بيج ورملي: خراف صغيرة تركض على التلال وشمس ذهبية تشرق خلف القباب",
    defaultBarAr: ["عيد أضحى مبارك وكل عام وأنتم بخير", "اختاري إطلالة العيد من لوسيرن", "عساكم من عوّاده"],
    defaultBarEn: ["Eid al-Adha Mubarak from Lucerne", "Pick your Eid look at Lucerne", "Wishing you a blessed Eid"],
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
