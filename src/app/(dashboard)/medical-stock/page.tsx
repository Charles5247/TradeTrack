import { MedicalStockWorkspace } from '@/components/medical/stock-workspace';
import { medicalAccess } from '@/lib/medical/access';
import { redirect } from 'next/navigation';

export default async function MedicalStockPage() {
 const {client,status}=await medicalAccess();
 if(!client)redirect(status===401?'/login':'/dashboard');
 if(process.env.MEDICAL_STOCK_PILOT_ENABLED!=='true')return <div className="mx-auto max-w-3xl space-y-4 p-6"><h1 className="text-2xl font-semibold">Medical stock pilot</h1><p>The medical workflow is undergoing acceptance testing and is not enabled for live dispensing.</p><p>Continue using your approved pharmacy procedures until the pilot has been verified.</p></div>;
 return <MedicalStockWorkspace />;
}
