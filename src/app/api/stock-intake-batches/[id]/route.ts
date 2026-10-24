import { readBatch, writeBatch } from "@/lib/stock-intake-batches/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return readBatch(request, (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return writeBatch(request, (await context.params).id);
}
