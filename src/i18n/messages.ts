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
// Machine translated: native-speaker review required before rollout.
Object.assign(messages, {
  'No categories yet.': { ha: 'Babu rukuni tukuna.', yo: 'Kò sí ẹ̀ka kankan síbẹ̀.', ig: 'Enweghị ngalaba ugbu a.', pcm: 'No category dey yet.' },
  'Add category': { ha: 'Ƙara rukuni', yo: 'Fi ẹ̀ka kún un', ig: 'Tinye ngalaba', pcm: 'Add category' },
  'Category name': { ha: 'Sunan rukuni', yo: 'Orúkọ ẹ̀ka', ig: 'Aha ngalaba', pcm: 'Category name' },
  'Save category': { ha: 'Ajiye rukuni', yo: 'Fi ẹ̀ka pamọ́', ig: 'Chekwaa ngalaba', pcm: 'Save category' },
  'Category created': { ha: 'An ƙirƙiri rukuni', yo: 'A ti dá ẹ̀ka sílẹ̀', ig: 'E mepụtala ngalaba', pcm: 'Category don create' },
  'Could not create category': { ha: 'Ba a iya ƙirƙirar rukuni ba', yo: 'A kò lè dá ẹ̀ka sílẹ̀', ig: 'Enweghị ike imepụta ngalaba', pcm: 'Category no fit create' },
});
// Machine translated: native-speaker review required before rollout.
messages['Add up to 1,500 products during your 30-day free trial.'] = {
  ha: 'Ƙara kaya har 1,500 a lokacin gwajin kyauta na kwanaki 30.',
  yo: 'Fi ẹrù tó 1,500 kún un ní àkókò ìdánwò ọ̀fẹ́ ọjọ́ 30 rẹ.',
  ig: 'Tinye ngwaahịa ruru 1,500 n’oge nnwale efu ụbọchị 30 gị.',
  pcm: 'Add reach 1,500 products during your 30-day free trial.',
};
for (const [locale, copy] of Object.entries({ ha: { ...haDownloads, ...haPilot }, yo: { ...yoDownloads, ...yoPilot }, ig: { ...igDownloads, ...igPilot }, pcm: { ...pcmDownloads, ...pcmPilot } })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
