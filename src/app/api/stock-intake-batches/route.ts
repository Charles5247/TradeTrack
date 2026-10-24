import { readBatch, writeBatch } from "@/lib/stock-intake-batches/http";
export const GET = (request: Request) => readBatch(request);
export const POST = (request: Request) => writeBatch(request);
