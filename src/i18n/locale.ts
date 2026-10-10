import type { Locale } from '@/types';

export const LOCALE_STORAGE_KEY = 'TracKasuwa-locale';
export const SUPPORTED_LOCALES: { code: Locale; name: string; native: string }[] = [
  { code: 'en', name: 'English', native: 'English' },
  { code: 'ha', name: 'Hausa', native: 'Hausa' },
  { code: 'yo', name: 'Yoruba', native: 'Yorùbá' },
  { code: 'ig', name: 'Igbo', native: 'Igbo' },
  { code: 'pcm', name: 'Nigerian Pidgin', native: 'Naija Pidgin' },
];
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && ['en', 'ha', 'yo', 'ig', 'pcm'].includes(value);
}
