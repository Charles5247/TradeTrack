// Called by the disposable database harness with --m1. No application credentials.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";

export async function verifyManualIntake({
  sql,
  rpc,
  receipt,
  quantity,
  org,
  owner,
  cashier,
  platform,
  product,
  product2,
  warehouse,
}) {
  const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
  const json = (value) => `${quote(JSON.stringify(value))}::jsonb`;
  const results = [];
  const check = async (name, run) => {
    await run();
    results.push({ name, status: "passed" });
    console.log(`PASS M1 ${name}`);
  };
  const line = (id = product, qty = 10, conversion = 12) => ({
    id: randomUUID(),
    product_id: id,
    new_product: null,
    quantity: qty,
    purchase_unit: "carton",
    conversion,
    conversion_confirmed: true,
    receipt_unit_cost: 3.25,
  });
  const document = (lines = [line()], mode = "additional_delivery") => ({
    mode,
    warehouse_id: warehouse,
    supplier: "",
    invoice_reference: "",
    notes: "Synthetic manual receipt",
    duplicate_reason: "",
    lines,
  });
  const save = async (
    doc = document(),
    id = randomUUID(),
    revision = 0,
    actor = owner,
  ) =>
    JSON.parse(
      await sql(
        `SELECT public.save_stock_intake('${id}',${revision},${json(doc)})`,
        actor,
      ),
    );
  const approve = async (saved, actor = owner) =>
    JSON.parse(
      await sql(
        `SELECT public.approve_stock_intake('${saved.id}',${saved.revision},'${saved.payload_hash}')`,
        actor,
      ),
    );
  const post = async (saved, actor = owner) =>
    JSON.parse(
      await sql(
        `SELECT public.post_stock_intake('${saved.id}','${saved.approval_id}')`,
        actor,
      ),
    );
  const ready = async (doc = document()) => approve(await save(doc));
  await check("disabled-by-default intake has no effects", async () => {
    await assert.rejects(() => save(), /disabled/);
    assert.equal(await sql("SELECT count(*) FROM stock_intakes"), "0");
    await sql(
      "UPDATE track_private.stock_command_settings SET intake_enabled=true",
    );
  });
  await check("stock unit and variant changes require renewed review before initial stock", async () => {
    const id=randomUUID();
    await sql(`INSERT INTO products(id,organization_id,name,sku,selling_price,cost_price) VALUES('${id}','${org}','Unit review','UNIT-${id}',10,1)`);
    const approved=await ready(document([line(id,1,1)]));
    await sql(`UPDATE products SET stock_unit='kg',variant_size='Large' WHERE id='${id}'`);
    await assert.rejects(()=>post(approved),/identity changed/);
    assert.equal(await sql(`SELECT count(*) FROM inventory WHERE product_id='${id}'`),'0');
    const revised=await save(approved.document,approved.id,approved.revision);
    assert.equal(revised.document.lines[0].product_snapshot.stock_unit,'kg');
    await post(await approve(revised));
  });
  await check(
    "reviewed carton conversion, cost separation, approval binding and replay",
    async () => {
      const doc = document(),
        id = randomUUID(),
        before = await quantity();
      const saved = await save(doc, id),
        retry = await save(doc, id);
      assert.equal(saved.revision, retry.revision);
      assert.equal(saved.document.lines[0].stock_units, 120);
      assert.equal(saved.document.receipt_cost_total, 32.5);
      await assert.rejects(
        () =>
          sql(`SELECT public.approve_stock_intake('${id}',1,'wrong')`, owner),
        /changed/,
      );
      const approved = await approve(saved),
        result = await post(approved);
      assert.equal(await quantity(), before + 120);
      assert.deepEqual(await post(approved), result);
      assert.equal(
        await sql(
          `SELECT cost_price||','||selling_price FROM products WHERE id='${product}'`,
        ),
        "50.00,100.00",
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM inventory_movements WHERE notes='Approved stock receipt ${id}' AND quantity=120`,
        ),
        "1",
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intake_lines WHERE receipt_id='${id}' AND stock_units=120`,
        ),
        "1",
      );
      await assert.rejects(() => save(doc, id, 1), /immutable/);
    },
  );
  await check(
    "receipt revision invalidates approval and preserves old evidence",
    async () => {
      const approved = await ready(document([line(product, 2, 1)]));
      const edited = await save(
        document([line(product, 3, 1)]),
        approved.id,
        1,
      );
      assert.equal(edited.revision, 2);
      assert.equal(edited.approval_id, null);
      await assert.rejects(() => post(approved), /Recorded approval/);
      await assert.rejects(
        () => save(document(), approved.id, 1),
        /revision changed/,
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intake_revisions WHERE receipt_id='${approved.id}'`,
        ),
        "2",
      );
      await assert.rejects(
        () =>
          sql(
            `UPDATE stock_intake_approvals SET payload_hash='forged' WHERE receipt_id='${approved.id}'`,
          ),
        /immutable/i,
      );
      await post(await approve(edited));
    },
  );
  await check(
    "concurrent delivery, checkout and duplicate submissions preserve increments",
    async () => {
      const a = await ready(document([line(product, 5, 1)])),
        b = await ready(document([line(product, 7, 1)])),
        before = await quantity();
      await Promise.all([post(a), post(a), post(b), rpc(receipt())]);
      assert.equal(await quantity(), before + 11);
    },
  );
  await check(
    "opening stock is serialized and requires no position or movement history",
    async () => {
      const initial = randomUUID();
      await sql(
        `INSERT INTO products(id,organization_id,name,sku) VALUES('${initial}','${org}','M1 initial','${initial}')`,
      );
      const a = await ready(document([line(initial, 2, 1)], "opening_stock")),
        b = await ready(document([line(initial, 3, 1)], "opening_stock"));
      const outcomes = await Promise.allSettled([post(a), post(b)]);
      assert.equal(
        outcomes.filter((value) => value.status === "fulfilled").length,
        1,
      );
      const failed = outcomes[0].status === "rejected" ? a : b;
      await sql(`DELETE FROM inventory WHERE product_id='${initial}'`);
      await assert.rejects(() => post(failed), /no longer initial/);
      await assert.rejects(
        async () =>
          post(await ready(document([line(product, 1, 1)], "opening_stock"))),
        /no longer initial/,
      );
    },
  );
  await check(
    "all-line rollback also removes newly created draft products",
    async () => {
      const overflow = randomUUID();
      await sql(
        `INSERT INTO products(id,organization_id,name,sku) VALUES('${overflow}','${org}','M1 overflow','${overflow}'); INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${org}','${overflow}','${warehouse}',2147483647)`,
      );
      const draft = {
        draft_id: randomUUID(),
        name: "M1 rolled-back draft",
        sku: randomUUID(),
        barcode: "",
        selling_price: 100,
        cost_price: 12,
        confirmed: true,
      };
      const doc = document([
          { ...line(null, 1, 1), new_product: draft },
          line(product, 3, 1),
          line(overflow, 1, 1),
        ]),
        prepared = await ready(doc),
        before = await quantity();
      await assert.rejects(() => post(prepared), /integer limit/);
      assert.equal(await quantity(), before);
      assert.equal(
        await sql(`SELECT count(*) FROM products WHERE id='${draft.draft_id}'`),
        "0",
      );
      assert.equal(
        await sql(`SELECT status FROM stock_intakes WHERE id='${prepared.id}'`),
        "approved",
      );
    },
  );
  await check(
    "product identity changes require new review, cost-only changes remain separate",
    async () => {
      const prepared = await ready(document([line(product2, 1, 1)]));
      await sql(
        `UPDATE products SET name='M1 reviewed identity change' WHERE id='${product2}'`,
      );
      await assert.rejects(() => post(prepared), /identity changed/);
      const revised = await approve(
        await save(prepared.document, prepared.id, 1),
      );
      await sql(`UPDATE products SET cost_price=51 WHERE id='${product2}'`);
      await post(revised);
      assert.equal(
        await sql(`SELECT cost_price FROM products WHERE id='${product2}'`),
        "51.00",
      );
    },
  );
  await check(
    "shared explicit product draft creates one catalog product for multiple lines",
    async () => {
      const draft = {
        draft_id: randomUUID(),
        name: "M1 reviewed product",
        sku: randomUUID(),
        barcode: randomUUID(),
        selling_price: 99,
        cost_price: 20,
        confirmed: true,
      };
      await assert.rejects(
        () =>
          save(
            document([
              { ...line(null, 1, 1), new_product: draft },
              {
                ...line(null, 1, 1),
                new_product: {
                  ...draft,
                  draft_id: draft.draft_id.toUpperCase(),
                  name: "Conflicting reviewed identity",
                },
              },
            ]),
          ),
        /Shared product draft differs/,
      );
      const doc = document([
        { ...line(null, 2, 1), new_product: draft },
        {
          ...line(null, 3, 2),
          new_product: { ...draft, draft_id: draft.draft_id.toUpperCase() },
        },
      ]);
      const prepared = await ready(doc),
        result = await post(prepared);
      assert.equal(result.stocks.length, 1);
      assert.equal(result.stocks[0].quantity, 8);
      assert.equal(
        new Set(result.lines.map((line) => line.product_id)).size,
        1,
      );
      assert.equal(
        await sql(`SELECT count(*) FROM products WHERE id='${draft.draft_id}'`),
        "1",
      );
      await assert.rejects(
        () =>
          save(
            document([
              {
                ...line(null, 1, 1),
                new_product: { ...draft, draft_id: randomUUID() },
              },
            ]),
          ),
        /conflicts/,
      );
    },
  );
  await check(
    "duplicate invoice requires explicit reviewed acknowledgment",
    async () => {
      const doc = {
        ...document([line(product, 1, 1)]),
        supplier: "M1 supplier",
        invoice_reference: "INV M1 duplicate",
      };
      await post(await ready(doc));
      const duplicate = await ready(doc),
        before = await quantity();
      await assert.rejects(() => post(duplicate), /Possible duplicate/);
      assert.equal(await quantity(), before);
      const reviewed = await approve(
        await save(
          {
            ...doc,
            duplicate_reason: "Confirmed legitimate repeated delivery",
          },
          duplicate.id,
          1,
        ),
      );
      await post(reviewed);
      assert.equal(await quantity(), before + 1);
    },
  );
  await check(
    "concurrent new-product identifier collision returns one receipt to review",
    async () => {
      const sku = randomUUID(),
        draft = {
          draft_id: randomUUID(),
          name: "M1 competing draft",
          sku,
          barcode: randomUUID(),
          selling_price: 20,
          cost_price: 10,
          confirmed: true,
        };
      const a = await ready(
        document([{ ...line(null, 1, 1), new_product: draft }]),
      );
      const b = await ready(
        document([
          {
            ...line(null, 1, 1),
            new_product: { ...draft, draft_id: randomUUID() },
          },
        ]),
      );
      const outcomes = await Promise.allSettled([post(a), post(b)]);
      assert.equal(
        outcomes.filter((result) => result.status === "fulfilled").length,
        1,
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM products WHERE organization_id='${org}' AND sku='${sku}'`,
        ),
        "1",
      );
    },
  );
  await check(
    "malformed, fractional, missing-cost and unconfirmed rows never post",
    async () => {
      for (const invalid of [
        { ...line(), quantity: 1.5 },
        { ...line(), conversion_confirmed: false },
        { ...line(), conversion_confirmed: "yes" },
        { ...line(), quantity: "1" },
        { ...line(), purchase_unit: { unclear: "carton" } },
        { ...line(), new_product: [] },
        { ...line(), receipt_unit_cost: null },
        { ...line(), receipt_unit_cost: 0.291 },
        { ...line(), conversion: 2147483647 },
      ])
        await assert.rejects(() => save(document([invalid])));
      await assert.rejects(
        () => save({ ...document(), warehouse_id: randomUUID() }),
        /Valid mode/,
      );
      await assert.rejects(
        () => save({ ...document(), notes: { untrusted: "object" } }),
        /bounded text/,
      );
    },
  );
  await check(
    "fresh actor authorization, tenant isolation, immutable evidence and disabled replay",
    async () => {
      const prepared = await ready(document([line(product, 1, 1)]));
      await assert.rejects(() => post(prepared, cashier), /manager/);
      assert.equal(
        await sql("SELECT count(*) FROM stock_intakes", cashier),
        "0",
      );
      await assert.rejects(
        () =>
          sql(
            `UPDATE stock_intakes SET status='posted' WHERE id='${prepared.id}'`,
            owner,
          ),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          sql(
            `SET ROLE anon; SELECT public.post_stock_intake('${prepared.id}','${prepared.approval_id}')`,
          ),
        /permission denied/,
      );
      await sql(
        `SET "test.uid"='${platform}'; UPDATE users SET status='suspended' WHERE id='${owner}'`,
      );
      await assert.rejects(() => post(prepared), /manager/);
      assert.equal(await sql("SELECT count(*) FROM stock_intakes", owner), "0");
      await sql(
        `SET "test.uid"='${platform}'; UPDATE users SET status='active' WHERE id='${owner}'`,
      );
      const result = await post(prepared);
      await sql(
        "UPDATE track_private.stock_command_settings SET intake_enabled=false",
      );
      assert.deepEqual(await post(prepared), result);
      await assert.rejects(() => save(), /disabled/);
    },
  );
  await check(
    "cross-tenant receipt commands and a changed approving role are denied",
    async () => {
      // Re-enable only this disposable database after the disabled-replay test.
      await sql(
        "UPDATE track_private.stock_command_settings SET intake_enabled=true",
      );
      const otherOrg = randomUUID(),
        otherOwner = randomUUID(),
        admin = randomUUID();
      await sql(`INSERT INTO organizations(id,name,slug) VALUES('${otherOrg}','M1 foreign shop','${otherOrg}');
      INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${otherOwner}','${otherOwner}@m1.invalid','M1 Foreign','business_owner','${otherOrg}'),('${admin}','${admin}@m1.invalid','M1 Admin','admin','${org}');
      INSERT INTO merchants(organization_id,business_name,registration_number,contact_name,contact_email,business_owner_user_id) VALUES('${otherOrg}','M1 foreign shop','${otherOrg}','M1 Foreign','foreign@m1.invalid','${otherOwner}');
      SET "test.uid"='${platform}'; UPDATE merchants SET verification_status='verified' WHERE organization_id='${otherOrg}'`);
      const prepared = await ready(document([line(product, 1, 1)]));
      await assert.rejects(
        () => post(prepared, otherOwner),
        /Receipt unavailable/,
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM stock_intakes WHERE id='${prepared.id}'`,
          otherOwner,
        ),
        "0",
      );
      const owned = await save(
          document([line(product, 1, 1)]),
          randomUUID(),
          0,
          admin,
        ),
        approved = await approve(owned, admin);
      await assert.rejects(() => post(approved, owner), /Recorded approval/);
      await sql(
        `SET "test.uid"='${platform}'; UPDATE users SET role='cashier' WHERE id='${admin}'`,
      );
      await assert.rejects(() => post(approved, admin), /manager/);
      await sql(
        `SET "test.uid"='${platform}'; UPDATE users SET role='admin' WHERE id='${admin}'`,
      );
      await post(approved, admin);
    },
  );
  await check(
    "historical stock-tenant conflicts fail closed instead of reporting a false delivery",
    async () => {
      const foreign = randomUUID(),
        legacyProduct = randomUUID();
      await sql(`INSERT INTO organizations(id,name,slug) VALUES('${foreign}','M1 historical violation','${foreign}');
      INSERT INTO products(id,organization_id,name,sku) VALUES('${legacyProduct}','${org}','M1 historical stock link','${legacyProduct}');
      BEGIN; SET LOCAL session_replication_role=replica;
      INSERT INTO inventory(organization_id,product_id,warehouse_id,quantity) VALUES('${foreign}','${legacyProduct}','${warehouse}',0); COMMIT;`);
      // Only this synthetic fixture bypasses RI triggers to reproduce pre-existing
      // invalid data. The local setting ends with the transaction; no application
      // command or migration weakens a constraint or repairs merchant data.
      const prepared = await ready(document([line(legacyProduct, 1, 1)]));
      await assert.rejects(() => post(prepared), /tenant reconciliation/);
      assert.equal(
        await sql(`SELECT status FROM stock_intakes WHERE id='${prepared.id}'`),
        "approved",
      );
      assert.equal(
        await sql(
          `SELECT count(*) FROM inventory_movements WHERE notes='Approved stock receipt ${prepared.id}'`,
        ),
        "0",
      );
      await sql(
        `UPDATE inventory SET organization_id='${org}' WHERE product_id='${legacyProduct}' AND warehouse_id='${warehouse}'`,
      );
      const result = await post(prepared);
      assert.equal(result.stocks[0].quantity, 1);
    },
  );
  mkdirSync("build-evidence/m1", { recursive: true });
  writeFileSync(
    "build-evidence/m1/postgres-result.json",
    JSON.stringify(
      { generatedAt: new Date().toISOString(), synthetic: true, results },
      null,
      2,
    ) + "\n",
  );
}
