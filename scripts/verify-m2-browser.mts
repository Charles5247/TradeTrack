// Loopback-only acceptance fixture. Actual UI/API/SQL/worker; synthetic sessions
// and local private-file transport. Never reads app .env or hosted credentials.
import { createServer } from "node:http";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import * as XLSX from "xlsx";
import { createLocalIntakeSql } from "./local-intake-sql.mjs";
import { createManualFixtureAPI } from "./m1-fixture-api.mjs";
import {
  processIntakeJob,
  type WorkerDriver,
} from "../src/lib/stock-intake-batches/worker.mjs";
import { jobSchema } from "../src/lib/stock-intake-batches/contracts.js";

const target = JSON.parse(readFileSync(".m0-local/active-target.json", "utf8")),
  sql = createLocalIntakeSql(target);
const port = 57140,
  baseUrl = `http://127.0.0.1:${port}`,
  q = (v: unknown) => `'${String(v).replaceAll("'", "''")}'`;
const owner = "20000000-0000-0000-0000-000000000001",
  otherOrg = "10000000-0000-0000-0000-000000000066",
  otherOwner = "20000000-0000-0000-0000-000000000066";
await sql(`INSERT INTO organizations(id,name,slug) VALUES('${otherOrg}','M2 other shop','m2-browser-other') ON CONFLICT DO NOTHING;
 INSERT INTO users(id,email,full_name,role,organization_id) VALUES('${otherOwner}','other@m2.invalid','M2 Other','business_owner','${otherOrg}') ON CONFLICT DO NOTHING;`);
mkdirSync(".m0-local/m2-browser/files", { recursive: true });
mkdirSync(".m0-local/browser", { recursive: true });
const context = new AsyncLocalStorage();
(globalThis as Record<string, unknown>).__m2Context = context;
writeFileSync(
  ".m0-local/m2-browser/api-context.ts",
  "export async function apiContext(){return globalThis.__m2Context.getStore();}",
);
await build({
  stdin: {
    contents:
      "export {readBatch,writeBatch} from './src/lib/stock-intake-batches/http';",
    resolveDir: process.cwd(),
  },
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  outfile: ".m0-local/m2-browser/routes.mjs",
  plugins: [
    {
      name: "fixture-context",
      setup(builder) {
        builder.onResolve({ filter: /^\.\.\/auth\/api-context$/ }, () => ({
          path: `${process.cwd()}/.m0-local/m2-browser/api-context.ts`,
        }));
      },
    },
  ],
});
const routes = await import(
  pathToFileURL(`${process.cwd()}/.m0-local/m2-browser/routes.mjs`).href
);
await build({
  entryPoints: ["scripts/m2-browser-fixture.tsx"],
  bundle: true,
  platform: "browser",
  format: "esm",
  target: "es2022",
  jsx: "automatic",
  outfile: ".m0-local/m2-browser/main.js",
  define: {
    "process.env": JSON.stringify({ NODE_ENV: "production" }),
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_PUBLIC_STOCK_INTAKE_BATCHES_ENABLED": '"true"',
  },
});
const css = await postcss([tailwind()]).process(
  readFileSync("src/app/globals.css", "utf8"),
  { from: "src/app/globals.css" },
);
writeFileSync(".m0-local/m2-browser/style.css", css.css);
const sku = await sql(
  "SELECT sku FROM products WHERE id='30000000-0000-0000-0000-000000000001'",
);
const book = XLSX.utils.book_new(),
  invoice = randomUUID();
for (const name of ["First", "Second"])
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([
      ["SKU", "Quantity", "Cost", "Unit", "Pack", "Supplier", "Invoice"],
      ...Array.from({ length: 600 }, () => [
        sku,
        1,
        0,
        "piece",
        1,
        "Browser supplier",
        invoice,
      ]),
    ]),
    name,
  );
