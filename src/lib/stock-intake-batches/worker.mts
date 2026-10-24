import { fork } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../supabase/types.js";
import { jobSchema, type IntakeJob } from "./contracts.js";
import type { PreparedSpreadsheetRow } from "./spreadsheet.js";

export const INTAKE_BUCKET = "stock-intake-originals";
export class ProcessingError extends Error {
  constructor(
    message: string,
    readonly permanent = false,
    readonly alreadyRecorded = false,
    readonly missingUpload = false,
  ) {
    super(message);
  }
}
export interface WorkerDriver {
  rpc(command: Record<string, unknown>): Promise<unknown>;
  download(
    source: NonNullable<IntakeJob["source"]>,
    signal: AbortSignal,
  ): Promise<Uint8Array>;
}
export interface WorkerOptions {
  signal?: AbortSignal;
  heartbeatMs?: number;
  parserActiveTimeoutMs?: number;
  workerId?: string;
}
const safeError = (error: unknown) =>
  error instanceof Error
    ? error.message
        .replace(/https?:\/\/\S+/g, "[storage endpoint]")
        .slice(0, 1000)
    : "Processing failed";
const base = (job: IntakeJob) => ({
  job_id: job.id,
  lease_token: job.lease_token,
  processing_version: job.processing_version,
});

async function command(
  driver: WorkerDriver,
  job: IntakeJob,
  action: string,
  data: Record<string, unknown> = {},
) {
  const result = await driver.rpc({ ...base(job), action, ...data });
  if (!result || typeof result !== "object")
    throw new ProcessingError("Incomplete worker acknowledgment");
  const response = result as {
    ok?: boolean;
    error?: string;
    permanent?: boolean;
  };
  if (response.ok !== true)
    throw new ProcessingError(
      response.error ?? "Worker command failed",
      response.permanent ?? false,
      true,
    );
  return result;
}

/** Isolates parser CPU/heap; checkpoint I/O does not consume its CPU deadline. */
export function parseInChild(
  job: IntakeJob,
  bytes: Uint8Array,
  onRows: (rows: PreparedSpreadsheetRow[]) => Promise<void>,
  options: WorkerOptions = {},
) {
  return new Promise<unknown>((resolve, reject) => {
    const child = fork(
      fileURLToPath(new URL("./parser-child.mts", import.meta.url)),
      [],
      {
        execArgv: ["--import", "tsx", "--max-old-space-size=384"],
        serialization: "advanced",
        stdio: ["ignore", "ignore", "pipe", "ipc"],
        env: {
          PATH: process.env.PATH,
          SystemRoot: process.env.SystemRoot,
          TEMP: process.env.TEMP,
          TMP: process.env.TMP,
          NODE_ENV: "production",
        },
      },
    );
    let complete = false,
      remaining = options.parserActiveTimeoutMs ?? 45000,
      began = performance.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener("abort", abort);
      if (!child.killed) child.kill();
    };
    const fail = (error: unknown) => {
      if (complete) return;
      complete = true;
      cleanup();
      reject(error);
    };
    const abort = () =>
      fail(
        new ProcessingError(
          "Worker stopping; prepared checkpoints are retained",
        ),
      );
    const arm = () => {
      began = performance.now();
      timer = setTimeout(
        () =>
          fail(
            new ProcessingError(
              "Spreadsheet parser exceeded its active time limit",
            ),
          ),
        Math.max(1, remaining),
      );
    };
    const pause = () => {
      if (timer) clearTimeout(timer);
      remaining -= performance.now() - began;
    };
    child.once("error", (error) => fail(error));
    child.once("exit", (code, signal) => {
      if (!complete)
        fail(
          new ProcessingError(
            `Parser exited before completion (${signal ?? code}); split an oversized workbook or retry after recovery`,
            signal === "SIGABRT",
          ),
        );
    });
    child.on("message", (message: unknown) => {
      if (!message || typeof message !== "object" || complete) return;
      const data = message as Record<string, unknown>;
      if (data.type === "rows") {
        pause();
        if (
          !Array.isArray(data.rows) ||
          data.rows.length > 100 ||
          typeof data.sequence !== "number"
        ) {
          fail(new ProcessingError("Invalid parser checkpoint", true));
          return;
        }
        void onRows(data.rows as PreparedSpreadsheetRow[])
          .then(() => {
            if (complete) return;
            arm();
            child.send({ type: "ack", sequence: data.sequence });
          })
          .catch(fail);
      } else if (data.type === "done") {
        pause();
        complete = true;
        cleanup();
        resolve(data.result);
      } else if (data.type === "error")
        fail(
          new ProcessingError(
            String(data.error ?? "Invalid spreadsheet"),
            true,
          ),
        );
    });
    // Drain bounded diagnostics without forwarding source text or credentials.
    child.stderr?.on("data", () => {});
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    arm();
    child.send({
      type: "start",
      stage: job.stage,
      name: job.source?.name,
      plan: job.source?.plan,
      bytes,
    });
  });
}

