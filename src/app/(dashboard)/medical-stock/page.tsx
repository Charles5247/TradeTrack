import { MedicalStockWorkspace } from '@/components/medical/stock-workspace';

export default function MedicalStockPage() {
 if(process.env.MEDICAL_STOCK_PILOT_ENABLED!=='true')return <div className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Medical stock pilot</h1><p>The medical workflow is undergoing acceptance testing and is not enabled for live dispensing.</p><p>Continue using your approved pharmacy procedures until the pilot has been verified.</p></div>;
 return <MedicalStockWorkspace />;
}
