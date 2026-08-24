// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from "vitest";
import { persistOfflineSale } from "../sales";
import { getDB, pruneSyncedQueueItems, type SyncQueueRecord } from "../db";
import { generateId } from "@/lib/utils/id";

describe("persistOfflineSale", () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear("sales");
    await db.clear("sale_items");
    await db.clear("sync_queue");
  });

  it("stores a sale locally and queues it for sync", async () => {
    await persistOfflineSale({
      cashier_id: "cashier-1",
      organization_id: "org-1",
      warehouse_id: "warehouse-1",
      invoice_number: "INV-000001",
      items: [
        {
          product_id: "product-1",
          warehouse_id: "warehouse-1",
          quantity: 1,
          unit_price: 100,
          cost_price: 80,
          discount: 0,
          total: 100,
        },
      ],
      subtotal: 100,
      discount: 0,
      tax: 0,
      total: 100,
      amount_paid: 100,
      change_amount: 0,
      payment_method: "cash",
      notes: "offline test",
    });

    const db = await getDB();
    const sales = await db.getAll("sales");
    const saleItems = await db.getAll("sale_items");
    const queueItems = await db.getAll("sync_queue");

    expect(sales).toHaveLength(1);
    expect(saleItems).toHaveLength(1);
    expect(queueItems.some((item) => item.table_name === "sales")).toBe(true);
  });

  /**
   * Regression test for the remaining checkout-freeze path: a device that
   * has been OFFLINE for a long time accumulates a large PENDING backlog
   * (unsynced sales + line items + inventory updates). The pre-fix
   * `addToSyncQueue()` duplicate check fetched the ENTIRE pending+syncing
   * backlog on every call, and `persistOfflineSale()` makes one call per
   * sale + per line item + per inventory update — so checkout did
   * O(N × backlog) work on the critical path to rendering the receipt.
   * After the fix (composite `by-queue-key` index), each duplicate check is
   * a single indexed read regardless of backlog size.
   */
  it("stays fast even with a large pending offline backlog", async () => {
    const db = await getDB();

    // 30,000 pending rows simulates a till that has been offline for a long
    // time without syncing. Before the composite-index fix, every
    // addToSyncQueue call scanned all of these; with a 2-item sale that's
    // up to 5 calls × 30,000 rows = 150,000 row reads on the critical path.
    const SEEDED_PENDING_ROWS = 30000;
    const oldTimestamp = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const tx = db.transaction("sync_queue", "readwrite");
    const store = tx.objectStore("sync_queue");
    const seeds: SyncQueueRecord[] = Array.from(
      { length: SEEDED_PENDING_ROWS },
      (_, i) => ({
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: `pending-sale-${i}`,
        payload: { id: `pending-sale-${i}` },
        status: "pending",
        retry_count: 0,
        created_at: oldTimestamp,
      }),
    );
    await Promise.all([...seeds.map((seed) => store.add(seed)), tx.done]);

    const seededCount = await db.count("sync_queue");
    expect(seededCount).toBe(SEEDED_PENDING_ROWS);

    const start = Date.now();

    await persistOfflineSale({
      cashier_id: "cashier-1",
      organization_id: "org-1",
      warehouse_id: "warehouse-1",
      invoice_number: "INV-000003",
      items: [
        {
          product_id: "product-1",
          warehouse_id: "warehouse-1",
          quantity: 2,
          unit_price: 50,
          cost_price: 40,
          discount: 0,
          total: 100,
        },
        {
          product_id: "product-2",
          warehouse_id: "warehouse-1",
          quantity: 1,
          unit_price: 200,
          cost_price: 150,
          discount: 0,
          total: 200,
        },
      ],
      subtotal: 300,
      discount: 0,
      tax: 0,
      total: 300,
      amount_paid: 300,
      change_amount: 0,
      payment_method: "cash",
    });

    const elapsedMs = Date.now() - start;

    // Same budget rationale as the synced-backlog test above: the fixed,
    // index-scoped implementation measures single-digit ms here; the
    // pre-fix full-backlog scan measured 1000ms+ and scales linearly.
    expect(elapsedMs).toBeLessThan(300);

    const sales = await db.getAll("sales");
    expect(sales.some((s) => s.invoice_number === "INV-000003")).toBe(true);

    const totalAfter = await db.count("sync_queue");
    expect(totalAfter).toBeGreaterThan(SEEDED_PENDING_ROWS);
  });

  it("stays fast even with a large historical synced sync_queue backlog", async () => {
    const db = await getDB();

    // 30,000 rows is a realistic "months of daily use, never pruned" queue
    // size for a busy till. Measured directly against this exact scenario:
    // the pre-fix `db.getAll('sync_queue')`-per-call implementation took
    // ~1000ms+ here (and scales linearly with the backlog); the fixed,
    // index-scoped implementation takes low single-digit milliseconds. The
    // budget below is set well below the pre-fix timing so this test fails
    // if the O(queue size) scan regresses, while staying generous enough
    // to not be flaky on a slower CI machine.
    const SEEDED_SYNCED_ROWS = 30000;
    const oldTimestamp = new Date(
      Date.now() - 200 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const tx = db.transaction("sync_queue", "readwrite");
    const store = tx.objectStore("sync_queue");
    const seeds: SyncQueueRecord[] = Array.from(
      { length: SEEDED_SYNCED_ROWS },
      (_, i) => ({
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: `historical-sale-${i}`,
        payload: { id: `historical-sale-${i}` },
        status: "synced",
        retry_count: 0,
        created_at: oldTimestamp,
        synced_at: oldTimestamp,
      }),
    );
    await Promise.all([...seeds.map((seed) => store.add(seed)), tx.done]);

    // Sanity check the seed actually landed.
    const seededCount = await db.count("sync_queue");
    expect(seededCount).toBe(SEEDED_SYNCED_ROWS);

    const start = Date.now();

    await persistOfflineSale({
      cashier_id: "cashier-1",
      organization_id: "org-1",
      warehouse_id: "warehouse-1",
      invoice_number: "INV-000002",
      items: [
        {
          product_id: "product-1",
          warehouse_id: "warehouse-1",
          quantity: 2,
          unit_price: 50,
          cost_price: 40,
          discount: 0,
          total: 100,
        },
        {
          product_id: "product-2",
          warehouse_id: "warehouse-1",
          quantity: 1,
          unit_price: 200,
          cost_price: 150,
          discount: 0,
          total: 200,
        },
      ],
      subtotal: 300,
      discount: 0,
      tax: 0,
      total: 300,
      amount_paid: 300,
      change_amount: 0,
      payment_method: "cash",
    });

    const elapsedMs = Date.now() - start;

    // Before the fix, a getAll() scan of 30,000 rows on every one of the
    // sale's addToSyncQueue calls (1 sale + 2 items + up to 2 inventory
    // updates = up to 5 calls) measured 1000ms+ here and scales linearly
    // with backlog size; after the fix, it measures single-digit ms. 300ms
    // gives ~2 orders of magnitude of headroom over the fixed-code timing
    // while still being far below the pre-fix timing, so this test fails
    // if the O(queue size) scan regresses.
    expect(elapsedMs).toBeLessThan(300);

    const sales = await db.getAll("sales");
    expect(sales.some((s) => s.invoice_number === "INV-000002")).toBe(true);

    // The new sale's own queue entries should have been added on top of
    // the untouched historical backlog.
    const totalAfter = await db.count("sync_queue");
    expect(totalAfter).toBeGreaterThan(SEEDED_SYNCED_ROWS);
  });
});