writeFileSync(
  ".m0-local/m2-browser/synthetic.xlsx",
  XLSX.write(book, { type: "buffer", bookType: "xlsx", compression: true }),
);
const authenticated = (actor: string, statement: string) =>
  sql(`SET ROLE authenticated;SET "test.uid"=${q(actor)};${statement}`);
const tokens = new Map<
  string,
  { key: string; actor: string; expires: number }
>();
const keyPath = (key: string) => {
  if (!/^[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}\.(csv|xlsx)$/.test(key))
    throw new Error("Bad source key");
  return `.m0-local/m2-browser/files/${key.split("/").join("_")}`;
};
function client(actor: string) {
  return {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (
        !["stock_intake_batch_command", "read_stock_intake_batch"].includes(
          name,
        )
      )
        throw new Error("Unknown fixture RPC");
      const values =
        name === "stock_intake_batch_command"
          ? `${q(JSON.stringify(args.command))}::jsonb`
          : [
              args.target_id ? q(args.target_id) : "NULL",
              Number(args.row_offset ?? 0),
              Number(args.group_offset ?? 0),
              args.target_source ? q(args.target_source) : "NULL",
              false,
              q(args.issue_filter ?? "all"),
              args.selection_kind ? q(args.selection_kind) : "NULL",
            ].join(",");
      try {
        return {
          data: JSON.parse(
            await authenticated(actor, `SELECT public.${name}(${values})`),
          ),
          error: null,
        };
      } catch (error) {
        return {
          data: null,
          error: {
            message: (error as Error).message,
            code: /Permission|permission/.test((error as Error).message)
              ? "42501"
              : /Batch unavailable/.test((error as Error).message)?"P0002":"40001",
          },
        };
      }
    },
    storage: {
      from: () => ({
        createSignedUploadUrl: async (key: string) => {
          const allowed = await authenticated(
            actor,
            `SELECT id FROM stock_intake_sources WHERE object_key=${q(key)} AND status='uploading' AND created_by=${q(actor)}`,
          );
          if (!allowed) return { data: null, error: { message: "Denied" } };
          const token = randomUUID();
          tokens.set(token, { key, actor, expires: Date.now() + 7200000 });
          return {
            data: { signedUrl: `${baseUrl}/upload/${token}` },
            error: null,
          };
        },
        createSignedUrl: async (key: string) => {
          const allowed = await authenticated(
            actor,
            `SELECT id FROM storage.objects WHERE bucket_id='stock-intake-originals' AND name=${q(key)}`,
          );
          if (!allowed) return { data: null, error: { message: "Denied" } };
          const token = randomUUID();
          tokens.set(token, { key, actor, expires: Date.now() + 60000 });
          return {
            data: { signedUrl: `${baseUrl}/download/${token}` },
            error: null,
          };
        },
      }),
    },
  };
}
const manual = await createManualFixtureAPI({
  sql,
  quote: q,
  owner,
  otherOwner,
  baseUrl,
});
const controller = new AbortController();
const workerRpc = async (command: Record<string, unknown>) =>
  JSON.parse(
    (await sql(
      `SET ROLE service_role;SET "test.uid"='';SELECT public.stock_intake_job_command(${q(JSON.stringify(command))}::jsonb)`,
    )) || "null",
  );
