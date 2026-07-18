"use client";

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
} from "react";
import type { Locale } from "@/types";
import { en } from "./locales/en";
import { ha } from "./locales/ha";
import { yo } from "./locales/yo";
import { ig } from "./locales/ig";
import { pcm } from "./locales/pcm";

type TranslationSet = typeof en;

const translations: Record<Locale, TranslationSet> = {
  en,
  ha,
  yo, // Currently mirrors English - see src/i18n/locales/yo.ts
  ig, // Currently mirrors English - see src/i18n/locales/ig.ts
  pcm, // Currently mirrors English - see src/i18n/locales/pcm.ts
};

const LOCALE_STORAGE_KEY = "tradetrack-locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && stored in translations) return stored as Locale;
  } catch {
    // localStorage unavailable
  }
  return "en";
}

// ── Context ───────────────────────────────────────────────────

interface I18nContextType {
  locale: Locale;
  t: TranslationSet;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nContextType>({
  locale: "en",
  t: en,
  setLocale: () => {},
});

// ── Provider ──────────────────────────────────────────────────

export function I18nProvider({
  children,
  defaultLocale,
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  // Use the cookie‑based defaultLocale for the initial render.
  // If no cookie exists, fall back to localStorage (client) or 'en'.
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (defaultLocale) return defaultLocale;
    return getInitialLocale();
  });

  // After mount, sync with localStorage (in case it was changed in another tab)
  useEffect(() => {
    const stored = getInitialLocale();
    if (stored !== locale) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // Storage unavailable
    }

    // Keep the cookie in sync so the server renders the correct locale on next request
    if (typeof document !== "undefined") {
      document.cookie = `NEXT_LOCALE=${newLocale};path=/;max-age=31536000`;
    }

    // Update Zustand store if needed
    import("@/store")
      .then(({ useUIStore }) => {
        useUIStore.getState().setLocale(newLocale);
      })
      .catch(() => {});
  }, []);

  const value: I18nContextType = {
    locale,
    t: translations[locale] ?? en,
    setLocale,
  };

  return React.createElement(I18nContext.Provider, { value }, children);
}

// ── Hook ──────────────────────────────────────────────────────

export function useI18n() {
  return useContext(I18nContext);
}

// ── Supported locales ─────────────────────────────────────────

export const SUPPORTED_LOCALES: {
  code: Locale;
  name: string;
  native: string;
}[] = [
  { code: "en", name: "English", native: "English" },
  { code: "ha", name: "Hausa", native: "Hausa" },
  { code: "yo", name: "Yoruba", native: "Yorùbá" },
  { code: "ig", name: "Igbo", native: "Igbo" },
  { code: "pcm", name: "Pidgin English", native: "Pidgin" },
];
