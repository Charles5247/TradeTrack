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
// Machine translated: native-speaker review required before rollout.
Object.assign(messages, {
  'Notification preferences': { ha: 'Zaɓin sanarwa', yo: 'Àwọn ààyò ìfitónilétí', ig: 'Nhọrọ ngosi', pcm: 'Notification choice' },
  'In-app alerts are on by default. Choose email or SMS separately for each event.': { ha: 'Sanarwar cikin manhaja tana kunne. Zaɓi imel ko SMS ga kowane lamari.', yo: 'Ìfitónilétí inú app wà ní ṣíṣí. Yan imeeli tàbí SMS fún ìṣẹ̀lẹ̀ kọ̀ọ̀kan.', ig: 'Ọkwa n’ime ngwa dị na ndabara. Họrọ email ma ọ bụ SMS maka ihe omume ọ bụla.', pcm: 'In-app alert dey on. Choose email or SMS for each event.' },
  'Every-sale email and SMS alerts are off by default because they can create high message volume and SMS cost.': { ha: 'Imel da SMS na kowace ciniki a kashe suke saboda yawan saƙo da kuɗi.', yo: 'Imeeli àti SMS fún gbogbo títà wà ní pípa nítorí ọ̀pọ̀ ìránṣẹ́ àti owó SMS.', ig: 'Email na SMS maka ire ọ bụla gbanyụrụ n’ihi ọtụtụ ozi na ụgwọ SMS.', pcm: 'Email and SMS for every sale dey off because messages and cost fit plenty.' },
  'Notification preferences need the notification database update before they can be saved.': { ha: 'Ana buƙatar sabunta rumbun sanarwa kafin ajiya.', yo: 'A nílò ìmúdójúìwọ̀n ibi-ipamọ́ ìfitónilétí kí a tó fipamọ́.', ig: 'A chọrọ mmelite nchekwa ngosi tupu echekwaa ya.', pcm: 'Database update need happen before preference fit save.' },
  'Event': { ha: 'Lamari', yo: 'Ìṣẹ̀lẹ̀', ig: 'Ihe omume', pcm: 'Event' },
  'Event type': { ha: 'Nau’in lamari', yo: 'Irú ìṣẹ̀lẹ̀', ig: 'Ụdị ihe omume', pcm: 'Event type' },
  'All event types': { ha: 'Duk nau’in lamari', yo: 'Gbogbo irú ìṣẹ̀lẹ̀', ig: 'Ụdị ihe omume niile', pcm: 'All event types' },
  'Staff member': { ha: 'Ma’aikaci', yo: 'Òṣìṣẹ́', ig: 'Onye ọrụ', pcm: 'Staff member' },
  'All staff': { ha: 'Duk ma’aikata', yo: 'Gbogbo òṣìṣẹ́', ig: 'Ndị ọrụ niile', pcm: 'All staff' },
  'Open notification inbox': { ha: 'Buɗe akwatin sanarwa', yo: 'Ṣí àpótí ìfitónilétí', ig: 'Mepee igbe ngosi', pcm: 'Open notification inbox' },
  'SMS is unavailable until a provider, price and business-funded credits are configured.': { ha: 'SMS ba ya samuwa sai an saita mai bayarwa, farashi da kuɗin kamfani.', yo: 'SMS kò sí títí a fi ṣètò olùpèsè, iye àti kirẹditi ilé-iṣẹ́.', ig: 'SMS adịghị ruo mgbe ahaziri onye na-eweta, ọnụahịa na kredit azụmahịa.', pcm: 'SMS no dey until provider, price and business credits set.' },
  'SMS cost per message: ₦{amount}. Credits remaining: {credits}.': { ha: 'Kuɗin SMS: ₦{amount}. Ragowar kiredit: {credits}.', yo: 'Owó SMS: ₦{amount}. Kirẹditi tó kù: {credits}.', ig: 'Ọnụ SMS: ₦{amount}. Kredit fọdụrụ: {credits}.', pcm: 'SMS cost: ₦{amount}. Credits remain: {credits}.' },
  'SMS credits': { ha: 'Kiredit SMS', yo: 'Kirẹditi SMS', ig: 'Kredit SMS', pcm: 'SMS credits' },
  'Payment phone number': { ha: 'Lambar wayar biyan kuɗi', yo: 'Nọ́mbà fóònù ìsanwó', ig: 'Nọmba ekwentị ịkwụ ụgwọ', pcm: 'Payment phone number' },
  'Buy SMS credits': { ha: 'Sayi kiredit SMS', yo: 'Ra kirẹditi SMS', ig: 'Zụta kredit SMS', pcm: 'Buy SMS credits' },
  'staff login': { ha: 'shigar ma’aikaci', yo: 'ìwọlé òṣìṣẹ́', ig: 'nbanye onye ọrụ', pcm: 'staff login' },
  'sale made': { ha: 'an yi ciniki', yo: 'títà ṣẹlẹ̀', ig: 'emere ire', pcm: 'sale made' },
  'low stock': { ha: 'kaya ya yi ƙasa', yo: 'ọjà kéré', ig: 'ngwaahịa pere mpe', pcm: 'low stock' },
  'stock in': { ha: 'shigar kaya', yo: 'ọjà wọlé', ig: 'ngwaahịa batara', pcm: 'stock in' },
  'stock adjustment': { ha: 'gyaran kaya', yo: 'àtúnṣe ọjà', ig: 'mmezi ngwaahịa', pcm: 'stock adjustment' },
  'discount requested': { ha: 'an nemi ragi', yo: 'béèrè ẹ̀dinwó', ig: 'rịọrọ mbelata', pcm: 'discount requested' },
  'discount approved': { ha: 'an amince da ragi', yo: 'fọwọ́sí ẹ̀dinwó', ig: 'kwadoro mbelata', pcm: 'discount approved' },
  'discount rejected': { ha: 'an ƙi ragi', yo: 'kọ ẹ̀dinwó', ig: 'jụrụ mbelata', pcm: 'discount rejected' },
  'discount given': { ha: 'an ba da ragi', yo: 'fún ní ẹ̀dinwó', ig: 'nyere mbelata', pcm: 'discount given' },
  'pending payment': { ha: 'biyan kuɗi na jira', yo: 'ìsanwó tó ń dúró', ig: 'ịkwụ ụgwọ na-echere', pcm: 'pending payment' },
  'pending transfer': { ha: 'canja wuri na jira', yo: 'gbígbé tó ń dúró', ig: 'mbufe na-echere', pcm: 'pending transfer' },
  'purchase order status': { ha: 'matsayin odar saye', yo: 'ipò àṣẹ rírà', ig: 'ọnọdụ iwu ịzụta', pcm: 'purchase order status' },
  'import finished': { ha: 'shigo da bayanai ya ƙare', yo: 'gbígbé wọlé parí', ig: 'mbubata agwụla', pcm: 'import finished' },
  'import failed': { ha: 'shigo da bayanai ya gaza', yo: 'gbígbé wọlé kùnà', ig: 'mbubata dara', pcm: 'import failed' },
  'payment confirmed': { ha: 'an tabbatar da biyan kuɗi', yo: 'ìsanwó fìdí múlẹ̀', ig: 'akwadoro ịkwụ ụgwọ', pcm: 'payment confirmed' },
  'payment failed': { ha: 'biyan kuɗi ya gaza', yo: 'ìsanwó kùnà', ig: 'ịkwụ ụgwọ dara', pcm: 'payment failed' },
  'trial ending': { ha: 'gwaji yana ƙarewa', yo: 'ìdánwò ń parí', ig: 'nnwale na-agwụ', pcm: 'trial ending' },
  'trial expired': { ha: 'gwaji ya ƙare', yo: 'ìdánwò parí', ig: 'nnwale agwụla', pcm: 'trial expired' },
  'subscription changed': { ha: 'an canja biyan kuɗi', yo: 'ìforúkọsílẹ̀ yípadà', ig: 'ndebanye gbanwere', pcm: 'subscription changed' },
  'sync failed': { ha: 'daidaitawa ta gaza', yo: 'ìmúdọ́gba kùnà', ig: 'mmekọrịta dara', pcm: 'sync failed' },
  'app update': { ha: 'sabunta manhaja', yo: 'ìmúdójúìwọ̀n app', ig: 'mmelite ngwa', pcm: 'app update' },
  'low sms balance': { ha: 'ƙarancin kiredit SMS', yo: 'kirẹditi SMS kéré', ig: 'kredit SMS pere mpe', pcm: 'SMS credits low' },
});
for (const [locale, copy] of Object.entries({ ha: { ...haDownloads, ...haPilot }, yo: { ...yoDownloads, ...yoPilot }, ig: { ...igDownloads, ...igPilot }, pcm: { ...pcmDownloads, ...pcmPilot } })) {
  for (const [source, value] of Object.entries(copy)) {
    messages[source] = { ...messages[source], [locale]: value };
  }
}