export async function processIntakeJob(
  driver: WorkerDriver,
  job: IntakeJob,
  options: WorkerOptions = {},
) {
  const controller = new AbortController();
  if (options.signal?.aborted) controller.abort();
  const stop = () => controller.abort();
  options.signal?.addEventListener("abort", stop, { once: true });
  let heartbeatPending: Promise<void> | null = null,
    leaseError: unknown;
  const heartbeat = () => {
    if (heartbeatPending) return;
    heartbeatPending = command(driver, job, "heartbeat")
      .then(() => {})
      .catch((error) => {
        leaseError = error;
        controller.abort();
      })
      .finally(() => {
        heartbeatPending = null;
      });
  };
  const timer = setInterval(heartbeat, options.heartbeatMs ?? 10000);
  try {
    if (controller.signal.aborted)
      throw new ProcessingError("Worker stopping; saved work is retained");
    await command(driver, job, "heartbeat");
    if (job.stage === "prepare" || job.stage === "post")
      return await command(driver, job, job.stage);
    const source = job.source;
    if (
      !source ||
      !source.object_key.startsWith(
        `${job.organization_id}/${job.batch_id}/${source.id}.`,
      )
    )
      throw new ProcessingError("Invalid source/job scope", true);
    let bytes: Uint8Array;
    try {
      bytes = await driver.download(source, controller.signal);
    } catch (error) {
      if (
        error instanceof ProcessingError &&
        error.missingUpload &&
        job.stage === "inspect"
      )
        return await command(driver, job, "waiting_upload");
      throw error;
    }
    if (
      bytes.byteLength !== source.bytes ||
      createHash("sha256").update(bytes).digest("hex") !== source.sha256
    )
      throw new ProcessingError(
        "Uploaded bytes or SHA-256 do not match the authorized file",
        true,
      );
    if (job.stage === "inspect")
      await command(driver, job, "file_received", {
        bytes: source.bytes,
        sha256: source.sha256,
      });
    const result = await parseInChild(
      job,
      bytes,
      async (rows) => {
        let pending: PreparedSpreadsheetRow[] = [],
          size = 0;
        const flush = async () => {
          if (pending.length) {
            await command(driver, job, "checkpoint", { rows: pending });
            pending = [];
            size = 0;
          }
        };
        for (const row of rows) {
          const length = Buffer.byteLength(JSON.stringify(row));
          if (size + length > 256 * 1024) await flush();
          pending.push(row);
          size += length;
        }
        await flush();
      },
      { ...options, signal: controller.signal },
    );
    if (leaseError) throw leaseError;
    if (job.stage === "inspect")
      return await command(driver, job, "inspect", {
        inspection: result,
        bytes: source.bytes,
        sha256: source.sha256,
      });
    return await command(driver, job, "parsed", { stats: result });
  } catch (error) {
    if (error instanceof ProcessingError && error.alreadyRecorded) throw error;
    try {
      return await command(driver, job, "fail", {
        error: safeError(leaseError ?? error),
        permanent: error instanceof ProcessingError && error.permanent,
      });
    } catch {
      throw error;
    }
  } finally {
    clearInterval(timer);
    options.signal?.removeEventListener("abort", stop);
    if (heartbeatPending) await heartbeatPending;
  }
}

