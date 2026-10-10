
import { TranslatedText } from '@/i18n/text';
import { AccessGuard } from '@/components/shared/access-guard';
import { ImportWorkbench } from '@/components/imports/import-workbench';
import Link from 'next/link';
export default function ImportsPage() {
  return <AccessGuard allow={['business_owner','admin']}><div className="min-w-0 space-y-6"><h1 className="tt-page-title"><TranslatedText text={"Business-data import"} /></h1><Link className="inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4" href="/assistant"><TranslatedText text={"Draft product rows with the assistant"} /></Link><ImportWorkbench /></div></AccessGuard>;
}
