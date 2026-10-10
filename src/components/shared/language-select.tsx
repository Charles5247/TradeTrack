'use client';

import { useI18n } from '@/i18n';
import { SUPPORTED_LOCALES } from '@/i18n/locale';
import type { Locale } from '@/types';

export function LanguageSelect() {
  const { locale, setLocale, t } = useI18n();
  return <label className="inline-flex min-w-0 items-center gap-2 text-sm">
    <span className="sr-only">{t.settings.language}</span>
    <select aria-label={t.settings.language} value={locale} onChange={e => setLocale(e.target.value as Locale)} className="h-9 max-w-36 rounded-md border border-border bg-background px-2 text-foreground">
      {SUPPORTED_LOCALES.map(item => <option key={item.code} value={item.code}>{item.native}</option>)}
    </select>
  </label>;
}
