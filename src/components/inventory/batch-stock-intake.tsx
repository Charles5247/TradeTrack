"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthStore } from "@/store";
import { accountIdentity } from "@/lib/auth/account-state";
import { intakeRequest } from "@/lib/stock-intake/client";
import type { IntakeCatalog } from "@/lib/stock-intake/contracts";
import {
  batchCommandSchema,
  type BatchCommand,
  type BatchGroup,
  type BatchHeader,
  type BatchRow,
  type BatchSource,
  type BatchView,
} from "@/lib/stock-intake-batches/contracts";
import { AccessGuard } from "@/components/shared/access-guard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  reviewIssueLabels,
  stockAddition,
} from "@/lib/stock-intake-batches/review-display";
import {
  SheetDialog,
  RowDialog,
  BulkDialog,
  GroupDialog,
  Field,
  Check,
  selectClass,
} from "./batch-stock-intake-editors";

const endpoint = "/api/stock-intake-batches";
const message = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Request failed. Refresh authoritative batch status before retrying.";
type Ready = { group_id: string; hash: string; cost: string; currency: string };
// Distributive omit preserves each action's fields in the command union.
type EditCommand = BatchCommand extends infer T
  ? T extends BatchCommand
    ? Omit<T, "batch_id" | "expected_revision">
    : never
  : never;
function Pages({
  offset,
  next,
  step,
  onChange,
  label,
}: {
  offset: number;
  next: number | null;
  step: number;
  onChange: (offset: number) => void;
  label: string;
}) {
  return (
    <nav aria-label={`${label} pages`} className="flex items-center gap-3">
      <Button
        variant="outline"
        disabled={!offset}
        onClick={() => onChange(Math.max(0, offset - step))}
      >
        Previous {label}
      </Button>
      <span className="text-sm">Page {Math.floor(offset / step) + 1}</span>
      <Button
        variant="outline"
        disabled={next === null}
        onClick={() => next !== null && onChange(next)}
      >
        Next {label}
      </Button>
    </nav>
  );
}
// Currency cents can exceed Number's safe integer across 20,000 receipts.
export function batchMoney(receipts: Ready[], currency: string) {
  const cents = receipts.reduce((sum, item) => {
    const [whole, fraction = ""] = item.cost.split(".");
    return (
      sum +
      BigInt(whole || "0") * BigInt(100) +
      BigInt(fraction.padEnd(2, "0").slice(0, 2))
    );
  }, BigInt(0));
  return `${currency} ${new Intl.NumberFormat("en-NG").format(cents / BigInt(100))}.${String(cents % BigInt(100)).padStart(2, "0")}`;
}
export function BatchStockIntake() {
  const user = useAuthStore((state) => state.user);
  return (
    <AccessGuard allow={["business_owner", "admin"]}>
      {user?.organization_id && user.status === "active" && (
        <Workspace
          key={accountIdentity(user)}
          account={accountIdentity(user)}
        />
      )}
    </AccessGuard>
  );
}

