import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import {
  processIntakeJob,
  createSupabaseWorkerDriver,
  ProcessingError,
  type WorkerDriver,
} from "./worker.mjs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types";
import type { IntakeJob } from "./contracts";
import type { PreparedSpreadsheetRow } from "./spreadsheet";

function fixture(bytes: Uint8Array, stage: IntakeJob["stage"] = "inspect") {
  const org = "10000000-0000-4000-8000-000000000001",
    batch = "20000000-0000-4000-8000-000000000001",
    source = "30000000-0000-4000-8000-000000000001";
  const job: IntakeJob = {
    id: "40000000-0000-4000-8000-000000000001",
    organization_id: org,
    batch_id: batch,
    actor_id: "50000000-0000-4000-8000-000000000001",
    stage,
    source_id: source,
    group_id: null,
    content_revision: 1,
    processing_version: 1,
    lease_token: "60000000-0000-4000-8000-000000000001",
    attempts: 1,
    source: {
      id: source,
      name: "stock.xlsx",
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      object_key: `${org}/${batch}/${source}.xlsx`,
      version: 1,
      plan: null,
    },
  };
  const rpc = vi.fn<WorkerDriver["rpc"]>().mockResolvedValue({ ok: true });
  const driver: WorkerDriver = { rpc, download: async () => bytes };
  return { job, rpc, driver };
}
const bookBytes = () => {
  const book = XLSX.utils.book_new();
  for (const name of ["First", "Second"])
    XLSX.utils.book_append_sheet(
      book,
      XLSX.utils.aoa_to_sheet([
        ["SKU", "Qty", "Cost"],
        ...Array.from({ length: 600 }, (_, index) => [
          `${name}-${index}`,
          1,
          0,
        ]),
      ]),
      name,
    );
  return new Uint8Array(
    XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }),
  );
};
it("inspects the real private bytes in an isolated child and records the verified hash", async () => {
  const bytes = bookBytes(),
    { job, rpc, driver } = fixture(bytes);
  await processIntakeJob(driver, job);
  const finished = rpc.mock.calls
    .map((call) => call[0] as Record<string, unknown>)
    .find((input) => input.action === "inspect");
  expect(finished).toMatchObject({
    sha256: job.source!.sha256,
    bytes: bytes.length,
  });
  expect(
    (finished!.inspection as { sheets: { name: string }[] }).sheets.map(
      (sheet) => sheet.name,
    ),
  ).toEqual(["First", "Second"]);
}, 30000);
it("prepares both sheets through durable bounded checkpoints rather than a first-1000-row response", async () => {
  const { job, driver } = fixture(bookBytes(), "parse");
  job.source!.plan = {
    sheets: ["First", "Second"].map((name) => ({
      name,
      headerRow: 1,
      columns: { sku: 0, quantity: 1, receipt_unit_cost: 2 },
    })),
  };
  const rows: PreparedSpreadsheetRow[] = [];
  let complete: Record<string, unknown> | undefined;
  driver.rpc = async (input) => {
    if (input.action === "checkpoint") {
      const chunk = input.rows as PreparedSpreadsheetRow[];
      expect(chunk.length).toBeLessThanOrEqual(100);
      rows.push(...chunk);
    }
    if (input.action === "parsed") complete = input;
    return { ok: true };
  };
  await processIntakeJob(driver, job);
  expect(rows).toHaveLength(1200);
  expect(rows.at(-1)).toMatchObject({
    sheet: "Second",
    row: 601,
    values: { receipt_unit_cost: 0 },
  });
  expect(complete).toMatchObject({ stats: { prepared: 1200 } });
}, 30000);
it("rejects a changed original before extraction and records a permanent source failure", async () => {
  const { job, rpc, driver } = fixture(bookBytes());
  driver.download = async () => new TextEncoder().encode("Different bytes");
  await processIntakeJob(driver, job);
  expect(rpc).toHaveBeenCalledWith(
    expect.objectContaining({
      action: "fail",
      permanent: true,
      error: expect.stringMatching(/SHA-256/),
    }),
  );
  expect(
    rpc.mock.calls.some(
      (call) => (call[0] as Record<string, unknown>).action === "inspect",
    ),
  ).toBe(false);
});
it("waits for an unfinished direct upload without consuming an extraction retry", async () => {
  const { job, rpc, driver } = fixture(bookBytes());
  driver.download = async () => {
    throw new ProcessingError("Not uploaded", false, false, true);
  };
  await processIntakeJob(driver, job);
  expect(rpc).toHaveBeenCalledWith(
    expect.objectContaining({ action: "waiting_upload" }),
  );
  expect(
    rpc.mock.calls.some(
      (call) => (call[0] as Record<string, unknown>).action === "fail",
    ),
  ).toBe(false);
});

it.each([
  [0, "", false],
  [503, "PGRST003", false],
  [408, "57014", false],
  [403, "42501", true],
  [400, "22023", true],
])(
  "classifies worker RPC status %i / %s without discarding transient work",
  async (status, code, permanent) => {
    const db = {
      rpc: vi
        .fn()
        .mockResolvedValue({
          data: null,
          error: { message: "Synthetic RPC failure", code },
          status,
        }),
    } as unknown as SupabaseClient<Database>;
    await expect(
      createSupabaseWorkerDriver(db).rpc({
        action: "claim",
        worker_id: "test",
      }),
    ).rejects.toMatchObject({ permanent });
  },
);
