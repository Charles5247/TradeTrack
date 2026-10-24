// Actual parser child + worker + PostgreSQL commands, synthetic local originals.
// Requires the successful --m2 fixture. No application credentials are loaded.
import { readFileSync, writeFileSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { createLocalIntakeSql } from "./local-intake-sql.mjs";
import {
  processIntakeJob,
  type WorkerDriver,
} from "../src/lib/stock-intake-batches/worker.mjs";
import {
  jobSchema,
  type BatchView,
} from "../src/lib/stock-intake-batches/contracts.js";

const target = JSON.parse(readFileSync(".m0-local/active-target.json", "utf8"));
const sql = createLocalIntakeSql(target),
  q = (value: unknown) => `'${String(value).replaceAll("'", "''")}'`;
const owner = "20000000-0000-0000-0000-000000000001",
  warehouse = "40000000-0000-0000-0000-000000000001",
  product = "30000000-0000-0000-0000-000000000001";
const command = async (input: unknown) =>
  JSON.parse(
    await sql(
      `SET ROLE authenticated;SET "test.uid"='${owner}';SELECT public.stock_intake_batch_command(${q(JSON.stringify(input))}::jsonb)`,
    ),
  );
const worker = async (input: unknown) =>
  JSON.parse(
    await sql(
      `SET ROLE service_role;SET "test.uid"='';SELECT public.stock_intake_job_command(${q(JSON.stringify(input))}::jsonb)`,
    ),
  );
const view = async (id: string, offset = 0): Promise<BatchView> =>
  JSON.parse(
    await sql(
      `SET ROLE authenticated;SET "test.uid"='${owner}';SELECT public.read_stock_intake_batch('${id}',${offset})`,
    ),
  );
const results: { name: string; status: string; elapsedMs: number }[] = [];
const check = async (name: string, callback: () => Promise<void>) => {
  const start = Date.now();
  await callback();
  results.push({ name, status: "passed", elapsedMs: Date.now() - start });
  console.log("PASS M2 pipeline " + name);
};
const batchId = randomUUID(),
  sourceId = randomUUID();
const sku = await sql(`SELECT sku FROM products WHERE id='${product}'`);
const book = XLSX.utils.book_new();
const rowCount = Number(process.env.M2_PIPELINE_ROWS ?? "20000");
assert([1200, 20000].includes(rowCount), "Use a defined acceptance size");
for (const name of ["First", "Second"])
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["SKU", "Quantity", "Cost", "Unit", "Pack", "Supplier", "Invoice"],
      ...Array.from({ length: rowCount / 2 }, () => [
        sku,
        1,
        0,
        "piece",
        1,
        "Synthetic supplier",
        batchId,
      ]),
    ]),
    name,
  );
const bytes = new Uint8Array(
  XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }),
);
const driver: WorkerDriver = {
  rpc: worker,
  download: async (source) => {
    assert.equal(source.id, sourceId);
    return bytes;
  },
};
async function next(stage: string) {
  await sql(
    `UPDATE stock_intake_jobs SET run_after=now() WHERE batch_id='${batchId}' AND status='queued'`,
  );
  const job = jobSchema.parse(
    await worker({ action: "claim", worker_id: "m2-pipeline" }),
  );
  assert.equal(job.batch_id, batchId);
  assert.equal(job.stage, stage);
  return job;
}
let groupId = "",
  hash = "";
