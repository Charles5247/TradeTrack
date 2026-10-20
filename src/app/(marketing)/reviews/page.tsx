import { MerchantReviews } from '@/components/marketing/merchant-reviews';
import { TranslatedText } from '@/i18n/text';
export default function ReviewsPage(){return <section className="mx-auto max-w-5xl px-4 py-12 sm:py-20"><h1 className="tt-head mb-4 text-4xl"><TranslatedText text="Merchant reviews" /></h1><p className="mb-8"><TranslatedText text="Real experiences, in merchants’ own words." /></p><MerchantReviews editable /></section>;}
