import { notFound } from "next/navigation";
import { BatchStockIntake } from "@/components/inventory/batch-stock-intake";

export default function BatchIntakePage(){
 if(process.env.NEXT_PUBLIC_STOCK_INTAKE_BATCHES_ENABLED!=="true")notFound();
 return <BatchStockIntake/>;
}