await check(
  "real private bytes inspected without an upload-completion callback",
  async () => {
    const created = await command({
      action: "create",
      id: batchId,
      mode: "additional_delivery",
      warehouse_id: warehouse,
    });
    await command({
      action: "register",
      batch_id: batchId,
      expected_revision: created.batch.revision,
      source: {
        id: sourceId,
        name: "pipeline.xlsx",
        bytes: bytes.length,
        sha256: createHash("sha256").update(bytes).digest("hex"),
      },
    });
    await processIntakeJob(driver, await next("inspect"));
    const current = await view(batchId);
    assert.equal(current.sources[0].status, "select_sheets");
  },
);
await check(
  "all selected worksheets prepare beyond 1000 through durable checkpoints",
  async () => {
    let current = await view(batchId);
    await command({
      action: "configure",
      batch_id: batchId,
      expected_revision: current.batch.revision,
      source_id: sourceId,
      duplicate_reason: "",
      plan: {
        sheets: ["First", "Second"].map((name) => ({
          name,
          headerRow: 1,
          columns: {
            sku: 0,
            quantity: 1,
            receipt_unit_cost: 2,
            purchase_unit: 3,
            conversion: 4,
            supplier: 5,
            invoice_reference: 6,
          },
        })),
      },
    });
    current = await view(batchId);
    await command({
      action: "process",
      batch_id: batchId,
      expected_revision: current.batch.revision,
    });
    const result = await processIntakeJob(driver, await next("parse"));
    assert.equal((result as { ok: boolean }).ok, true, JSON.stringify(result));
    current = await view(batchId);
    assert.equal(current.row_count, rowCount);
    assert.equal(current.groups.length, 1);
    assert.equal(current.sources[0].status, "prepared");
    assert.equal(current.rows.length, 100);
    assert.equal(
      (await view(batchId, rowCount - 100)).rows.at(-1)?.row_number,
      rowCount / 2 + 1,
    );
  },
);
await check(
  "worker restart fences old lease and retains prepared checkpoints",
  async () => {
    let current = await view(batchId);
    const ids = JSON.parse(
      await sql(
        `SELECT jsonb_agg(id) FROM stock_intake_batch_rows WHERE batch_id='${batchId}'`,
      ),
    );
    await command({
      action: "rows",
      batch_id: batchId,
      expected_revision: current.batch.revision,
      ids,
      patch: { conversion_confirmed: true },
    });
    current = await view(batchId);
    groupId = current.groups[0].id;
    await command({
      action: "prepare",
      batch_id: batchId,
      expected_revision: current.batch.revision,
      group_ids: [groupId],
    });
    const abandoned = await next("prepare");
    await sql(
      `UPDATE stock_intake_jobs SET lease_until=now()-interval '1 second' WHERE id='${abandoned.id}'`,
    );
    const recovered = await next("prepare");
    assert.equal(recovered.id, abandoned.id);
    assert.notEqual(recovered.lease_token, abandoned.lease_token);
    await assert.rejects(
      () =>
        worker({
          action: "heartbeat",
          job_id: abandoned.id,
          lease_token: abandoned.lease_token,
          processing_version: abandoned.processing_version,
        }),
      /lease/,
    );
    const prepared = await processIntakeJob(driver, recovered);
    assert.equal(
      (prepared as { ok: boolean }).ok,
      true,
      JSON.stringify(prepared),
    );
    current = await view(batchId);
    assert.equal(current.groups[0].status, "ready");
    hash = current.groups[0].prepared_hash!;
    assert.equal(
      await sql(
        `SELECT jsonb_array_length(document->'lines') FROM stock_intakes WHERE id='${current.groups[0].receipt_id}'`,
      ),
      String(rowCount),
    );
  },
);
await check(
  "one approval posts the complete large receipt once across acknowledgment loss",
  async () => {
    const current = await view(batchId),
      before = Number(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
        ),
      );
    const input = {
      action: "approve",
      batch_id: batchId,
      expected_revision: current.batch.revision,
      approval_id: randomUUID(),
      receipts: [{ group_id: groupId, hash }],
      exclusions_acknowledged: true,
    };
    await command(input);
    await command(input);
    const job = await next("post");
    const posted = await processIntakeJob(driver, job);
    assert.equal((posted as { ok: boolean }).ok, true, JSON.stringify(posted));
    await processIntakeJob(driver, job);
    assert.equal(
      Number(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
        ),
      ),
      before + rowCount,
    );
    const final = await view(batchId);
    assert.equal(final.batch.status, "completed");
    assert.equal(final.summary.posted, 1);
    assert.equal(final.groups[0].result?.line_count, rowCount);
  },
);
writeFileSync(
  `build-evidence/m2/pipeline-${rowCount}-result.json`,
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      synthetic: true,
      hostedStorageVerified: false,
      rowCount,
      files: 1,
      sheets: 2,
      sourceBytes: bytes.length,
      results,
    },
    null,
    2,
  ) + "\n",
);
