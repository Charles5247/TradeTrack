import type { Locale } from '@/types';
import catalog from './messages.json';

import { downloadCopy as haDownloads, pilotCopy as haPilot } from './locales/ha';
import { downloadCopy as yoDownloads, pilotCopy as yoPilot } from './locales/yo';
import { downloadCopy as igDownloads, pilotCopy as igPilot } from './locales/ig';
import { downloadCopy as pcmDownloads, pilotCopy as pcmPilot } from './locales/pcm';

export const messages: Record<string, Partial<Record<Exclude<Locale, 'en'>, string>>> = { ...catalog };
for (const [locale, copy] of Object.entries({ ha: { ...haDownloads, ...haPilot }, yo: { ...yoDownloads, ...yoPilot }, ig: { ...igDownloads, ...igPilot }, pcm: { ...pcmDownloads, ...pcmPilot } })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