const driver: WorkerDriver = {
  rpc: workerRpc,
  download: async (source) => {
    const path = keyPath(source.object_key);
    if (!existsSync(path)) {
      const { ProcessingError } = await import(
        "../src/lib/stock-intake-batches/worker.mjs"
      );
      throw new ProcessingError("Upload pending", false, false, true);
    }
    return new Uint8Array(readFileSync(path));
  },
};
const loop = (async () => {
  while (!controller.signal.aborted) {
    try {
      const raw = await workerRpc({
        action: "claim",
        worker_id: "m2-browser-fixture",
      });
      if (raw) {
        await processIntakeJob(driver, jobSchema.parse(raw), {
          signal: controller.signal,
        });
        continue;
      }
    } catch (error) {
      console.error("Fixture worker:", (error as Error).message);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
})();
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", baseUrl);
    if (req.method === "POST" && url.pathname === "/shutdown") {
      controller.abort();
      await loop;
      res.end("stopping");
      server.close();
      return;
    }
    if (url.pathname === "/seed") {
      const profile = JSON.parse(
          await sql(`SELECT row_to_json(u) FROM users u WHERE id='${owner}'`),
        ),
        other = JSON.parse(
          await sql(
            `SELECT row_to_json(u) FROM users u WHERE id='${otherOwner}'`,
          ),
        );
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ profile, other }));
      return;
    }
    if (
      url.pathname.startsWith("/upload/") ||
      url.pathname.startsWith("/download/")
    ) {
      const token = tokens.get(url.pathname.split("/")[2]);
      if (!token || token.expires < Date.now()) {
        res.writeHead(403);
        res.end();
        return;
      }
      if (req.method === "PUT" && url.pathname.startsWith("/upload/")) {
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 20 * 1024 * 1024) throw new Error("File too large");
          chunks.push(chunk);
        }
        const path = keyPath(token.key);
        if (existsSync(path))
          throw new Error("Immutable original already exists");
        await authenticated(
          token.actor,
          `INSERT INTO storage.objects(bucket_id,name,metadata) VALUES('stock-intake-originals',${q(token.key)},${q(JSON.stringify({ size: bytes }))}::jsonb)`,
        );
        writeFileSync(path, Buffer.concat(chunks), { flag: "wx" });
        tokens.delete(url.pathname.split("/")[2]);
        res.end("saved");
        return;
      }
      if (req.method === "GET" && url.pathname.startsWith("/download/")) {
        res.end(readFileSync(keyPath(token.key)));
        return;
      }
      res.writeHead(405);
      res.end();
      return;
    }
    if (url.pathname.startsWith("/api/stock-intake-batches")) {
      const actor = String(req.headers["x-m0-actor"] ?? "");
      if (![owner, otherOwner].includes(actor))
        throw new Error("Unknown actor");
      const profile = JSON.parse(
        await sql(`SELECT row_to_json(u) FROM users u WHERE id=${q(actor)}`),
      );
      if (
        profile.status !== "active" ||
        !["business_owner", "admin"].includes(profile.role)
      )
        throw new Error("Permission denied");
      const chunks: Buffer[] = [];
      let bytes = 0;
      for await (const chunk of req) {
        bytes += chunk.length;
        if (bytes > 4194304) throw new Error("Request too large");
        chunks.push(chunk);
      }
      const input = new Request(url, {
        method: req.method,
        headers: req.headers as HeadersInit,
        ...(req.method !== "GET" ? { body: Buffer.concat(chunks) } : {}),
      });
      const parts = url.pathname.split("/").filter(Boolean);
      const result: Response = await context.run(
        { db: client(actor), org: profile.organization_id, profile },
        () =>
          req.method === "GET"
            ? routes.readBatch(input, parts[2])
            : routes.writeBatch(input, parts[2], parts[3]),
      );
      res.writeHead(result.status, Object.fromEntries(result.headers));
      res.end(await result.text());
      return;
    }
    if (await manual(req, res)) return;
    if (url.pathname === "/main.js" || url.pathname === "/style.css") {
      res.setHeader(
        "content-type",
        url.pathname.endsWith(".js") ? "text/javascript" : "text/css",
      );
      res.end(readFileSync(`.m0-local/m2-browser${url.pathname}`));
      return;
    }
    res.setHeader("content-type", "text/html");
    res.end(
      '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1"><title>M2 local acceptance</title><link rel="stylesheet" href="/style.css"><div id="root"></div><script type="module" src="/main.js"></script></html>',
    );
  } catch (error) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: (error as Error).message }));
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`M2 browser fixture ${baseUrl}, database ${target.database}`),
);
