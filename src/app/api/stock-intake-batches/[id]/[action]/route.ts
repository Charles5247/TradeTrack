import { writeBatch } from "@/lib/stock-intake-batches/http";
type Context = { params: Promise<{ id: string; action: string }> };
export async function POST(request: Request, context: Context) {
  const { id, action } = await context.params;
  return writeBatch(request, id, action);
}
