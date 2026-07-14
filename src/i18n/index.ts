'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import type { Locale } from '@/types';
import { en } from './locales/en';
import { ha } from './locales/ha';

type TranslationSet = typeof en;

const translations: Record<Locale, TranslationSet> = {
  en,
  ha,
  yo: en,   // Fallback to English until Yoruba is added
  ig: en,   // Fallback to English until Igbo is added
  pcm: en,  // Fallback to English until Pidgin is added
};

const LOCALE_STORAGE_KEY = 'tradetrack-locale';

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (stored && stored in translations) return stored as Locale;
  } catch {
    // localStorage unavailable
  }
  return 'en';
}

// ── Context ───────────────────────────────────────────────────

interface I18nContextType {
  locale: Locale;
  t: TranslationSet;
  setLocale: (locale: Locale) => void;
}

export const I18nContext = createContext<I18nContextType>({
  locale: 'en',
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
  // Initialise from localStorage so language persists across reloads
  const [locale, setLocaleState] = useState<Locale>(() => {
    // defaultLocale prop takes priority (for SSR), then localStorage, then 'en'
    if (defaultLocale) return defaultLocale;
    return getInitialLocale();
  });

  // Re-read localStorage on mount in case useState ran on SSR
  useEffect(() => {
    const stored = getInitialLocale();
    if (stored !== locale) setLocaleState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // Storage unavailable
    }
    // Also update the Zustand UI store so other components stay in sync
    import('@/store').then(({ useUIStore }) => {
      useUIStore.getState().setLocale(newLocale);
    }).catch(() => {});
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

export const SUPPORTED_LOCALES: { code: Locale; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', native: 'Igbo' },
  { code: 'pcm', name: 'Pidgin English', native: 'Pidgin' },
];
