import { AccessGuard } from '@/components/shared/access-guard';
import { ImportWorkbench } from '@/components/imports/import-workbench';
export default function ImportsPage() {
  return <AccessGuard allow={['business_owner','admin']}><div className="space-y-4 p-4"><h1 className="text-2xl font-semibold">Business-data import</h1><ImportWorkbench /></div></AccessGuard>;
}
