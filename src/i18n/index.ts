'use client';

import { createContext, useContext, useState, useCallback } from 'react';
import type { Locale } from '@/types';
import { en } from './locales/en';
import { ha } from './locales/ha';

type TranslationSet = typeof en;

const translations: Record<Locale, TranslationSet> = {
  en,
  ha,
  yo: en, // Fallback to English until Yoruba is added
  ig: en, // Fallback to English until Igbo is added
  pcm: en, // Fallback to English until Pidgin is added
};

interface I18nContextType {
  locale: Locale;
  t: TranslationSet;
  setLocale: (locale: Locale) => void;
}

import React from 'react';

export const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  t: en,
  setLocale: () => {},
});

export function I18nProvider({
  children,
  defaultLocale = 'en',
}: {
  children: React.ReactNode;
  defaultLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    if (typeof window !== 'undefined') {
      localStorage.setItem('tradetrack-locale', newLocale);
    }
  }, []);

  const value: I18nContextType = {
    locale,
    t: translations[locale] || en,
    setLocale,
  };

  return React.createElement(I18nContext.Provider, { value }, children);
}

export function useI18n() {
  return useContext(I18nContext);
}

export const SUPPORTED_LOCALES: { code: Locale; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', native: 'Igbo' },
  { code: 'pcm', name: 'Pidgin English', native: 'Pidgin' },
];
