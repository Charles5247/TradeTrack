import { apiContext } from "@/lib/auth/api-context";
import { z } from "zod";
import { intakeErrorResponse } from "@/lib/stock-intake/http";

export async function GET(request: Request) {
  try {
    const { db, org } = await apiContext();
    const params = new URL(request.url).searchParams;
    const search = z
      .string()
      .trim()
      .max(100)
      .parse(params.get("q") ?? "");
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(params.get("offset") ?? 0);
    let products = db
      .from("products")
      .select("id,name,sku,barcode,make,status,cost_price,selling_price,stock_unit,variant_size,variant_colour,model", {
        count: "exact",
      })
      .eq("organization_id", org)
      .eq("status", "active")
      .eq("medical_stock_managed", false)
      .order("name")
      .order("id")
      .range(offset, offset + 25);
    // Treat wildcard metacharacters as literal search text, not filter syntax.
    if (search)
      products = products.ilike(
        "name",
        `%${search.replace(/[\\%_]/g, "\\$&")}%`,
      );
    const [found, locations] = await Promise.all([
      products,
      db
        .from("warehouses")
        .select("id,name", { count: "exact" })
        .eq("organization_id", org)
        .order("name")
        .limit(1001),
    ]);
    if (found.error) throw found.error;
    if (locations.error) throw locations.error;
    if (
      locations.count === null ||
      locations.count !== locations.data.length ||
      locations.count > 1000
    )
      return Response.json(
        {
          error:
            "The complete location list is unavailable or exceeds the current 1,000-location limit.",
        },
        { status: 422 },
      );
    if (
      found.count === null ||
      (found.data.length === 0 && found.count > offset)
    )
      throw new Error("Catalog page incomplete");
    const visible = found.data.slice(0, 25),
      hasMore = offset + visible.length < found.count;
    return Response.json(
      {
        products: visible,
        hasMore,
        nextOffset: hasMore ? offset + visible.length : null,
        warehouses: locations.data,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
