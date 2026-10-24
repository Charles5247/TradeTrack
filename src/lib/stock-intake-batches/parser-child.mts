import {
  inspectSpreadsheet,
  parseSpreadsheet,
  type PreparedSpreadsheetRow,
} from "./spreadsheet.js";
import { batchPlanSchema } from "./contracts.js";

const acknowledgments = new Map<number, () => void>();
let started = false,
  sequence = 0;
process.on("message", async (message: unknown) => {
  if (!message || typeof message !== "object") return;
  const input = message as Record<string, unknown>;
  if (input.type === "ack" && typeof input.sequence === "number") {
    acknowledgments.get(input.sequence)?.();
    acknowledgments.delete(input.sequence);
    return;
  }
  if (input.type !== "start" || started) return;
  started = true;
  try {
    if (typeof input.name !== "string" || !(input.bytes instanceof Uint8Array))
      throw new Error("Invalid parser input");
    const result =
      input.stage === "inspect"
        ? await inspectSpreadsheet(input.name, input.bytes)
        : await parseSpreadsheet(
            input.name,
            input.bytes,
            batchPlanSchema.parse(input.plan),
            async (rows: PreparedSpreadsheetRow[]) => {
              const current = ++sequence;
              await new Promise<void>((resolve, reject) => {
                acknowledgments.set(current, resolve);
                process.send?.(
                  { type: "rows", sequence: current, rows },
                  (error) => {
                    if (error) {
                      acknowledgments.delete(current);
                      reject(error);
                    }
                  },
                );
              });
            },
          );
    process.send?.({ type: "done", result }, () => process.disconnect());
  } catch (error) {
    process.send?.(
      {
        type: "error",
        error:
          error instanceof Error
            ? error.message
            : "Spreadsheet preparation failed",
      },
      () => process.disconnect(),
    );
  }
});
