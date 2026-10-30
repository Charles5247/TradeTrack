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
// Machine translated: native-speaker review required before rollout.
Object.assign(messages, {
  'Stock': { ha: 'Kaya', yo: 'Ọjà', ig: 'Ngwaahịa', pcm: 'Stock' },
  'Stock by location': { ha: 'Kaya bisa wuri', yo: 'Ọjà ní ibi kọ̀ọ̀kan', ig: 'Ngwaahịa site n’ebe', pcm: 'Stock for each location' },
  'Location': { ha: 'Wuri', yo: 'Ibi', ig: 'Ebe', pcm: 'Location' },
  'Choose a location': { ha: 'Zaɓi wuri', yo: 'Yan ibi kan', ig: 'Họrọ ebe', pcm: 'Choose location' },
  'No stock recorded at any location.': { ha: 'Ba a rubuta kaya a kowane wuri ba.', yo: 'Kò sí ọjà tí a kọ sílẹ̀ ní ibikíbi.', ig: 'Enweghị ngwaahịa edere n’ebe ọ bụla.', pcm: 'No stock record for any location.' },
  'Stock adjustment saved offline and will sync automatically.': { ha: 'An ajiye gyaran kaya ba tare da intanet ba kuma zai daidaita da kansa.', yo: 'A fi àtúnṣe ọjà pamọ́ láìsí ìkànnì, yóò sì múra pọ̀ fúnra rẹ̀.', ig: 'Echekwara mmezi ngwaahịa na-anọghị n’ịntanetị, ọ ga-emekọrịta n’onwe ya.', pcm: 'Stock adjustment save offline and e go sync by itself.' },
  'Stock adjusted successfully': { ha: 'An gyara kaya cikin nasara', yo: 'A ti ṣàtúnṣe ọjà', ig: 'Emezila ngwaahịa nke ọma', pcm: 'Stock don adjust well' },
  'Enter a valid whole-number adjustment.': { ha: 'Shigar da ingantaccen adadin lamba cikakke.', yo: 'Tẹ àtúnṣe nọ́mbà odidi tó péye.', ig: 'Tinye mmezi ọnụọgụ zuru ezu ziri ezi.', pcm: 'Enter correct whole number adjustment.' },
  'Current stock at this location: {count}': { ha: 'Kayan yanzu a wannan wurin: {count}', yo: 'Ọjà tó wà ní ibi yìí: {count}', ig: 'Ngwaahịa dị ugbu a n’ebe a: {count}', pcm: 'Current stock for this location: {count}' },
});
// Machine translated: native-speaker review required before rollout.
Object.assign(messages, {
  'Sort by': { ha: 'Jera ta', yo: 'Tò nípasẹ̀', ig: 'Hazie site na', pcm: 'Arrange by' },
  'A–Z': { ha: 'A–Z', yo: 'A–Z', ig: 'A–Z', pcm: 'A–Z' },
  'Z–A': { ha: 'Z–A', yo: 'Z–A', ig: 'Z–A', pcm: 'Z–A' },
  'Newest first': { ha: 'Sabbi da farko', yo: 'Titun jù lọ lákọ̀ọ́kọ́', ig: 'Nke kachasị ọhụrụ mbụ', pcm: 'Newest first' },
  'Oldest first': { ha: 'Tsofaffi da farko', yo: 'Àtijọ́ jù lọ lákọ̀ọ́kọ́', ig: 'Nke kacha ochie mbụ', pcm: 'Oldest first' },
  'Group by': { ha: 'Raba ta', yo: 'Pín nípasẹ̀', ig: 'Kewaa site na', pcm: 'Group by' },
  'No grouping': { ha: 'Ba a raba ba', yo: 'Kò sí pípín', ig: 'Enweghị nkewa', pcm: 'No grouping' },
  'Group by category': { ha: 'Raba ta rukuni', yo: 'Pín nípasẹ̀ ẹ̀ka', ig: 'Kewaa site na ngalaba', pcm: 'Group by category' },
  'Group by supplier': { ha: 'Raba ta mai kawo kaya', yo: 'Pín nípasẹ̀ olùpèsè', ig: 'Kewaa site na onye na-ebubata', pcm: 'Group by supplier' },
  'Uncategorised': { ha: 'Ba shi da rukuni', yo: 'Kò ní ẹ̀ka', ig: 'Enweghị ngalaba', pcm: 'No category' },
  'No supplier': { ha: 'Babu mai kawo kaya', yo: 'Kò sí olùpèsè', ig: 'Enweghị onye na-ebubata', pcm: 'No supplier' },
  '{count} products': { ha: 'Kaya {count}', yo: 'Ọjà {count}', ig: 'Ngwaahịa {count}', pcm: '{count} products' },
});
for (const [locale, copy] of Object.entries({ ha: { ...haDownloads, ...haPilot }, yo: { ...yoDownloads, ...yoPilot }, ig: { ...igDownloads, ...igPilot }, pcm: { ...pcmDownloads, ...pcmPilot } })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
