import type { Locale } from '@/types';
import catalog from './messages.json';

import { downloadCopy as haDownloads } from './locales/ha';
import { downloadCopy as yoDownloads } from './locales/yo';
import { downloadCopy as igDownloads } from './locales/ig';
import { downloadCopy as pcmDownloads } from './locales/pcm';

export const messages: Record<string, Partial<Record<Exclude<Locale, 'en'>, string>>> = { ...catalog };
for (const [locale, copy] of Object.entries({ ha: haDownloads, yo: yoDownloads, ig: igDownloads, pcm: pcmDownloads })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
