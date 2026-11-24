import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "./en";
import { ar } from "./ar";

export type Translations = Omit<typeof en, "dir"> & { dir: "ltr" | "rtl" };
export type Language = "ar" | "en";

type Area = "store" | "admin";

interface LanguageStore {
  /** The language of the area being shown right now (shop or admin). */
  language: Language;
  /** Changes the language of the area being shown; the other area keeps its own. */
  setLanguage: (lang: Language) => void;
  t: Translations;
  /** The shop and the admin area each remember their own language. */
  storeLanguage: Language;
  adminLanguage: Language;
  area: Area;
  setArea: (area: Area) => void;
}

const translations: Record<Language, Translations> = { en, ar };

function applyDir(lang: Language) {
  const t = translations[lang];
  document.documentElement.dir = t.dir;
  document.documentElement.lang = t.lang;
}

const currentArea = (): Area => (typeof window !== "undefined" && window.location.pathname.startsWith("/admin") ? "admin" : "store");

export const useLanguage = create<LanguageStore>()(
  persist(
    (set, get) => ({
      // The shop opens in English (with category and product names kept in Arabic);
      // a customer can switch it to full Arabic. The admin area opens in Arabic.
      language: "en" as Language,
      t: translations["en"],
      storeLanguage: "en" as Language,
      adminLanguage: "ar" as Language,
      area: "store" as Area,
      setLanguage: (lang: Language) => {
        applyDir(lang);
        set(get().area === "admin" ? { language: lang, t: translations[lang], adminLanguage: lang } : { language: lang, t: translations[lang], storeLanguage: lang });
      },
      setArea: (area: Area) => {
        if (get().area === area) return;
        const lang = area === "admin" ? get().adminLanguage : get().storeLanguage;
        applyDir(lang);
        set({ area, language: lang, t: translations[lang] });
      },
    }),
    {
      name: "lucerne-lang",
      version: 2,
      partialize: (state) => ({ storeLanguage: state.storeLanguage, adminLanguage: state.adminLanguage }),
      // Before version 2 there was one language for everything. It becomes the admin's
      // language, so the admin area looks exactly as it did; the shop starts in English.
      migrate: (persisted: any, version) => {
        if (version < 2) {
          const old: Language = persisted?.language === "en" ? "en" : "ar";
          return { storeLanguage: "en", adminLanguage: old };
        }
        return persisted;
      },
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          const area = currentArea();
          const lang = area === "admin" ? state.adminLanguage : state.storeLanguage;
          state.area = area;
          state.language = lang;
          state.t = translations[lang];
          applyDir(lang);
        }
      },
    }
  )
);

