import { notFound } from "next/navigation";
import { ManualStockIntake } from "@/components/inventory/manual-stock-intake";

export default function ManualIntakePage() {
  if (process.env.NEXT_PUBLIC_STOCK_INTAKE_ENABLED !== "true") notFound();
  return <ManualStockIntake />;
}
