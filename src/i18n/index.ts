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
import { isLocale, LOCALE_STORAGE_KEY } from './locale';

type TranslationSet = typeof en;

const translations: Record<Locale, TranslationSet> = {
  en,
  ha,
  yo,
  ig,
  pcm,
};

function getStoredLocale(): Locale | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    // localStorage unavailable
  }
  return null;
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
    return isLocale(defaultLocale) ? defaultLocale : 'en';
  });

  // After mount, sync with localStorage (in case it was changed in another tab)
  useEffect(() => {
    const stored = getStoredLocale();
    if (stored && stored !== locale) {
      setLocaleState(stored);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    if (!isLocale(newLocale)) return;
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

  useEffect(() => {
    document.documentElement.lang = locale;
    document.cookie = `NEXT_LOCALE=${locale};path=/;max-age=31536000;SameSite=Lax`;
  }, [locale]);

  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key === LOCALE_STORAGE_KEY && isLocale(event.newValue)) setLocaleState(event.newValue);
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
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

export { SUPPORTED_LOCALES } from './locale';
