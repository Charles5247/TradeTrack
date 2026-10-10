import type { Locale } from '@/types';
import { en } from './locales/en';
import { ha } from './locales/ha';
import { yo } from './locales/yo';
import { ig } from './locales/ig';
import { pcm } from './locales/pcm';
import { messages } from './messages';

const catalogs = { en, ha, yo, ig, pcm };
const normalize = (text: string) => text.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en');
const memory: Record<Locale, Map<string, string>> = { en: new Map(), ha: new Map(), yo: new Map(), ig: new Map(), pcm: new Map() };
function index(source: Record<string, unknown>, target: Record<string, unknown>, result: Map<string, string>) {
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string' && typeof target[key] === 'string') result.set(normalize(value), target[key] as string);
    else if (value && typeof value === 'object' && target[key] && typeof target[key] === 'object') index(value as Record<string, unknown>, target[key] as Record<string, unknown>, result);
  }
}
for (const locale of Object.keys(catalogs) as Locale[]) index(en, catalogs[locale], memory[locale]);
for (const [source, values] of Object.entries(messages)) {
  for (const [locale, value] of Object.entries(values)) if (value) memory[locale as Locale].set(normalize(source), value);
}

export function translateCopy(locale: Locale, text: string): string {
  if (locale === 'en') return text;
  const exact = memory[locale]?.get(normalize(text));
  if (exact) return exact;
  // Required markers and label colons are presentation, not separate messages.
  const label = text.match(/^(.*?)(\s*[:*])$/);
  if (label) {
    const translated = memory[locale]?.get(normalize(label[1]));
    if (translated) return translated + label[2];
  }
  return text;
}