function Workspace({ account }: { account: string }) {
  const cache = useQueryClient();
  const [id, setId] = useState(() => {
    try {
      return localStorage.getItem(`stock-batch:${account}`) || "";
    } catch {
      return "";
    }
  });
  const [historyOffset, setHistoryOffset] = useState(0),
    [offset, setOffset] = useState(0),
    [groupOffset, setGroupOffset] = useState(0),
    [sourceId, setSourceId] = useState(""),
    [issues, setIssues] = useState("all");
  const [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [note, setNote] = useState("");
  const [selected, setSelected] = useState<string[]>([]),
    [ready, setReady] = useState<Ready[]>([]),
    [ack, setAck] = useState("");
  const [editorRevision, setEditorRevision] = useState(0);
  const [selectionRevision, setSelectionRevision] = useState(0);
  const [approvalRevision, setApprovalRevision] = useState(0);
  const [rowEditor, setRowEditor] = useState<BatchRow | null>(null),
    [groupEditor, setGroupEditor] = useState<BatchGroup | null>(null),
    [configure, setConfigure] = useState<BatchSource | null>(null),
    [bulk, setBulk] = useState(false);
  const [mode, setMode] = useState<"additional_delivery" | "opening_stock">(
      "additional_delivery",
    ),
    [warehouse, setWarehouse] = useState("");
  const catalog = useQuery({
    queryKey: ["intake-catalog", account],
    queryFn: () => intakeRequest<IntakeCatalog>("/api/stock-intakes/catalog"),
  });
  const history = useQuery({
    queryKey: ["stock-batches", account, historyOffset],
    queryFn: () =>
      intakeRequest<{ batches: BatchHeader[] }>(
        `${endpoint}?offset=${historyOffset}`,
      ),
  });
  const query = new URLSearchParams({
    offset: String(offset),
    group_offset: String(groupOffset),
    issues,
    ...(sourceId ? { source: sourceId } : {}),
  });
  const current = useQuery({
    queryKey: [
      "stock-batch",
      account,
      id,
      offset,
      groupOffset,
      sourceId,
      issues,
    ],
    queryFn: () => intakeRequest<BatchView>(`${endpoint}/${id}?${query}`),
    enabled: Boolean(id),
    refetchInterval: (q) =>
      q.state.data?.summary.jobs_active ||
      q.state.data?.sources.some((s) =>
        ["uploading", "inspecting", "parsing", "queued"].includes(s.status),
      )
        ? 3000
        : 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const view = current.data;
  // This server selection covers every receipt, including those beyond the current page.
  const preparable = useQuery({
    queryKey: ["stock-batch", account, id, "preparable", view?.batch.revision],
    queryFn: () =>
      intakeRequest<{ revision: number; ids: string[] }>(
        `${endpoint}/${id}?selection=preparable`,
      ),
    enabled: Boolean(
      view && !view.summary.jobs_active && view.batch.status !== "cancelled",
    ),
  });
  const canPrepare = Boolean(
    preparable.data?.revision === view?.batch.revision &&
      preparable.data?.ids.length,
  );
  const locked = Boolean(
    busy ||
      view?.batch.status === "posting" ||
      view?.batch.status === "cancelled",
  );
  const posted = useRef(0);
  useEffect(() => {
    if (view && view.summary.posted > posted.current) {
      for (const key of ["inventory", "products", "stock-intakes"])
        void cache.invalidateQueries({ queryKey: [key] });
    }
    posted.current = view?.summary.posted ?? 0;
  }, [view, cache]);
  const open = (batchId: string) => {
    setId(batchId);
    setOffset(0);
    setGroupOffset(0);
    setSourceId("");
    setSelected([]);
    setReady([]);
    setAck("");
    setError("");
    try {
      localStorage.setItem(`stock-batch:${account}`, batchId);
    } catch {
      setNote(
        "Device storage is unavailable. Your server batch remains saved.",
      );
    }
  };
  async function run(label: string, operation: () => Promise<void>) {
    if (busy) return false;
    setBusy(label);
    setError("");
    try {
      await operation();
      return true;
    } catch (e) {
      setError(message(e));
      return false;
    } finally {
      setBusy("");
      await cache.invalidateQueries({ queryKey: ["stock-batch", account, id] });
      await cache.invalidateQueries({ queryKey: ["stock-batches", account] });
    }
  }
  async function command(input: EditCommand, revision = view?.batch.revision) {
    if (!id || !revision) throw new Error("Refresh the batch before editing.");
    const validated = batchCommandSchema.parse({
      ...input,
      batch_id: id,
      expected_revision: revision,
    });
    return intakeRequest<{ batch: BatchHeader }>(
      `${endpoint}/${id}`,
      validated,
      "PATCH",
    );
  }
  const save = (input: EditCommand, revision = view?.batch.revision) =>
    run("Saving review", async () => {
      await command(input, revision);
      setSelected([]);
      setReady([]);
    });
  const selectionUrl = (kind: string) =>
    `${endpoint}/${id}?${new URLSearchParams({ selection: kind, issues, ...(sourceId ? { source: sourceId } : {}) })}`;
  const ackKey = JSON.stringify([view?.batch.revision, view?.summary, ready]);
  const goTo = (section: string) => {
    const heading = document.getElementById(section);
    heading?.scrollIntoView({ block: "start" });
    heading?.focus({ preventScroll: true });
  };
  const prepareReceipts = () =>
    run("Checking receipt totals", async () => {
      const result = await intakeRequest<{ revision: number; ids: string[] }>(
        `${endpoint}/${id}?selection=preparable`,
      );
      if (!result.ids.length) {
        goTo("intake-review");
        throw new Error(
          "Some products still need checking. Open ‘Check product’ beside each item marked for review.",
        );
      }
      await command(
        { action: "prepare", group_ids: result.ids },
        result.revision,
      );
      setReady([]);
      setNote(
        "Checking receipt totals. Stock will change only after you review and approve.",
      );
      goTo("intake-summary");
    });
  async function upload(files: File[], resume?: BatchSource) {
    await run("Uploading originals", async () => {
      let revision = view!.batch.revision;
      for (const file of files) {
        if (
          !/\.(csv|xlsx)$/i.test(file.name) ||
          !file.size ||
          file.size > 20 * 1024 * 1024
        )
          throw new Error(
            `${file.name}: choose a nonempty CSV/XLSX up to 20 MiB.`,
          );
        const digest = await crypto.subtle.digest(
          "SHA-256",
          await file.arrayBuffer(),
        );
        const sha256 = Array.from(new Uint8Array(digest), (byte) =>
          byte.toString(16).padStart(2, "0"),
        ).join("");
        if (resume && (sha256 !== resume.sha256 || file.size !== resume.bytes))
          throw new Error("Choose the exact original file to resume.");
        const registration = await intakeRequest<{
          batch: BatchHeader;
          source: BatchSource;
          upload: { signedUrl: string } | null;
        }>(`${endpoint}/${id}/register`, {
          action: "register",
          batch_id: id,
          expected_revision: revision,
          source: {
            id: resume?.id ?? crypto.randomUUID(),
            name: resume?.name ?? file.name,
            bytes: file.size,
            sha256,
          },
        });
        revision = registration.batch.revision;
        if (!registration.upload)
          throw new Error("Refresh file status before uploading again.");
        const response = await fetch(registration.upload.signedUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!response.ok)
          throw new Error(
            `${file.name}: upload failed. Its registration is retained; resume this file below.`,
          );
        await intakeRequest(`${endpoint}/${id}/uploaded`, {
          action: "uploaded",
          batch_id: id,
          source_id: registration.source.id,
        });
        setNote(
          `${file.name} uploaded. Processing continues if you close this page.`,
        );
      }
    });
  }
  return (
    <main className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            Inventory / Stock intake
          </p>
          <h1 className="text-2xl font-semibold">
            Receive stock from a spreadsheet
          </h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Upload your file, check the products, then approve the delivery.
            Stock changes only after your approval.
          </p>
        </div>
        <Link href="/inventory/intake" className="text-sm underline">
          Manual receipt
        </Link>
      </header>
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-destructive p-3 text-sm"
        >
          {error}
        </div>
      )}
      {note && (
        <p role="status" className="text-sm">
          {note}
        </p>
      )}
      {busy && <p role="status">{busy}…</p>}
      <details open={id ? undefined : true} className="rounded-lg border p-4">
        <summary className="cursor-pointer font-medium">
          Start a new delivery or open a saved batch
        </summary>
        <Card className="mt-4">
          <CardContent className="space-y-4 pt-6">
            <h2 className="font-semibold">Start a batch</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Stock operation">
                <select
                  className={selectClass}
                  value={mode}
                  onChange={(e) => setMode(e.target.value as typeof mode)}
                >
                  <option value="additional_delivery">
                    Additional deliveries
                  </option>
                  <option value="opening_stock">Opening balances only</option>
                </select>
              </Field>
              <Field label="Default location">
                <select
                  className={selectClass}
                  value={warehouse}
                  onChange={(e) => setWarehouse(e.target.value)}
                >
                  <option value="">Select location</option>
                  {catalog.data?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Button
                className="self-end"
                disabled={Boolean(busy) || !warehouse}
                onClick={() =>
                  void run("Creating batch", async () => {
                    const created = await intakeRequest<{ batch: BatchHeader }>(
                      endpoint,
                      {
                        action: "create",
                        id: crypto.randomUUID(),
                        mode,
                        warehouse_id: warehouse,
                      },
                    );
                    open(created.batch.id);
                  })
                }
              >
                Create batch
              </Button>
            </div>
            {catalog.isError && (
              <p role="alert">
                Locations unavailable.{" "}
                <button
                  className="underline"
                  onClick={() => void catalog.refetch()}
                >
                  Retry
                </button>
              </p>
            )}
            <Field label="Saved batches">
              <select
                className={selectClass}
                value={history.data?.batches.some((b) => b.id === id) ? id : ""}
                onChange={(e) => e.target.value && open(e.target.value)}
              >
                <option value="">Select saved batch</option>
                {history.data?.batches.slice(0, 20).map((b) => (
                  <option key={b.id} value={b.id}>
                    {new Date(b.created_at).toLocaleString()} · {b.status} ·{" "}
                    {b.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-3">
              <Button
                variant="outline"
                disabled={!historyOffset || Boolean(busy)}
                onClick={() =>
                  setHistoryOffset(Math.max(0, historyOffset - 20))
                }
              >
                Previous batches
              </Button>
              <Button
                variant="outline"
                disabled={
                  (history.data?.batches.length ?? 0) <= 20 || Boolean(busy)
                }
                onClick={() => setHistoryOffset(historyOffset + 20)}
              >
                Next batches
              </Button>
            </div>
            {history.isError && (
              <p role="alert">
                Saved batches unavailable.{" "}
                <button
                  className="underline"
                  onClick={() => void history.refetch()}
                >
                  Retry
                </button>
              </p>
            )}
          </CardContent>
        </Card>
      </details>
      {id && current.isPending && <p role="status">Loading saved batch…</p>}
      {current.isError && (
        <p role="alert">
          {message(current.error)}{" "}
          <Button variant="outline" onClick={() => void current.refetch()}>
            Refresh status
          </Button>
        </p>
      )}
      {view && (
        <>
          <nav
            aria-label="Receiving steps"
            className="grid gap-2 text-sm sm:grid-cols-3"
          >
            <a
              className="rounded-lg border p-3 hover:bg-muted"
              href="#intake-upload"
            >
              1. Upload your file
            </a>
            <a
              className="rounded-lg border p-3 hover:bg-muted"
              href="#intake-review"
            >
              2. Check the products
            </a>
            <a
              className="rounded-lg border p-3 hover:bg-muted"
              href="#intake-summary"
            >
              3. Review and save
            </a>
          </nav>
          <Card className="border-primary/40">
            <CardContent
              className="space-y-3 pt-6"
              role="status"
              aria-live="polite"
            >
              <h2 className="font-semibold">What to do next</h2>
              {view.batch.status === "cancelled" ? (
                <p>
                  This batch was cancelled. Saved receipts remain in stock; the
                  other items have not been added.
                </p>
              ) : view.summary.jobs_active > 0 ? (
                <p>
                  {view.batch.status === "posting"
                    ? "Saving your approved receipts"
                    : "Reading files and checking receipts"}
                  … You can leave this page and return later.
                </p>
              ) : view.batch.status === "completed" ? (
                <p>
                  Your delivery is saved. {view.summary.posted} receipts have
                  been added to stock. You can inspect the products and original
                  files below.
                </p>
              ) : !view.sources.some((s) => !s.excluded) ? (
                <>
                  <p>
                    Choose the CSV or Excel file containing the stock you
                    received.
                  </p>
                  <Button onClick={() => goTo("intake-upload")}>
                    Upload a file
                  </Button>
                </>
              ) : view.sources.some(
                  (s) =>
                    !s.excluded &&
                    (s.status === "select_sheets" ||
                      s.status === "uploading" ||
                      s.status === "failed"),
                ) ? (
                <>
                  <p>
                    Finish setting up your files below. Choose the sheets and
                    check which columns contain product names, quantities and
                    prices.
                  </p>
                  <Button onClick={() => goTo("intake-upload")}>
                    Check uploaded files
                  </Button>
                </>
              ) : view.sources.some(
                  (s) => s.plan && !s.excluded && s.status !== "prepared",
                ) ? (
                <>
                  <p>
                    Your file setup is saved. Read the selected sheets to list
                    the products for checking.
                  </p>
                  <Button
                    disabled={locked}
                    onClick={() => void save({ action: "process" })}
                  >
                    Read selected sheets
                  </Button>
                </>
              ) : view.summary.ready > 0 ? (
                <>
                  <p>
                    {view.summary.ready} receipts are ready. Review their
                    totals, select the ones to save, then approve once.
                    {view.summary.needs_review > 0
                      ? ` Another ${view.summary.needs_review} receipts still need checking.`
                      : ""}
                  </p>
                  <Button onClick={() => goTo("intake-summary")}>
                    Review and save
                  </Button>
                </>
              ) : canPrepare ? (
                <>
                  <p>
                    Your product checks are complete for{" "}
                    {preparable.data?.ids.length} receipts. Continue to check
                    their totals before saving.
                  </p>
                  <Button
                    disabled={locked}
                    onClick={() => void prepareReceipts()}
                  >
                    Continue to receipt totals
                  </Button>
                </>
              ) : (
                <>
                  <p>
                    Check the items marked below. Open “Check product” to
                    confirm the product, quantity, pack size and cost. Nothing
                    in these unchecked receipts has been added to stock.
                  </p>
                  <Button onClick={() => goTo("intake-review")}>
                    Check products
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2
                id="intake-upload"
                tabIndex={-1}
                className="scroll-mt-32 text-lg font-semibold"
              >
                1. Upload your file
              </h2>
              <div className="flex flex-wrap justify-between gap-2">
                <h2 className="font-semibold">
                  Batch {id.slice(0, 8)} ·{" "}
                  {view.batch.status.replaceAll("_", " ")}
                </h2>
                <Button
                  variant="outline"
                  disabled={Boolean(busy)}
                  onClick={() => void current.refetch()}
                >
                  Refresh status
                </Button>
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
                {[
                  ["Files", view.summary.files],
                  ["Products read", view.summary.prepared_rows],
                  ["Ready receipts", view.summary.ready],
                  ["Saved receipts", view.summary.posted],
                ].map(([label, value]) => (
                  <div key={label}>
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-xl font-semibold">{value}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-sm text-muted-foreground">
                Last successful refresh:{" "}
                {new Date(current.dataUpdatedAt).toLocaleTimeString()}. Upload
                and posting require connectivity; accepted jobs continue on the
                server.
              </p>
              <details className="text-sm text-muted-foreground">
                <summary className="cursor-pointer">
                  File limits and supported formats
                </summary>
                <p>
                  CSV and XLSX: up to 100 files, 20 MiB each, 250 MiB total and
                  20,000 product rows. All selected sheets are read. PDF, photos
                  and voice are not available in this version.
                </p>
              </details>
              <Field label="Add a CSV or Excel file">
                <Input
                  type="file"
                  accept=".csv,.xlsx"
                  multiple
                  disabled={locked}
                  onChange={(e) => {
                    const files = Array.from(e.target.files ?? []);
                    e.target.value = "";
                    if (files.length) void upload(files);
                  }}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={
                    locked ||
                    !view.sources.some(
                      (s) => s.plan && !s.excluded && s.status !== "prepared",
                    )
                  }
                  onClick={() => void save({ action: "process" })}
                >
                  Read selected sheets
                </Button>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void save({ action: "retry" })}
                >
                  Retry eligible failures
                </Button>
                <Button
                  variant="outline"
                  disabled={locked}
                  onClick={() => void save({ action: "cancel" })}
                >
                  Cancel unposted work
                </Button>
              </div>
            </CardContent>
          </Card>
          <section aria-label="Original sources" className="space-y-3">
            <h2 className="text-lg font-semibold">Original files</h2>
            {!view.sources.length && (
              <p className="text-sm text-muted-foreground">
                Add your supplier spreadsheets to begin.
              </p>
            )}
            {view.sources.map((source) => (
              <Card key={source.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <strong className="break-all">{source.name}</strong>
                    <span className="text-sm">
                      {source.status.replaceAll("_", " ")}
                      {source.excluded ? " · excluded" : ""} ·{" "}
                      {source.sheet_count ?? 0} sheets
                      {source.stats ? ` · ${source.stats.prepared} rows` : ""}
                    </span>
                  </div>
                  {source.error && (
                    <p className="text-sm text-destructive">{source.error}</p>
                  )}
                  {source.duplicate && (
                    <p className="text-sm">
                      Duplicate source detected. A repeated legitimate delivery
                      needs a reviewed reason.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={locked || !source.sheet_count}
                      onClick={() =>
                        void run("Loading worksheets", async () => {
                          const result = await intakeRequest<BatchView>(
                            `${endpoint}/${id}?source=${source.id}`,
                          );
                          const found = result.sources.find(
                            (s) => s.id === source.id,
                          );
                          if (found) {
                            setEditorRevision(result.batch.revision);
                            setConfigure(found);
                          }
                        })
                      }
                    >
                      Select worksheets
                    </Button>
                    <Button
                      variant="outline"
                      disabled={Boolean(busy)}
                      onClick={() =>
                        void run("Opening original", async () => {
                          const result = await intakeRequest<{ url: string }>(
                            `${endpoint}/${id}?download=${source.id}`,
                          );
                          const link = document.createElement("a");
                          link.href = result.url;
                          link.rel = "noopener";
                          link.click();
                        })
                      }
                    >
                      Download original
                    </Button>
                    <Button
                      variant="outline"
                      disabled={locked}
                      onClick={() =>
                        void save({
                          action: "source_exclude",
                          source_id: source.id,
                          excluded: !source.excluded,
                        })
                      }
                    >
                      {source.excluded ? "Include source" : "Exclude source"}
                    </Button>
                    {source.status === "uploading" && (
                      <Field label="Resume this upload (same original)">
                        <Input
                          type="file"
                          accept=".csv,.xlsx"
                          disabled={locked}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = "";
                            if (file) void upload([file], source);
                          }}
                        />
                      </Field>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </section>
          <section aria-label="Prepared row review" className="space-y-3">
            <h2 className="text-lg font-semibold">
              <span id="intake-review" tabIndex={-1} className="scroll-mt-32">
                2. Check the products · {view.row_count.toLocaleString()} rows
              </span>
            </h2>
            <p className="text-sm text-muted-foreground">
              Check how each received pack becomes stock. For example, 10
              cartons with 12 pieces each adds 120 pieces. Use “Check product”
              to confirm or correct each item.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Source filter">
                <select
                  className={selectClass}
                  value={sourceId}
                  onChange={(e) => {
                    setSourceId(e.target.value);
                    setOffset(0);
                    setSelected([]);
                  }}
                >
                  <option value="">All files</option>
                  {view.sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Show items needing">
                <select
                  className={selectClass}
                  value={issues}
                  onChange={(e) => {
                    setIssues(e.target.value);
                    setOffset(0);
                    setSelected([]);
                  }}
                >
                  {[
                    "all",
                    "products",
                    "quantities",
                    "costs",
                    "conversions",
                  ].map((v) => (
                    <option key={v} value={v}>
                      {v === "all" ? "All products" : reviewIssueLabels[v]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                disabled={locked || !view.row_count}
                onClick={() =>
                  void run("Selecting matching rows", async () => {
                    const selection = await intakeRequest<{
                      revision: number;
                      ids: string[];
                    }>(selectionUrl("rows"));
                    if (selection.revision !== view.batch.revision)
                      throw new Error(
                        "Batch changed. Refresh before selecting.",
                      );
                    setSelected(selection.ids);
                    setSelectionRevision(selection.revision);
                  })
                }
              >
                Select all matching products
              </Button>
              <Button
                variant="outline"
                disabled={!selected.length || locked}
                onClick={() => setBulk(true)}
              >
                Update {selected.length} selected products
              </Button>
              <Button variant="ghost" onClick={() => setSelected([])}>
                Clear selection
              </Button>
            </div>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">
                  Complete prepared rows, 100 per page. Original evidence is
                  available in each row inspector.
                </caption>
                <thead className="bg-muted">
                  <tr>
                    {[
                      "Select",
                      "Source / row",
                      "Product",
                      "Quantity",
                      "Stock to add",
                      "Cost per received pack",
                      "Needs checking",
                      "Review",
                    ].map((label) => (
                      <th key={label} className="p-3">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.rows.map((row) => (
                    <tr key={row.id} className="border-t">
                      <td className="p-3">
                        <input
                          aria-label={`Select ${row.source_name} ${row.sheet} row ${row.row_number}`}
                          type="checkbox"
                          checked={selected.includes(row.id)}
                          disabled={locked || row.group_status === "posted"}
                          onChange={(e) => {
                            setSelectionRevision(view.batch.revision);
                            setSelected((ids) =>
                              e.target.checked
                                ? [
                                    ...(selectionRevision ===
                                    view.batch.revision
                                      ? ids
                                      : []),
                                    row.id,
                                  ]
                                : ids.filter((id) => id !== row.id),
                            );
                          }}
                        />
                      </td>
                      <td className="max-w-44 break-words p-3">
                        {row.source_name}
                        <br />
                        {row.sheet} · {row.row_number}
                        {row.excluded || row.source_excluded
                          ? " · excluded"
                          : ""}
                      </td>
                      <td className="p-3">
                        {row.review.product_snapshot?.name ||
                          row.review.new_product?.name ||
                          String(
                            row.raw.values.description ||
                              row.raw.values.sku ||
                              "Unresolved product",
                          )}
                      </td>
                      <td className="p-3">
                        {row.review.quantity ?? "Unknown"}{" "}
                        {row.review.purchase_unit}
                      </td>
                      <td className="min-w-44 p-3">
                        {stockAddition(row.review)}
                      </td>
                      <td className="p-3">
                        {row.review.receipt_unit_cost === null
                          ? "Missing"
                          : row.review.receipt_unit_cost.toFixed(2)}
                      </td>
                      <td className="p-3">
                        {row.issues
                          .map((issue) => reviewIssueLabels[issue] ?? issue)
                          .join("; ") || "Checked"}
                        {row.warnings.length > 0 && (
                          <p>{row.warnings.join("; ")}</p>
                        )}
                      </td>
                      <td className="p-3">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditorRevision(view.batch.revision);
                            setRowEditor(row);
                          }}
                        >
                          {row.group_status === "posted"
                            ? "View product"
                            : "Check product"}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!view.rows.length && (
              <p className="text-sm text-muted-foreground">
                No rows in this view. Configure and process a source, or choose
                another queue.
              </p>
            )}
            <Pages
              offset={offset}
              next={view.next_row_offset}
              step={100}
              onChange={setOffset}
              label="rows"
            />
          </section>
          <section aria-label="Receipt groups" className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">
                Receipt grouping · {view.group_count}
              </h2>
              <Button
                variant="outline"
                disabled={locked}
                onClick={() => {
                  setEditorRevision(view.batch.revision);
                  setGroupEditor({
                    id: crypto.randomUUID(),
                    label: "New receipt",
                    warehouse_id: view.batch.warehouse_id,
                    supplier: "",
                    invoice_reference: "",
                    duplicate_reason: "",
                    excluded: false,
                    status: "review",
                    revision: 1,
                    receipt_id: null,
                    prepared_hash: null,
                    error: null,
                    row_count: 0,
                    receipt_cost_total: null,
                    prepared_currency: null,
                    result: null,
                  });
                }}
              >
                New receipt group
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              One invoice can span sheets or files. Correct groups and locations
              before approval. Move explicitly selected rows using bulk
              correction.
            </p>
            {view.groups.map((group) => (
              <Card key={group.id}>
                <CardContent className="space-y-2 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <strong>{group.label}</strong>
                      <p className="text-sm">
                        {group.row_count} rows ·{" "}
                        {group.status.replaceAll("_", " ")}
                        {group.excluded ? " · excluded" : ""} ·{" "}
                        {catalog.data?.warehouses.find(
                          (w) => w.id === group.warehouse_id,
                        )?.name ?? group.warehouse_id}
                      </p>
                      <p className="text-sm">
                        {group.supplier} {group.invoice_reference}{" "}
                        {group.receipt_cost_total !== null
                          ? `· ${group.prepared_currency} ${group.receipt_cost_total}`
                          : ""}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={locked || group.status === "posted"}
                      onClick={() => {
                        setEditorRevision(view.batch.revision);
                        setGroupEditor(group);
                      }}
                    >
                      Edit receipt group
                    </Button>
                  </div>
                  {group.error && (
                    <p className="text-sm text-destructive">{group.error}</p>
                  )}
                  {group.status === "ready" &&
                    group.prepared_hash &&
                    !group.excluded && (
                      <Check
                        label="Select this ready receipt for approval"
                        checked={ready.some(
                          (item) =>
                            item.group_id === group.id &&
                            item.hash === group.prepared_hash,
                        )}
                        disabled={locked}
                        onChange={(checked) => {
                          setApprovalRevision(view.batch.revision);
                          setReady((items) =>
                            checked
                              ? [
                                  ...(approvalRevision === view.batch.revision
                                    ? items
                                    : []
                                  ).filter(
                                    (item) => item.group_id !== group.id,
                                  ),
                                  {
                                    group_id: group.id,
                                    hash: group.prepared_hash!,
                                    cost: group.receipt_cost_total!,
                                    currency: group.prepared_currency!,
                                  },
                                ]
                              : items.filter(
                                  (item) => item.group_id !== group.id,
                                ),
                          );
                        }}
                      />
                    )}{" "}
                  {group.result && (
                    <p className="text-sm">
                      Saved receipt {group.receipt_id}.{" "}
                      {group.result.line_count} lines posted together; original
                      row evidence is preserved.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
            <Pages
              offset={groupOffset}
              next={view.next_group_offset}
              step={50}
              onChange={setGroupOffset}
              label="receipts"
            />
            <Button
              disabled={locked || view.summary.jobs_active > 0 || !canPrepare}
              onClick={() => void prepareReceipts()}
            >
              Continue to receipt totals
            </Button>
            {preparable.isError && (
              <p role="alert" className="text-sm">
                Could not check which receipts can continue. Your product checks
                are saved.{" "}
                <button
                  className="underline"
                  onClick={() => void preparable.refetch()}
                >
                  Try again
                </button>
              </p>
            )}
            {!canPrepare &&
              !view.summary.jobs_active &&
              !view.summary.ready &&
              view.batch.status !== "completed" && (
                <p className="text-sm text-muted-foreground">
                  Confirm the products and pack sizes in step 2 before
                  continuing to totals. No stock has been saved for unchecked
                  receipts.
                </p>
              )}
          </section>
          <Card>
            <CardContent className="space-y-4 pt-6">
              <h2 className="text-lg font-semibold">
                <span
                  id="intake-summary"
                  tabIndex={-1}
                  className="scroll-mt-32"
                >
                  3. Review and save
                </span>
              </h2>
              <p className="text-sm">
                {view.summary.files} sources; {view.summary.failed_sources}{" "}
                failed sources; {view.sources.filter((s) => s.excluded).length}{" "}
                excluded sources; {view.summary.needs_review} receipts still
                need review; {view.summary.excluded} excluded receipts;{" "}
                {view.summary.posted} already saved. Only selected ready
                receipts post. Failed, excluded and unselected work is retained.
              </p>
              {view.summary.ready > 0 ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      disabled={locked || !view.summary.ready}
                      onClick={() =>
                        void run("Selecting ready receipts", async () => {
                          const result = await intakeRequest<{
                            revision: number;
                            receipts: Ready[];
                          }>(selectionUrl("ready"));
                          if (result.revision !== view.batch.revision)
                            throw new Error(
                              "Batch changed. Refresh before selecting.",
                            );
                          setReady(result.receipts);
                          setApprovalRevision(result.revision);
                        })
                      }
                    >
                      Select all ready receipts
                    </Button>
                    <Button variant="ghost" onClick={() => setReady([])}>
                      Clear receipt selection
                    </Button>
                  </div>
                  <p className="font-semibold">
                    {ready.length} selected receipts ·{" "}
                    {batchMoney(ready, view.summary.currency)}
                  </p>
                  <Check
                    label="I reviewed the selected receipts and summary, including failed, excluded and unselected work. Approve these reviewed deliveries once."
                    checked={ack === ackKey}
                    onChange={(checked) => setAck(checked ? ackKey : "")}
                    disabled={locked || !ready.length}
                  />
                  <Button
                    disabled={
                      locked ||
                      !ready.length ||
                      ack !== ackKey ||
                      view.summary.jobs_active > 0 ||
                      ready.some((r) => r.currency !== view.summary.currency)
                    }
                    onClick={() =>
                      void run("Approving batch", async () => {
                        await command(
                          {
                            action: "approve",
                            approval_id: crypto.randomUUID(),
                            receipts: ready.map(({ group_id, hash }) => ({
                              group_id,
                              hash,
                            })),
                            exclusions_acknowledged: true,
                          },
                          approvalRevision,
                        );
                        setReady([]);
                        setAck("");
                        setNote(
                          "Approval recorded. Follow each saved or needs-review receipt outcome here.",
                        );
                      })
                    }
                  >
                    Approve and add {ready.length} receipts to stock
                  </Button>
                </>
              ) : (
                <p className="rounded-lg bg-muted p-4 text-sm">
                  {view.summary.jobs_active > 0
                    ? "Please wait while the receipts are checked or saved."
                    : view.batch.status === "completed"
                      ? "Your saved receipts are listed above. There is nothing more to approve."
                      : "No receipts are ready to save yet. Complete the product checks in step 2, then continue to receipt totals."}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
      {configure && (
        <SheetDialog
          key={configure.id + configure.version}
          source={configure}
          busy={Boolean(busy)}
          close={() => setConfigure(null)}
          save={async (plan, reason) => {
            if (
              await save(
                {
                  action: "configure",
                  source_id: configure.id,
                  plan,
                  duplicate_reason: reason,
                },
                editorRevision,
              )
            )
              setConfigure(null);
          }}
        />
      )}
      {rowEditor && (
        <RowDialog
          key={rowEditor.id}
          row={rowEditor}
          account={account}
          busy={locked || rowEditor.group_status === "posted"}
          close={() => setRowEditor(null)}
          save={async (patch) => {
            if (
              await save(
                { action: "rows", ids: [rowEditor.id], patch },
                editorRevision,
              )
            )
              setRowEditor(null);
          }}
          saveDraft={async (document) => {
            if (await save({ action: "draft", document }, editorRevision))
              setRowEditor(null);
          }}
        />
      )}
      {bulk && (
        <BulkDialog
          count={selected.length}
          groups={view?.groups ?? []}
          busy={locked}
          close={() => setBulk(false)}
          save={async (fields) => {
            if (
              await save(
                { action: "rows", ids: selected, ...fields },
                selectionRevision,
              )
            )
              setBulk(false);
          }}
        />
      )}
      {groupEditor && (
        <GroupDialog
          key={groupEditor.id}
          group={groupEditor}
          locations={catalog.data?.warehouses ?? []}
          busy={locked}
          close={() => setGroupEditor(null)}
          save={async (fields) => {
            if (
              await save(
                {
                  action: "group",
                  group_id: groupEditor.id,
                  ...fields,
                },
                editorRevision,
              )
            )
              setGroupEditor(null);
          }}
        />
      )}
    </main>
  );
}