describe("pruneSyncedQueueItems", () => {
  beforeEach(async () => {
    const db = await getDB();
    await db.clear("sync_queue");
  });

  it("deletes old synced rows and leaves pending/syncing/recent-synced rows untouched", async () => {
    const db = await getDB();

    const oldTimestamp = new Date(
      Date.now() - 10 * 24 * 60 * 60 * 1000,
    ).toISOString();
    const recentTimestamp = new Date(
      Date.now() - 1 * 24 * 60 * 60 * 1000,
    ).toISOString();

    const rows: SyncQueueRecord[] = [
      // Old synced rows — should be pruned (older than the default 3-day cutoff).
      {
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: "old-synced-1",
        payload: {},
        status: "synced",
        retry_count: 0,
        created_at: oldTimestamp,
        synced_at: oldTimestamp,
      },
      {
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: "old-synced-2",
        payload: {},
        status: "synced",
        retry_count: 0,
        // No synced_at — falls back to created_at, which is also old.
        created_at: oldTimestamp,
      },
      // Recently synced row — should NOT be pruned (younger than cutoff).
      {
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: "recent-synced",
        payload: {},
        status: "synced",
        retry_count: 0,
        created_at: recentTimestamp,
        synced_at: recentTimestamp,
      },
      // Pending row — should NOT be pruned regardless of age.
      {
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: "still-pending",
        payload: {},
        status: "pending",
        retry_count: 0,
        created_at: oldTimestamp,
      },
      // Syncing row — should NOT be pruned regardless of age.
      {
        id: generateId(),
        table_name: "sales",
        operation: "INSERT",
        record_id: "still-syncing",
        payload: {},
        status: "syncing",
        retry_count: 0,
        created_at: oldTimestamp,
      },
    ];

    const tx = db.transaction("sync_queue", "readwrite");
    const store = tx.objectStore("sync_queue");
    await Promise.all([...rows.map((row) => store.add(row)), tx.done]);

    const deletedCount = await pruneSyncedQueueItems(3);
    expect(deletedCount).toBe(2);

    const remaining = (await db.getAll("sync_queue")) as SyncQueueRecord[];
    const remainingRecordIds = remaining.map((r) => r.record_id).sort();

    expect(remainingRecordIds).toEqual(
      ["recent-synced", "still-pending", "still-syncing"].sort(),
    );
  });

  it("is a no-op when there are no synced rows", async () => {
    const db = await getDB();
    await db.add("sync_queue", {
      id: generateId(),
      table_name: "sales",
      operation: "INSERT",
      record_id: "pending-only",
      payload: {},
      status: "pending",
      retry_count: 0,
      created_at: new Date().toISOString(),
    } satisfies SyncQueueRecord);

    const deletedCount = await pruneSyncedQueueItems(3);
    expect(deletedCount).toBe(0);

    const remaining = await db.getAll("sync_queue");
    expect(remaining).toHaveLength(1);
  });
});
