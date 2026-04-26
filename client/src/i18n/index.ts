import { create } from "zustand";
import { persist } from "zustand/middleware";
import { en } from "./en";
import { ar } from "./ar";

export type Translations = typeof en;
export type Language = "ar" | "en";

interface LanguageStore {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: Translations;
}

const translations: Record<Language, Translations> = { en, ar };

function applyDir(lang: Language) {
  const t = translations[lang];
  document.documentElement.dir = t.dir;
  document.documentElement.lang = t.lang;
}

export const useLanguage = create<LanguageStore>()(
  persist(
    (set) => ({
      language: "ar" as Language,
      t: translations["ar"],
      setLanguage: (lang: Language) => {
        applyDir(lang);
        set({ language: lang, t: translations[lang] });
      },
    }),
    {
      name: "lucerne-lang",
      partialize: (state) => ({ language: state.language }),
      onRehydrateStorage: () => (state, error) => {
        if (state && !error) {
          applyDir(state.language);
          state.t = translations[state.language];
        }
      },
    }
  )
);
