import { runStockIntakeWorker } from "../src/lib/stock-intake-batches/worker.mjs";

runStockIntakeWorker().catch(() => {
  console.error(
    "Stock intake worker stopped. Check configuration and durable job errors.",
  );
  process.exitCode = 1;
});
