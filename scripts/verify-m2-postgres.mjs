import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

export async function verifySpreadsheetIntake({
  sql,
  org,
  owner,
  cashier,
  product,
  warehouse,
}) {
  const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${q(JSON.stringify(value))}::jsonb`;
  const as = (actor, statement) =>
    sql(`SET ROLE authenticated;SET "test.uid"=${q(actor)};${statement}`);
  const command = (input, actor = owner) =>
    as(actor, `SELECT public.stock_intake_batch_command(${json(input)})`).then(
      JSON.parse,
    );
  const service = (input) =>
    sql(
      `SET ROLE service_role;SET "test.uid"='';SELECT public.stock_intake_job_command(${json(input)})`,
    ).then((value) => JSON.parse(value || "null"));
  const view = (id, offset = 0, issue = "all") =>
    as(
      owner,
      `SELECT public.read_stock_intake_batch('${id}',${offset},0,NULL,false,${q(issue)})`,
    ).then(JSON.parse);
  const results = [];
  const check = async (name, run) => {
    await run();
    results.push({ name, status: "passed" });
    console.log("PASS M2 " + name);
  };
  const create = async () =>
    (
      await command({
        action: "create",
        id: randomUUID(),
        mode: "additional_delivery",
        warehouse_id: warehouse,
      })
    ).batch;
  const readyJob = async (stage) => {
    await sql(
      `UPDATE stock_intake_jobs SET run_after=now() WHERE status='queued'`,
    );
    const job = await service({ action: "claim", worker_id: "m2-sql-fixture" });
    assert(job);
    if (stage) assert.equal(job.stage, stage);
    return job;
  };
  const work = (job, action, extra = {}) =>
    service({
      action,
      job_id: job.id,
      lease_token: job.lease_token,
      processing_version: job.processing_version,
      ...extra,
    });
  const register = async (batch, name = "source.csv") =>
    command({
      action: "register",
      batch_id: batch.id,
      expected_revision: batch.revision,
      source: {
        id: randomUUID(),
        name,
        bytes: 100,
        sha256: randomUUID().replaceAll("-", "").repeat(2),
      },
    });
  await check(
    "batch feature is disabled by default and rejects unauthorized roles",
    async () => {
      await assert.rejects(create, /disabled/);
      await sql(
        "UPDATE track_private.stock_command_settings SET batch_intake_enabled=true,intake_enabled=true",
      );
      await assert.rejects(
        () =>
          command(
            {
              action: "create",
              id: randomUUID(),
              mode: "additional_delivery",
              warehouse_id: warehouse,
            },
            cashier,
          ),
        /Permission/,
      );
      await assert.rejects(
        () =>
          as(
            owner,
            `SELECT public.stock_intake_job_command('{"action":"claim","worker_id":"forged"}')`,
          ),
        /permission denied/,
      );
    },
  );
  let batch, source, inspect, group, parse;
  await check(
    "authorized upload registration is idempotent and queues work before browser completion",
    async () => {
      const created = await create();
      const input = {
        action: "register",
        batch_id: created.id,
        expected_revision: created.revision,
        source: {
          id: randomUUID(),
          name: "invoice.csv",
          bytes: 100,
          sha256: randomUUID().replaceAll("-", "").repeat(2),
        },
      };
      const saved = await command(input),
        replayed = await command(input);
      batch = saved.batch;
      source = saved.source;
      assert.equal(replayed.source.id, source.id);
      assert.equal((await view(batch.id)).sources.length, 1);
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intake_jobs WHERE source_id='${source.id}'`,
        ),
        "1",
      );
      inspect = await readyJob("inspect");
      assert.equal((await work(inspect, "waiting_upload")).ok, true);
      assert.equal(
        await sql(
          `SELECT attempts FROM stock_intake_jobs WHERE id='${inspect.id}'`,
        ),
        "0",
      );
      inspect = await readyJob("inspect");
      const done = await work(inspect, "inspect", {
        sha256: source.sha256,
        bytes: 100,
        inspection: {
          sheets: [
            { name: "First", preview: [] },
            { name: "Second", preview: [] },
          ],
        },
      });
      assert.equal(done.ok, true);
      assert.equal(
        (
          await work(inspect, "inspect", {
            sha256: source.sha256,
            bytes: 100,
            inspection: { sheets: [] },
          })
        ).already_completed,
        true,
      );
    },
  );
  await check(
    "private object policy permits only the registered own-business source and denies anonymous reads",
    async () => {
      await sql(`GRANT UPDATE,DELETE ON storage.objects TO anon,authenticated;
        DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='synthetic_legacy_broad_policy') THEN
        CREATE POLICY synthetic_legacy_broad_policy ON storage.objects FOR ALL TO anon,authenticated USING(true) WITH CHECK(true);END IF;END $$;`);
      const other = await register(await create());
      await as(
        owner,
        `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('stock-intake-originals',${q(other.source.object_key)},'{"size":100}')`,
      );
      assert.equal(
        await as(
          cashier,
          `SELECT id FROM storage.objects WHERE name=${q(other.source.object_key)}`,
        ),
        "",
      );
      assert.equal(
        await sql("SET ROLE anon;SELECT count(*) FROM storage.objects"),
        "0",
      );
      await assert.rejects(
        () =>
          as(
            owner,
            "INSERT INTO storage.objects(bucket_id,name) VALUES('stock-intake-originals','foreign/path.csv')",
          ),
        /row-level security/,
      );
      assert.equal(await as(owner,`UPDATE storage.objects SET metadata='{"size":0}' WHERE name=${q(other.source.object_key)} RETURNING id`),'');
      assert.equal(await as(owner,`DELETE FROM storage.objects WHERE name=${q(other.source.object_key)} RETURNING id`),'');
      assert.equal(await as(owner,`SELECT metadata->>'size' FROM storage.objects WHERE name=${q(other.source.object_key)}`),'100');
      await command({
        action: "cancel",
        batch_id: other.batch.id,
        expected_revision: other.batch.revision,
      });
    },
  );
  await check(
    "complete checkpoints preserve source rows, enforce fencing and create inspectable receipts",
    async () => {
      const current = (await view(batch.id)).batch;
      await command({
        action: "configure",
        batch_id: batch.id,
        expected_revision: current.revision,
        source_id: source.id,
        duplicate_reason: "",
        plan: {
          sheets: [
            {
              name: "First",
              headerRow: 1,
              columns: {
                sku: 0,
                quantity: 1,
                receipt_unit_cost: 2,
                conversion: 3,
                purchase_unit: 4,
              },
            },
            {
              name: "Second",
              headerRow: 1,
              columns: {
                sku: 0,
                quantity: 1,
                receipt_unit_cost: 2,
                conversion: 3,
                purchase_unit: 4,
              },
            },
          ],
        },
      });
      batch = (await view(batch.id)).batch;
      await command({
        action: "process",
        batch_id: batch.id,
        expected_revision: batch.revision,
      });
      parse = await readyJob("parse");
      const sku = await sql(`SELECT sku FROM products WHERE id='${product}'`);
      const rows = [
        {
          sheet: "First",
          row: 2,
          cells: { A: { value: sku, formatted: sku } },
          values: {
            sku,
            description: null,
            barcode: null,
            quantity: 10,
            conversion: 12,
            purchase_unit: "carton",
            receipt_unit_cost: 3.25,
            supplier: "M2 supplier",
            invoice_reference: batch.id,
          },
          warnings: [],
        },
        {
          sheet: "Second",
          row: 2,
          cells: { A: { value: sku, formatted: sku } },
          values: {
            sku,
            description: null,
            barcode: null,
            quantity: 2,
            conversion: 1,
            purchase_unit: "piece",
            receipt_unit_cost: 0,
            supplier: "M2 supplier",
            invoice_reference: batch.id,
          },
          warnings: [],
        },
      ];
      const checkpoint = await work(parse, "checkpoint", { rows });
      assert.equal(checkpoint.ok, true, JSON.stringify(checkpoint));
      assert.equal((await work(parse, "checkpoint", { rows })).ok, true);
      await assert.rejects(
        () =>
          work({ ...parse, lease_token: randomUUID() }, "checkpoint", { rows }),
        /lease/,
      );
      assert.equal(
        (
          await work(parse, "parsed", {
            stats: {
              prepared: 2,
              blank: 0,
              worksheets: [
                { name: "First", rows: 1 },
                { name: "Second", rows: 1 },
              ],
            },
          })
        ).ok,
        true,
      );
      let currentView = await view(batch.id);
      assert.equal(currentView.row_count, 2);
      assert.equal(currentView.groups.length, 1);
      assert.equal(currentView.rows[1].sheet, "Second");
      group = currentView.groups[0];
      await command({
        action: "rows",
        batch_id: batch.id,
        expected_revision: currentView.batch.revision,
        ids: currentView.rows.map((r) => r.id),
        patch: { conversion_confirmed: true },
      });
      currentView = await view(batch.id);
      assert.deepEqual(
        currentView.rows.map((r) => r.issues),
        [[], []],
      );
      await command({
        action: "prepare",
        batch_id: batch.id,
        expected_revision: currentView.batch.revision,
        group_ids: [group.id],
      });
      const job = await readyJob("prepare");
      const prepared = await work(job, "prepare");
      assert.equal(prepared.ok, true, JSON.stringify(prepared));
      currentView = await view(batch.id);
      group = currentView.groups[0];
      assert.equal(group.status, "ready");
      const saved = JSON.parse(
        await sql(
          `SELECT document FROM stock_intakes WHERE id='${group.receipt_id}'`,
        ),
      );
      assert.equal(saved.lines[0].evidence.kind, "spreadsheet");
      assert.equal(saved.lines[0].evidence.source_id, source.id);
      assert.equal(saved.lines[0].evidence.sheet, "First");
      assert.equal(saved.lines[1].receipt_unit_cost, 0);
      await assert.rejects(
        () =>
          as(
            owner,
            `SELECT public.approve_stock_intake('${group.receipt_id}',1,'${group.prepared_hash}')`,
          ),
        /batch/,
      );
    },
  );
  await check(
    "one immutable batch approval posts the complete receipt once and recovers a lost response",
    async () => {
      const current = await view(batch.id);
      const before = Number(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
        ),
      );
      const input = {
        action: "approve",
        batch_id: batch.id,
        expected_revision: current.batch.revision,
        approval_id: randomUUID(),
        receipts: [{ group_id: group.id, hash: group.prepared_hash }],
        exclusions_acknowledged: true,
      };
      await command(input);
      await command(input);
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intake_jobs WHERE batch_id='${batch.id}' AND stage='post'`,
        ),
        "1",
      );
      const job = await readyJob("post");
      const posted = await work(job, "post");
      assert.equal(posted.ok, true, JSON.stringify(posted));
      const retry = await work(job, "post");
      assert.equal(retry.already_completed, true);
      assert.equal(
        Number(
          await sql(
            `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
          ),
        ),
        before + 122,
      );
      const final = await view(batch.id);
      assert.equal(final.groups[0].status, "posted");
      assert.equal(final.batch.status, "completed");
      await assert.rejects(
        () =>
          as(
            owner,
            `UPDATE stock_intake_batch_approvals SET manifest='{}' WHERE batch_id='${batch.id}'`,
          ),
        /permission denied/,
      );
    },
  );
  await check(
    "shared reviewed drafts span receipts and partial outcomes require renewed review without replaying saved stock",
    async () => {
      const registered = await register(await create(), "shared.csv");
      const batchId = registered.batch.id;
      let inspectionJob = await readyJob("inspect");
      assert.equal(
        (
          await work(inspectionJob, "inspect", {
            sha256: registered.source.sha256,
            bytes: 100,
            inspection: { sheets: [{ name: "Stock", preview: [] }] },
          })
        ).ok,
        true,
      );
      let state = await view(batchId);
      await command({
        action: "configure",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        source_id: registered.source.id,
        duplicate_reason: "",
        plan: {
          sheets: [
            {
              name: "Stock",
              headerRow: 1,
              columns: { sku: 0, quantity: 1, receipt_unit_cost: 2 },
            },
          ],
        },
      });
      state = await view(batchId);
      await command({
        action: "process",
        batch_id: batchId,
        expected_revision: state.batch.revision,
      });
      const parseJob = await readyJob("parse"),
        newSku = "SHARED-" + randomUUID(),
        knownSku = await sql(`SELECT sku FROM products WHERE id='${product}'`);
      const rows = [newSku, newSku, knownSku].map((sku, index) => ({
        sheet: "Stock",
        row: index + 2,
        cells: { A: { value: sku, formatted: sku } },
        values: {
          sku,
          description: sku === newSku ? "Shared batch product" : null,
          barcode: null,
          quantity: 2,
          conversion: 1,
          purchase_unit: "piece",
          receipt_unit_cost: 5,
          supplier: "Shared supplier",
          invoice_reference: batchId + "-" + index,
        },
        warnings: [],
      }));
      assert.equal((await work(parseJob, "checkpoint", { rows })).ok, true);
      assert.equal(
        (
          await work(parseJob, "parsed", {
            stats: {
              prepared: 3,
              blank: 0,
              worksheets: [{ name: "Stock", rows: 3 }],
            },
          })
        ).ok,
        true,
      );
      state = await view(batchId);
      const shared = state.rows.find((row) => row.review.new_product)?.review
        .new_product;
      assert(shared);
      assert.equal(
        new Set(state.rows.filter((r) => r.draft_id).map((r) => r.draft_id))
          .size,
        1,
      );
      await command({
        action: "draft",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        document: {
          ...shared,
          stock_unit: "piece",
          cost_price: 7,
          selling_price: 10,
          confirmed: true,
        },
      });
      state = await view(batchId);
      await command({
        action: "rows",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        ids: state.rows.map((r) => r.id),
        patch: { conversion_confirmed: true },
      });
      state = await view(batchId);
      // Changing a shared stock unit must invalidate prior pack confirmation
      // on every appearance, without resetting the unrelated catalog row.
      for (const stock_unit of ["kg", "piece"]) {
        await command({
          action: "draft",
          batch_id: batchId,
          expected_revision: state.batch.revision,
          document: {
            ...shared,
            stock_unit,
            cost_price: 7,
            selling_price: 10,
            confirmed: true,
          },
        });
        state = await view(batchId);
        assert.equal(
          state.rows
            .filter((r) => r.draft_id === shared.draft_id)
            .every((r) => r.review.conversion_confirmed === false),
          true,
        );
        assert.equal(
          state.rows.find((r) => !r.draft_id).review.conversion_confirmed,
          true,
        );
      }
      await command({
        action: "rows",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        ids: state.rows.filter((r) => r.draft_id).map((r) => r.id),
        patch: { conversion_confirmed: true },
      });
      state = await view(batchId);
      await command({
        action: "prepare",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        group_ids: state.groups.map((g) => g.id),
      });
      for (let i = 0; i < 3; i++) {
        const job = await readyJob("prepare");
        const done = await work(job, "prepare");
        assert.equal(done.ok, true, JSON.stringify(done));
      }
      state = await view(batchId);
      assert.equal(state.summary.ready, 3);
      const before = Number(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
        ),
      );
      await command({
        action: "approve",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        approval_id: randomUUID(),
        receipts: state.groups.map((g) => ({
          group_id: g.id,
          hash: g.prepared_hash,
        })),
        exclusions_acknowledged: true,
      });
      const oldName = await sql(
        `SELECT name FROM products WHERE id='${product}'`,
      );
      await sql(
        `UPDATE products SET name=name||' changed after approval' WHERE id='${product}'`,
      );
      const outcomes = [];
      for (let i = 0; i < 3; i++) {
        const job = await readyJob("post");
        outcomes.push(await work(job, "post"));
      }
      assert.equal(
        outcomes.filter((o) => o.ok).length,
        2,
        JSON.stringify(outcomes),
      );
      assert.equal(
        await sql(`SELECT count(*) FROM products WHERE sku=${q(newSku)}`),
        "1",
      );
      assert.equal(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${shared.draft_id}' AND warehouse_id='${warehouse}'`,
        ),
        "4",
      );
      assert.equal(
        Number(
          await sql(
            `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
          ),
        ),
        before,
      );
      state = await view(batchId);
      assert.equal(state.batch.status, "partial");
      assert.equal(state.summary.posted, 2);
      const failed = state.groups.find((g) => g.status === "needs_review");
      assert(failed);
      await sql(`UPDATE products SET name=${q(oldName)} WHERE id='${product}'`);
      await command({
        action: "prepare",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        group_ids: [failed.id],
      });
      let job = await readyJob("prepare");
      assert.equal((await work(job, "prepare")).ok, true);
      state = await view(batchId);
      const renewed = state.groups.find((g) => g.id === failed.id);
      await command({
        action: "approve",
        batch_id: batchId,
        expected_revision: state.batch.revision,
        approval_id: randomUUID(),
        receipts: [{ group_id: renewed.id, hash: renewed.prepared_hash }],
        exclusions_acknowledged: true,
      });
      job = await readyJob("post");
      assert.equal((await work(job, "post")).ok, true);
      assert.equal(
        Number(
          await sql(
            `SELECT quantity FROM inventory WHERE product_id='${product}' AND warehouse_id='${warehouse}'`,
          ),
        ),
        before + 2,
      );
      assert.equal(
        await sql(
          `SELECT quantity FROM inventory WHERE product_id='${shared.draft_id}' AND warehouse_id='${warehouse}'`,
        ),
        "4",
      );
      assert.equal((await view(batchId)).summary.posted, 3);
    },
  );
  await check(
    "bounded retries, tenant concurrency, expired actors and cancellation preserve evidence",
    async () => {
      const sessions = [];
      for (let i = 0; i < 3; i++) sessions.push(await register(await create()));
      const first = await readyJob("inspect"),
        second = await readyJob("inspect");
      assert.equal(
        await service({ action: "claim", worker_id: "third-same-tenant" }),
        null,
      );
      assert.equal(
        (
          await work(first, "fail", {
            error: "Synthetic transient failure",
            permanent: false,
          })
        ).ok,
        false,
      );
      assert.equal(
        await sql(
          `SELECT run_after>now() FROM stock_intake_jobs WHERE id='${first.id}'`,
        ),
        "t",
      );
      await command({
        action: "cancel",
        batch_id: second.batch_id,
        expected_revision: (await view(second.batch_id)).batch.revision,
      });
      await assert.rejects(() => work(second, "heartbeat"), /lease|cancelled/);
      const third = await readyJob("inspect");
      assert.notEqual(third.id, second.id);
      // Consume and fail the remaining two source jobs three times each.
      await work(third, "fail", {
        error: "Synthetic transient failure",
        permanent: false,
      });
      for (let i = 0; i < 4; i++) {
        const job = await readyJob("inspect");
        await work(job, "fail", {
          error: "Synthetic transient failure",
          permanent: false,
        });
      }
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intake_jobs WHERE batch_id IN(${sessions.map((s) => q(s.batch.id)).join(",")}) AND status='failed' AND attempts=3`,
        ),
        "2",
      );
      await sql(`UPDATE users SET status='suspended' WHERE id='${owner}'`);
      try {
        await assert.rejects(() => view(first.batch_id), /Permission/);
      } finally {
        await sql(`UPDATE users SET status='active' WHERE id='${owner}'`);
      }
      const state = await view(first.batch_id);
      assert.equal(state.sources.length, 1);
      await command({
        action: "cancel",
        batch_id: first.batch_id,
        expected_revision: state.batch.revision,
      });
      assert.equal((await view(first.batch_id)).batch.status, "cancelled");
    },
  );
  await check(
    "file-count and exact upload-byte boundaries reject overflow without truncation",
    async () => {
      const small = await create();
      await assert.rejects(
        () =>
          command({
            action: "register",
            batch_id: small.id,
            expected_revision: small.revision,
            source: {
              id: randomUUID(),
              name: "too-large.xlsx",
              bytes: 20971521,
              sha256: "f".repeat(64),
            },
          }),
        /20 MiB/,
      );
      // Exercise every registration through the authenticated public command.
      await as(
        owner,
        `DO $$ DECLARE revision integer; n integer; BEGIN FOR n IN 1..100 LOOP
   SELECT b.revision INTO revision FROM stock_intake_batches b WHERE b.id='${small.id}';
   PERFORM public.stock_intake_batch_command(jsonb_build_object('action','register','batch_id','${small.id}','expected_revision',revision,'source',jsonb_build_object('id',gen_random_uuid(),'name','small-'||n||'.csv','bytes',1,'sha256',repeat('b',64))));END LOOP;END $$;`,
      );
      let state = await view(small.id);
      assert.equal(state.sources.length, 100);
      await assert.rejects(() => register(state.batch), /100 files/);
      await command({
        action: "cancel",
        batch_id: small.id,
        expected_revision: state.batch.revision,
      });
      const large = await create();
      await as(
        owner,
        `DO $$ DECLARE revision integer; n integer; BEGIN FOR n IN 1..13 LOOP
   SELECT b.revision INTO revision FROM stock_intake_batches b WHERE b.id='${large.id}';
   PERFORM public.stock_intake_batch_command(jsonb_build_object('action','register','batch_id','${large.id}','expected_revision',revision,'source',jsonb_build_object('id',gen_random_uuid(),'name','large-'||n||'.xlsx','bytes',CASE WHEN n=13 THEN 10485760 ELSE 20971520 END,'sha256',repeat('c',64))));END LOOP;END $$;`,
      );
      state = await view(large.id);
      assert.equal(state.summary.bytes, 262144000);
      await assert.rejects(
        () =>
          command({
            action: "register",
            batch_id: large.id,
            expected_revision: state.batch.revision,
            source: {
              id: randomUUID(),
              name: "overflow.csv",
              bytes: 1,
              sha256: "d".repeat(64),
            },
          }),
        /250 MiB/,
      );
      assert.equal((await view(large.id)).sources.length, 13);
      await command({
        action: "cancel",
        batch_id: large.id,
        expected_revision: state.batch.revision,
      });
    },
  );
  await check(
    "global lease limit admits four organizations and refuses the fifth",
    async () => {
      const prefix = "CAP-" + randomUUID();
      await sql(`DO $$ DECLARE business uuid; manager uuid; location uuid; batch uuid; source uuid; n integer; BEGIN
      FOR n IN 1..5 LOOP business:=gen_random_uuid();manager:=gen_random_uuid();location:=gen_random_uuid();batch:=gen_random_uuid();source:=gen_random_uuid();
        INSERT INTO organizations(id,name,slug) VALUES(business,'Synthetic lease shop','cap-'||business::text);
        INSERT INTO users(id,email,full_name,role,organization_id) VALUES(manager,manager::text||'@m2.invalid','Synthetic lease owner','business_owner',business);
        INSERT INTO warehouses(id,organization_id,name) VALUES(location,business,'Synthetic location');
        INSERT INTO stock_intake_batches(id,organization_id,created_by,mode,warehouse_id) VALUES(batch,business,manager,'additional_delivery',location);
        INSERT INTO stock_intake_sources(id,organization_id,batch_id,created_by,name,bytes,sha256,object_key) VALUES(source,business,batch,manager,'cap.csv',1,repeat('e',64),business::text||'/'||batch::text||'/'||source::text||'.csv');
        INSERT INTO stock_intake_jobs(organization_id,batch_id,actor_id,stage,source_id,content_revision,job_key) VALUES(business,batch,manager,'inspect',source,1,'${prefix}-'||n);
      END LOOP; END $$;`);
      const claimed = [];
      for (let i = 0; i < 4; i++)
        claimed.push(
          await service({ action: "claim", worker_id: "global-cap-fixture" }),
        );
      assert.equal(new Set(claimed.map((job) => job.organization_id)).size, 4);
      assert.equal(
        await service({ action: "claim", worker_id: "fifth-global-job" }),
        null,
      );
      await sql(
        `UPDATE stock_intake_jobs SET status='cancelled',lease_until=NULL WHERE job_key LIKE '${prefix}-%';UPDATE stock_intake_batches SET status='cancelled' WHERE id IN(SELECT batch_id FROM stock_intake_jobs WHERE job_key LIKE '${prefix}-%');`,
      );
    },
  );
  mkdirSync("build-evidence/m2", { recursive: true });
  writeFileSync(
    "build-evidence/m2/postgres-result.json",
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        synthetic: true,
        hostedStorageVerified: false,
        results,
      },
      null,
      2,
    ) + "\n",
  );
}
