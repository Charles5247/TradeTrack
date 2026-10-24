// Actual Next route handlers, with only session transport/query transport replaced
// for a disposable SQL-role fixture. This does not validate hosted Supabase JWTs.
import { AsyncLocalStorage } from "node:async_hooks";
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

export async function createManualFixtureAPI({
  sql,
  quote,
  owner,
  otherOwner,
  baseUrl,
}) {
  const context = new AsyncLocalStorage();
  globalThis.__m1FixtureContext = context;
  const aliasPath = ".m0-local/browser/api-context.ts";
  writeFileSync(
    aliasPath,
    "export async function apiContext(){const context=globalThis.__m1FixtureContext.getStore();if(!context)throw new Error('Fixture context missing');return context;}",
  );
  await build({
    stdin: {
      contents:
        "export {GET,POST} from './src/app/api/stock-intakes/route';export {GET as catalogGET} from './src/app/api/stock-intakes/catalog/route';",
      resolveDir: process.cwd(),
    },
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    outfile: ".m0-local/browser/m1-routes.mjs",
    plugins: [
      {
        name: "fixture-context",
        setup(builder) {
          builder.onResolve({ filter: /^@\/lib\/auth\/api-context$/ }, () => ({
            path: `${process.cwd()}/${aliasPath}`,
          }));
        },
      },
    ],
  });
  const routes = await import(
    pathToFileURL(`${process.cwd()}/.m0-local/browser/m1-routes.mjs`).href
  );
  const identifier = (value) => {
    if (!/^[a-z_]+$/.test(value)) throw new Error("Invalid fixture identifier");
    return value;
  };
  const tables = new Set([
    "stock_intakes",
    "products",
    "warehouses",
    "inventory",
  ]);
  function client(actor) {
    const query = (statement) =>
      sql(`SET ROLE authenticated;SET "test.uid"=${quote(actor)};${statement}`);
    return {
      from(table) {
        if (!tables.has(table)) throw new Error("Fixture table not allowed");
        let columns = "*",
          conditions = [],
          orders = [],
          limit = 1000,
          offset = 0,
          single = false,
          counted = false;
        const builder = {
          select(value, options = {}) {
            counted = options.count === "exact";
            columns =
              value === "*" ? "*" : value.split(",").map(identifier).join(",");
            return builder;
          },
          eq(key, value) {
            conditions.push(`${identifier(key)}=${quote(value)}`);
            return builder;
          },
          is(key,value) {
            if(value!==null)throw new Error('Fixture only supports IS NULL');
            conditions.push(`${identifier(key)} IS NULL`);return builder;
          },
          in(key, values) {
            conditions.push(
              `${identifier(key)} IN(${values.map(quote).join(",")})`,
            );
            return builder;
          },
          ilike(key, value) {
            conditions.push(`${identifier(key)} ILIKE ${quote(value)}`);
            return builder;
          },
          order(key, options = {}) {
            orders.push(
              `${identifier(key)} ${options.ascending === false ? "DESC" : "ASC"}`,
            );
            return builder;
          },
          limit(value) {
            limit = Number(value);
            return builder;
          },
          range(start, end) {
            offset = Number(start);
            limit = Number(end) - offset + 1;
            return builder;
          },
          single() {
            single = true;
            return builder;
          },
          then(resolve, reject) {
            return (async () => {
              try {
                const rows = JSON.parse(
                  await query(
                    `SELECT COALESCE(json_agg(r),'[]'::json) FROM (SELECT ${columns} FROM public.${table}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}${orders.length ? ` ORDER BY ${orders.join(",")}` : ""} LIMIT ${limit} OFFSET ${offset}) r`,
                  ),
                );
                const count = counted
                  ? Number(
                      await query(
                        `SELECT count(*) FROM public.${table}${conditions.length ? ` WHERE ${conditions.join(" AND ")}` : ""}`,
                      ),
                    )
                  : null;
                return single
                  ? rows.length === 1
                    ? { data: rows[0], error: null }
                    : {
                        data: null,
                        error: { message: "Not found", code: "PGRST116" },
                      }
                  : {
                      data: rows,
                      error: null,
                      count,
                    };
              } catch (error) {
                return {
                  data: null,
                  error: {
                    message:
                      error.stderr?.match(/ERROR:\s*([^\r\n]+)/)?.[1] ??
                      error.message,
                  },
                };
              }
            })().then(resolve, reject);
          },
        };
        return builder;
      },
      async rpc(name, args) {
        const values = {
          save_stock_intake: () =>
            `${quote(args.receipt_id)},${quote(args.expected_revision)},${quote(JSON.stringify(args.receipt_document))}::jsonb`,
          approve_stock_intake: () =>
            [args.receipt_id, args.expected_revision, args.expected_hash]
              .map(quote)
              .join(","),
          post_stock_intake: () =>
            [args.receipt_id, args.approval_id].map(quote).join(","),
        };
        if (!values[name]) throw new Error("Fixture RPC not allowed");
        try {
          return {
            data: JSON.parse(
              await query(`SELECT public.${name}(${values[name]()})`),
            ),
            error: null,
          };
        } catch (error) {
          return {
            data: null,
            error: {
              message:
                error.stderr?.match(/ERROR:\s*([^\r\n]+)/)?.[1] ??
                error.message,
            },
          };
        }
      },
    };
  }
  let loseNext = false;
  return async function handle(request, response) {
    if (request.url === "/lose-next-intake") {
      loseNext = true;
      response.end("armed");
      return true;
    }
    if (!request.url.startsWith("/api/stock-intakes")) return false;
    const actor = request.headers["x-m0-actor"];
    if (![owner, otherOwner].includes(actor))
      throw new Error("Unknown fixture actor");
    const profile = JSON.parse(
      await sql(
        `SELECT row_to_json(u) FROM public.users u WHERE id=${quote(actor)}`,
      ),
    );
    if (
      profile.status !== "active" ||
      !["business_owner", "admin"].includes(profile.role)
    )
      throw new Error("Active fixture manager required");
    const chunks = [];
    let bytes = 0;
    for await (const chunk of request) {
      bytes += chunk.length;
      if (bytes > 2097152) throw new Error("Request too large");
      chunks.push(chunk);
    }
    const body = request.method === "POST" ? Buffer.concat(chunks) : undefined;
    const input = new Request(new URL(request.url, baseUrl), {
      method: request.method,
      headers: request.headers,
      body,
    });
    let result = await context.run(
      { db: client(actor), profile, org: profile.organization_id },
      () =>
        request.url.startsWith("/api/stock-intakes/catalog")
          ? routes.catalogGET(input)
          : request.method === "POST"
            ? routes.POST(input)
            : routes.GET(input),
    );
    if (
      loseNext &&
      request.method === "POST" &&
      JSON.parse(body.toString()).action === "post" &&
      result.ok
    ) {
      loseNext = false;
      result = Response.json(
        {
          error:
            "Simulated acknowledgment loss after receipt commit. Refresh saved status or retry.",
        },
        { status: 503 },
      );
    }
    response.statusCode = result.status;
    for (const [name, value] of result.headers) response.setHeader(name, value);
    response.end(await result.text());
    return true;
  };
}
