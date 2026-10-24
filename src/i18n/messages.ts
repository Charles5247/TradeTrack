import type { Locale } from '@/types';
import catalog from './messages.json';
import { contactReviewCopy } from './contact-review-copy';
import { industryCopy } from './industry-copy';

import { downloadCopy as haDownloads, pilotCopy as haPilot } from './locales/ha';
import { downloadCopy as yoDownloads, pilotCopy as yoPilot } from './locales/yo';
import { downloadCopy as igDownloads, pilotCopy as igPilot } from './locales/ig';
import { downloadCopy as pcmDownloads, pilotCopy as pcmPilot } from './locales/pcm';

export const messages: Record<string, Partial<Record<Exclude<Locale, 'en'>, string>>> = { ...catalog, ...contactReviewCopy, ...industryCopy };
// Machine translated: native-speaker review required before rollout.
messages['Trial reminder: day {day} of 30.'] = {
  ha: 'Tunatarwar gwaji: rana ta {day} cikin 30.',
  yo: 'Ìránnilétí ìdánwò: ọjọ́ {day} nínú 30.',
  ig: 'Ncheta nnwale: ụbọchị {day} n’ime 30.',
  pcm: 'Trial reminder: na day {day} out of 30.',
};
for (const [locale, copy] of Object.entries({ ha: { ...haDownloads, ...haPilot }, yo: { ...yoDownloads, ...yoPilot }, ig: { ...igDownloads, ...igPilot }, pcm: { ...pcmDownloads, ...pcmPilot } })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
