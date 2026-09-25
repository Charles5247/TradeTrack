// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { openDB } from "idb";
vi.mock("../auth-cache", () => ({
  getOfflineAccountNamespace: () => "v5-upgrade-test",
}));
import { getDB } from "../db";

it("upgrades v4 while preserving PO, POS and queued records", async () => {
  const old = await openDB("TracKasuwa-offline-v5-upgrade-test", 4, {
    upgrade(db) {
      for (const name of [
        "products",
        "inventory",
        "sales",
        "sale_items",
        "warehouses",
        "categories",
        "pending_receipts",
        "user_sessions",
        "suppliers",
        "purchase_orders",
        "purchase_order_items",
      ])
        db.createObjectStore(name, { keyPath: "id" });
      const queue = db.createObjectStore("sync_queue", { keyPath: "id" });
      queue.createIndex("by-queue-key", [
        "table_name",
        "record_id",
        "operation",
      ]);
      queue.createIndex("by-status", "status");
      queue.createIndex("by-table", "table_name");
    },
  });
  await old.put("purchase_orders", { id: "po", total_value: 200 });
  await old.put("sales", { id: "sale", total: 100 });
  await old.put("sync_queue", {
    id: "queue",
    table_name: "sales",
    record_id: "sale",
    operation: "INSERT",
    status: "pending",
  });
  old.close();
  const db = await getDB();
  expect(db.version).toBe(5);
  expect(await db.get("purchase_orders", "po")).toEqual({
    id: "po",
    total_value: 200,
  });
  expect(await db.get("sales", "sale")).toEqual({ id: "sale", total: 100 });
  expect(
    await db.getAllFromIndex("sync_queue", "by-queue-key", [
      "sales",
      "sale",
      "INSERT",
    ]),
  ).toHaveLength(1);
  expect(db.objectStoreNames.contains("vendor_transactions")).toBe(true);
  expect(db.objectStoreNames.contains("vendor_transaction_items")).toBe(true);
  db.close();
});
