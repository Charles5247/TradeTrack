'use client';

import type { ReactNode } from 'react';
import { useI18n } from './index';
import { translateCopy } from './translate';

/** Source-owned UI copy only. Do not pass customer names or editable records. */
export function useCopy() {
  const { locale } = useI18n();
  return (text: string, values?: Record<string, string | number>) => {
    const translated = translateCopy(locale, text);
    return values ? translated.replace(/\{(\w+)\}/g, (token, key: string) => values[key] === undefined ? token : String(values[key])) : translated;
  };
}

export function TranslatedText({ text }: { text: string }) {
  const copy = useCopy();
  return copy(text);
}

export function TranslatedLabel({ children }: { children: ReactNode }) {
  const copy = useCopy();
  return typeof children === 'string' ? copy(children) : children;
}
