import { z } from "zod";
import { apiContext } from "../auth/api-context";
import { batchCommandSchema, type BatchView } from "./contracts";
import { intakeErrorResponse } from "../stock-intake/http";

export const INTAKE_BUCKET = "stock-intake-originals";
const headers = { "Cache-Control": "private, no-store" };
const page = z.coerce.number().int().min(0).max(1_000_000);
const statusFor = (code?: string) =>
  code === "42501" ? 403 : code === "P0002" ? 404 : 409;
export async function readBatch(request: Request, id?: string) {
  try {
    const { db } = await apiContext();
    const query = new URL(request.url).searchParams;
    const batchId = id ? z.guid().parse(id) : undefined;
    const { data, error } = await db.rpc("read_stock_intake_batch", {
      target_id: batchId,
      row_offset: page.parse(query.get("offset") ?? 0),
      group_offset: page.parse(query.get("group_offset") ?? 0),
      target_source: query.get("source")
        ? z.guid().parse(query.get("source"))
        : undefined,
      issue_filter: z
        .enum(["all", "products", "quantities", "conversions", "costs"])
        .parse(query.get("issues") ?? "all"),
      selection_kind: query.get("selection")
        ? z.enum(["rows", "ready", "preparable"]).parse(query.get("selection"))
        : undefined,
    });
    if (error)
      return Response.json(
        { error: error.message },
        { status: statusFor(error.code), headers },
      );
    if (query.has("download")) {
      const sourceId = z.guid().parse(query.get("download"));
      const source = (data as BatchView).sources?.find(
        (source) => source.id === sourceId,
      );
      if (!source)
        return Response.json(
          { error: "Source unavailable" },
          { status: 404, headers },
        );
      const signed = await db.storage
        .from(INTAKE_BUCKET)
        .createSignedUrl(source.object_key, 60, { download: source.name });
      if (signed.error || !signed.data)
        return Response.json(
          {
            error:
              "Original file unavailable. Its receipt evidence is retained.",
          },
          { status: 503, headers },
        );
      return Response.json({ url: signed.data.signedUrl }, { headers });
    }
    return Response.json(data, { headers });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}

function requestGuard(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin)
    return Response.json(
      { error: "Foreign origin denied" },
      { status: 403, headers },
    );
  if (
    request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !==
    "application/json"
  )
    return Response.json(
      { error: "Use application/json" },
      { status: 415, headers },
    );
  return null;
}
async function jsonBody(request: Request) {
  if (!request.body)
    return Response.json(
      { error: "Batch command required" },
      { status: 400, headers },
    );
  const reader = request.body.getReader(),
    chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 4 * 1024 * 1024) {
        await reader.cancel();
        return Response.json(
          { error: "Batch command exceeds 4 MiB" },
          { status: 413, headers },
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}
export async function writeBatch(
  request: Request,
  id?: string,
  action?: string,
) {
  try {
    const guard = requestGuard(request);
    if (guard) return guard;
    const { db } = await apiContext();
    const input = await jsonBody(request);
    if (input instanceof Response) return input;
    if (!input || typeof input !== "object" || Array.isArray(input))
      return Response.json(
        { error: "Batch command required" },
        { status: 400, headers },
      );
    if (
      id &&
      "batch_id" in input &&
      (typeof input.batch_id !== "string" ||
        input.batch_id.toLowerCase() !== id.toLowerCase())
    )
      return Response.json(
        { error: "Batch ID does not match this endpoint" },
        { status: 400, headers },
      );
    const command = batchCommandSchema.parse({
      ...input,
      ...(id ? { batch_id: z.guid().parse(id) } : {}),
    });
    if (
      (!id && command.action !== "create") ||
      (id && command.action === "create") ||
      (action && action !== command.action)
    )
      return Response.json(
        { error: "Command does not match this endpoint" },
        { status: 400, headers },
      );
    const { data, error } = await db.rpc("stock_intake_batch_command", {
      command,
    });
    if (error)
      return Response.json(
        { error: error.message },
        { status: statusFor(error.code), headers },
      );
    if (command.action === "register") {
      const result = z
        .object({
          batch: z.object({ id: z.guid(), revision: z.number() }).passthrough(),
          source: z
            .object({
              id: z.guid(),
              status: z.string(),
              object_key: z.string(),
              excluded: z.boolean(),
            })
            .passthrough(),
        })
        .parse(data);
      if (result.source.status !== "uploading" || result.source.excluded)
        return Response.json({ ...result, upload: null }, { headers });
      const signed = await db.storage
        .from(INTAKE_BUCKET)
        .createSignedUploadUrl(result.source.object_key, { upsert: false });
      if (signed.error || !signed.data)
        return Response.json(
          {
            error:
              "Upload session unavailable. The file registration is retained; refresh its status before retrying.",
          },
          { status: 503, headers },
        );
      return Response.json({ ...result, upload: signed.data }, { headers });
    }
    return Response.json(data, {
      status: command.action === "create" ? 201 : 200,
      headers,
    });
  } catch (error) {
    return intakeErrorResponse(error);
  }
}
