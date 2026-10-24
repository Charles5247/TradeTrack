import { apiContext } from "@/lib/auth/api-context";
import { intakeActionSchema } from "@/lib/stock-intake/contracts";
import { z } from "zod";
import { intakeErrorResponse } from "@/lib/stock-intake/http";

export async function GET(request: Request) {
  try {
    const { db, org } = await apiContext();
    const params = new URL(request.url).searchParams;
    const id = params.get("id");
    if (id) {
      z.guid().parse(id);
      const { data, error } = await db
        .from("stock_intakes")
        .select("*")
        .eq("organization_id", org)
        .eq("id", id)
        .single();
      if (error) {
        if (error.code === "PGRST116")
          return Response.json(
            { error: "Receipt unavailable" },
            { status: 404 },
          );
        throw error;
      }
      if (data.status === "posted")
        return Response.json(data, {
          headers: { "Cache-Control": "private, no-store" },
        });
      const products = [
        ...new Set(
          data.document.lines
            .map((line) => line.product_id)
            .filter((id): id is string => Boolean(id)),
        ),
      ];
      let currentStock: { product_id: string; quantity: number }[] | null = [];
      let stockWarning: string | null = null;
      // Bound REST query length and verify coverage before treating an absent
      // position as zero. Snapshot failure must not hide the saved receipt.
      try {
        for (let start = 0; start < products.length; start += 100) {
          const stock = await db
            .from("inventory")
            .select("product_id,quantity", { count: "exact" })
            .eq("organization_id", org)
            .eq("warehouse_id", data.document.warehouse_id)
            .in("product_id", products.slice(start, start + 100));
          if (
            stock.error ||
            stock.count === null ||
            stock.count !== stock.data?.length
          )
            throw new Error("Stock snapshot incomplete");
          currentStock.push(...stock.data);
        }
      } catch {
        currentStock = null;
        stockWarning =
          "Current stock snapshot unavailable. The saved receipt is retained; quantities are checked again when posting.";
      }
      return Response.json(
        { ...data, current_stock: currentStock, stock_warning: stockWarning },
        { headers: { "Cache-Control": "private, no-store" } },
      );
    }
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(params.get("offset") ?? 0);
    const { data, error } = await db
      .from("stock_intakes")
      .select("*")
      .eq("organization_id", org)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + 20);
    if (error) throw error;
    return Response.json(
      {
        receipts: data.slice(0, 20),
        nextOffset: data.length > 20 ? offset + 20 : null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin)
      return Response.json({ error: "Foreign origin denied" }, { status: 403 });
    if (
      !request.headers
        .get("content-type")
        ?.toLowerCase()
        .startsWith("application/json")
    )
      return Response.json({ error: "Use application/json" }, { status: 415 });
    const { db } = await apiContext();
    // Read bounded bytes even if a sender omits Content-Length.
    if (!request.body)
      return Response.json(
        { error: "Receipt command required" },
        { status: 400 },
      );
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 2 * 1024 * 1024) {
          await reader.cancel();
          return Response.json(
            { error: "Receipt command exceeds 2 MiB" },
            { status: 413 },
          );
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const body = intakeActionSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString("utf8")),
    );
    let response;
    if (body.action === "save")
      response = await db.rpc("save_stock_intake", {
        receipt_id: body.id,
        expected_revision: body.revision,
        receipt_document: body.document,
      });
    else if (body.action === "approve")
      response = await db.rpc("approve_stock_intake", {
        receipt_id: body.id,
        expected_revision: body.revision,
        expected_hash: body.hash,
      });
    else
      response = await db.rpc("post_stock_intake", {
        receipt_id: body.id,
        approval_id: body.approval_id,
      });
    if (response.error)
      return Response.json(
        { error: response.error.message },
        { status: response.error.code === "42501" ? 403 : 409 },
      );
    return Response.json(response.data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
