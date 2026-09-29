import { AccessGuard } from '@/components/shared/access-guard';
import { ImportWorkbench } from '@/components/imports/import-workbench';
import Link from 'next/link';
export default function ImportsPage() {
  return <AccessGuard allow={['business_owner','admin']}><div className="space-y-4 p-4"><h1 className="text-2xl font-semibold">Business-data import</h1><Link className="underline" href="/assistant">Draft product rows with the assistant</Link><ImportWorkbench /></div></AccessGuard>;
}