export function createSupabaseWorkerDriver(
  db: SupabaseClient<Database>,
): WorkerDriver {
  return {
    async rpc(input) {
      const { data, error, status } = await db.rpc("stock_intake_job_command", {
        command: input,
      });
      if (error)
        throw new ProcessingError(
          error.message,
          !(
            status >= 500 ||
            status === 408 ||
            status === 429 ||
            !error.code ||
            error.code.startsWith("08") ||
            [
              "40001",
              "40P01",
              "57014",
              "53300",
              "53400",
              "57P01",
              "57P02",
              "57P03",
              "PGRST003",
            ].includes(error.code)
          ),
          false,
        );
      return data;
    },
    async download(source, signal) {
      const { data, error } = await db.storage
        .from(INTAKE_BUCKET)
        .createSignedUrl(source.object_key, 60);
      if (error || !data?.signedUrl) {
        const status = error ? Number(error.status) : 0;
        throw new ProcessingError(
          "Private source is not available" + (status ? ` (${status})` : ""),
          status >= 400 && status < 500 && status !== 404 && status !== 429,
          false,
          status === 404,
        );
      }
      const response = await fetch(data.signedUrl, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(180000)]),
      });
      if (response.status === 404)
        throw new ProcessingError(
          "Private source is not available yet",
          false,
          false,
          true,
        );
      if (!response.ok)
        throw new ProcessingError(
          `Private storage download failed (${response.status})`,
          response.status >= 400 &&
            response.status < 500 &&
            response.status !== 429,
        );
      if (!response.body)
        throw new ProcessingError("Private source download is empty");
      const reader = response.body.getReader(),
        chunks: Uint8Array[] = [];
      let total = 0;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          total += value.byteLength;
          if (total > 20 * 1024 * 1024)
            throw new ProcessingError(
              "Source exceeds the 20 MiB file boundary",
              true,
            );
          chunks.push(value);
        }
      } finally {
        await reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const part of chunks) {
        bytes.set(part, offset);
        offset += part.byteLength;
      }
      return bytes;
    },
  };
}

export async function runStockIntakeWorker() {
  if (process.env.STOCK_INTAKE_WORKER_ENABLED !== "true") {
    console.log("Stock intake worker is disabled.");
    return;
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Worker storage/database credentials are not configured");
  const db = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const bucket = await db.storage.getBucket(INTAKE_BUCKET);
  if (
    bucket.error ||
    !bucket.data ||
    bucket.data.public ||
    !bucket.data.file_size_limit ||
    Number(bucket.data.file_size_limit) > 20 * 1024 * 1024
  )
    throw new Error(
      "Private intake storage is not configured with its file-size boundary",
    );
  const driver = createSupabaseWorkerDriver(db),
    controller = new AbortController(),
    workerId = `stock-${randomUUID()}`;
  const stop = () => controller.abort();
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  try {
    while (!controller.signal.aborted) {
      try {
        const raw = await driver.rpc({ action: "claim", worker_id: workerId });
        if (raw) {
          if (controller.signal.aborted) break;
          const job = jobSchema.parse(raw);
          await processIntakeJob(driver, job, { signal: controller.signal });
          continue;
        }
      } catch (error) {
        console.error("Stock intake worker:", safeError(error));
      }
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(done, 1000);
        function done() {
          clearTimeout(timeout);
          controller.signal.removeEventListener("abort", done);
          resolve();
        }
        controller.signal.addEventListener("abort", done, { once: true });
        if (controller.signal.aborted) done();
      });
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
  }
}
