import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/stock-intakes/route";
import { apiContext } from "@/lib/auth/api-context";
import { GET as catalogGET } from "@/app/api/stock-intakes/catalog/route";
vi.mock("@/lib/auth/api-context", () => ({ apiContext: vi.fn() }));
const id = "01000000-0000-4000-8000-000000000001";
const rpc = vi.fn();
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/stock-intakes", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}
describe("manual receipt HTTP boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiContext).mockResolvedValue({
      db: { rpc },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
  });
  it("rejects foreign origin and non-JSON requests before authorization or commands", async () => {
    expect(
      (await POST(request({}, { origin: "https://foreign.invalid" }))).status,
    ).toBe(403);
    expect(
      (await POST(request({}, { "content-type": "text/plain" }))).status,
    ).toBe(415);
    expect(apiContext).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("accepts legacy PostgreSQL UUID identifiers without weakening command authorization", async () => {
    const legacy = "01000000-0000-0000-0000-000000000001";
    rpc.mockResolvedValueOnce({
      data: { receipt_id: legacy, status: "posted" },
      error: null,
    });
    expect(
      (await POST(request({ action: "post", id: legacy, approval_id: legacy })))
        .status,
    ).toBe(200);
    expect(rpc).toHaveBeenCalledWith("post_stock_intake", {
      receipt_id: legacy,
      approval_id: legacy,
    });
  });
  it("returns legacy PostgreSQL location identifiers for the selector", async () => {
    const legacy = "40000000-0000-0000-0000-000000000001";
    const builder = {
      select: () => builder,
      eq: () => builder,
      order: () => builder,
      range: async () => ({ data: [], count: 0, error: null }),
      limit: async () => ({
        data: [{ id: legacy, name: "Legacy location" }],
        count: 1,
        error: null,
      }),
    };
    vi.mocked(apiContext).mockResolvedValueOnce({
      db: { from: () => builder },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
    const response = await catalogGET(
      new Request("http://localhost/api/stock-intakes/catalog"),
    );
    expect(response.status).toBe(200);
    expect((await response.json()).warehouses[0].id).toBe(legacy);
  });
  it("keeps catalog variants reachable when a provider returns fewer rows than requested", async () => {
    const rows = Array.from({ length: 30 }, (_, index) => ({
      id: `product-${index}`,
      name: "Same name",
      sku: `SKU-${index}`,
    }));
    const products = {
      select: () => products,
      eq: () => products,
      order: () => products,
      range: async (start: number) => ({
        data: rows.slice(start, start + 10),
        count: 30,
        error: null,
      }),
    };
    const locations = {
      select: () => locations,
      eq: () => locations,
      order: () => locations,
      limit: async () => ({ data: [], count: 0, error: null }),
    };
    vi.mocked(apiContext).mockResolvedValue({
      db: {
        from: (table: string) => (table === "products" ? products : locations),
      },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
    const seen: string[] = [];
    for (const offset of [0, 10, 20]) {
      const response = await catalogGET(
        new Request(
          `http://localhost/api/stock-intakes/catalog?offset=${offset}`,
        ),
      );
      const result = await response.json();
      expect(response.status).toBe(200);
      seen.push(
        ...result.products.map((product: { id: string }) => product.id),
      );
      expect(result.nextOffset).toBe(offset === 20 ? null : offset + 10);
    }
    expect(new Set(seen).size).toBe(30);
  });
  it("distinguishes a missing receipt from an unavailable receipt service", async () => {
    const single = vi.fn().mockResolvedValue({
      data: null,
      error: { code: "PGRST116", message: "No rows" },
    });
    const builder = { select: () => builder, eq: () => builder, single };
    vi.mocked(apiContext).mockResolvedValue({
      db: { from: () => builder },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
    expect(
      (await GET(new Request(`http://localhost/api/stock-intakes?id=${id}`)))
        .status,
    ).toBe(404);
    single.mockResolvedValue({
      data: null,
      error: { code: "08006", message: "Connection failed" },
    });
    const unavailable = await GET(
      new Request(`http://localhost/api/stock-intakes?id=${id}`),
    );
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error).toContain("retained");
  });
  it("loads every stock position using bounded counted reads for a long receipt", async () => {
    const ids = Array.from(
      { length: 250 },
      (_, index) =>
        `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    );
    const receipt = {
      id,
      status: "approved",
      document: {
        warehouse_id: id,
        lines: ids.map((product_id) => ({ product_id })),
      },
    };
    const header = {
      select: () => header,
      eq: () => header,
      single: async () => ({ data: receipt, error: null }),
    };
    const inventory = {
      select: () => inventory,
      eq: () => inventory,
      in: async (_key: string, values: string[]) => {
        if (values.length > 100)
          throw new Error("Provider query-length boundary");
        return {
          data: values.map((product_id) => ({ product_id, quantity: 5 })),
          count: values.length,
          error: null,
        };
      },
    };
    vi.mocked(apiContext).mockResolvedValueOnce({
      db: {
        from: (table: string) =>
          table === "stock_intakes" ? header : inventory,
      },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
    const response = await GET(
      new Request(`http://localhost/api/stock-intakes?id=${id}`),
    );
    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.current_stock).toHaveLength(250);
    expect(result.stock_warning).toBeNull();
  });
  it("keeps receipt history available when stock is unavailable or truncated, without inventing zero", async () => {
    const receipt = {
      id,
      status: "approved",
      document: { warehouse_id: id, lines: [{ product_id: id }] },
    };
    const header = {
      select: () => header,
      eq: () => header,
      single: async () => ({ data: receipt, error: null }),
    };
    const read = vi.fn().mockResolvedValue({ data: [], count: 1, error: null });
    const inventory = {
      select: () => inventory,
      eq: () => inventory,
      in: read,
    };
    const from = vi.fn((table: string) =>
      table === "stock_intakes" ? header : inventory,
    );
    vi.mocked(apiContext).mockResolvedValue({
      db: { from },
      org: id,
      profile: { id },
    } as unknown as Awaited<ReturnType<typeof apiContext>>);
    for (const unavailable of [
      { data: [], count: 1, error: null },
      { data: null, count: null, error: { message: "Unavailable" } },
    ]) {
      read.mockResolvedValueOnce(unavailable);
      const response = await GET(
        new Request(`http://localhost/api/stock-intakes?id=${id}`),
      );
      const result = await response.json();
      expect(response.status).toBe(200);
      expect(result.id).toBe(id);
      expect(result.current_stock).toBeNull();
      expect(result.stock_warning).toContain("retained");
    }
    receipt.status = "posted";
    read.mockClear();
    expect(
      (await GET(new Request(`http://localhost/api/stock-intakes?id=${id}`)))
        .status,
    ).toBe(200);
    expect(read).not.toHaveBeenCalled();
  });
  it("requires a fresh manager context for every command", async () => {
    vi.mocked(apiContext).mockRejectedValueOnce(new Error("Sign in required"));
    expect(
      (await POST(request({ action: "post", id, approval_id: id }))).status,
    ).toBe(401);
    vi.mocked(apiContext).mockRejectedValueOnce(new Error("Permission denied"));
    expect(
      (await GET(new Request("http://localhost/api/stock-intakes"))).status,
    ).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("bounds streamed request bytes without relying on Content-Length", async () => {
    const response = await POST(
      request({ notes: "x".repeat(2 * 1024 * 1024) }),
    );
    expect(response.status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("rejects a forged or missing approval before dispatch", async () => {
    expect((await POST(request({ action: "post", id }))).status).toBe(400);
    expect(
      (
        await POST(
          request({ action: "approve", id, revision: 1, hash: "forged" }),
        )
      ).status,
    ).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("posts only the supplied receipt and recorded approval; returns conflict for renewed review", async () => {
    rpc.mockResolvedValueOnce({
      data: null,
      error: {
        message: "Product identity changed; review receipt again",
        code: "P0001",
      },
    });
    const response = await POST(
      request({
        action: "post",
        id,
        approval_id: id,
        untrusted_actor: "foreign",
      }),
    );
    expect(response.status).toBe(409);
    expect(rpc).toHaveBeenCalledWith("post_stock_intake", {
      receipt_id: id,
      approval_id: id,
    });
    expect((await response.json()).error).toContain("review receipt");
  });
});
