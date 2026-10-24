"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useAuthStore } from "@/store";
import { accountIdentity } from "@/lib/auth/account-state";
import {
  intakeDocumentSchema,
  type IntakeDocument,
  type IntakeLine,
  type IntakeReceipt,
  type IntakeResult,
  type IntakeCatalog,
} from "@/lib/stock-intake/contracts";
import { intakeRequest } from "@/lib/stock-intake/client";
import { AccessGuard } from "@/components/shared/access-guard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DraftLine = Omit<
  IntakeLine,
  "conversion_confirmed" | "new_product" | "receipt_unit_cost"
> & {
  receipt_unit_cost: number | null;
  conversion_confirmed: boolean;
  new_product:
    | (Omit<NonNullable<IntakeLine["new_product"]>, "confirmed"> & {
        confirmed: boolean;
      })
    | null;
};
type DraftDocument = Omit<IntakeDocument, "lines"> & { lines: DraftLine[] };
type Draft = {
  id: string;
  revision: number;
  document: DraftDocument;
  dirty: boolean;
};
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
const emptyLine = (): DraftLine => ({
  id: crypto.randomUUID(),
  product_id: null,
  new_product: null,
  quantity: 1,
  purchase_unit: "unit",
  conversion: 1,
  conversion_confirmed: false,
  receipt_unit_cost: null,
});
const fresh = (): Draft => ({
  id: crypto.randomUUID(),
  revision: 0,
  dirty: false,
  document: {
    mode: "additional_delivery",
    warehouse_id: "",
    supplier: "",
    invoice_reference: "",
    notes: "",
    duplicate_reason: "",
    lines: [emptyLine()],
  },
});
function restore(key: string): Draft {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null");
    if (
      value?.id &&
      Number.isInteger(value.revision) &&
      Array.isArray(value.document?.lines) &&
      value.document.lines.length <= 1000
    )
      return { ...value, dirty: value.dirty ?? true };
  } catch {
    /* Storage may be unavailable. */
  }
  return fresh();
}
const money = (value: number, currency = "NGN") =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

export function ManualStockIntake() {
  const user = useAuthStore((state) => state.user);
  return (
    <AccessGuard allow={["business_owner", "admin"]}>
      {user?.organization_id && user.status === "active" && (
        <IntakeWorkspace
          key={accountIdentity(user)}
          storageKey={`stock-intake:${user.organization_id}:${user.id}`}
        />
      )}
    </AccessGuard>
  );
}

function IntakeWorkspace({ storageKey }: { storageKey: string }) {
  const cache = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => restore(storageKey));
  const [receipt, setReceipt] = useState<IntakeReceipt | null>(null);
  const [editing, setEditing] = useState(true);
  const [operation, setOperation] = useState<
    "load" | "prepare" | "post" | null
  >(null);
  const busy = operation !== null;
  const [error, setError] = useState("");
  const [storageError, setStorageError] = useState(false);
  const [search, setSearch] = useState("");
  const [catalogPages, setCatalogPages] = useState([0]);
  const catalogOffset = catalogPages[catalogPages.length - 1];
  const [offset, setOffset] = useState(0);
  const [pendingReceipt, setPendingReceipt] = useState<string | null>(null);
  const history = useQuery({
    queryKey: ["stock-intakes", storageKey, offset],
    queryFn: () =>
      intakeRequest<{ receipts: IntakeReceipt[]; nextOffset: number | null }>(
        `/api/stock-intakes?offset=${offset}`,
      ),
  });
  const catalog = useQuery({
    queryKey: ["intake-catalog", storageKey, search, catalogOffset],
    queryFn: () =>
      intakeRequest<IntakeCatalog>(
        `/api/stock-intakes/catalog?q=${encodeURIComponent(search)}&offset=${catalogOffset}`,
      ),
  });
  useEffect(() => {
    // Debounce small local writes while typing; pagehide flushes the last edit.
    const persist = (reportFailure: boolean) => {
      try {
        if (receipt?.status === "posted") localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch {
        if (reportFailure) setStorageError(true);
      }
    };
    const flush = () => persist(true);
    const timer = setTimeout(flush, 100);
    window.addEventListener("pagehide", flush);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pagehide", flush);
      persist(false);
    };
  }, [draft, receipt?.status, storageKey]);
  const update = (fields: Partial<DraftDocument>) =>
    setDraft((current) => ({
      ...current,
      dirty: true,
      document: { ...current.document, ...fields },
    }));
  const updateLine = (id: string, fields: Partial<DraftLine>) =>
    setDraft((current) => ({
      ...current,
      dirty: true,
      document: {
        ...current.document,
        lines: current.document.lines.map((line) =>
          line.id === id ? { ...line, ...fields } : line,
        ),
      },
    }));
  async function resume(id: string, replaceDraft = false) {
    if (editing && draft.dirty && !replaceDraft) {
      setPendingReceipt(id);
      return;
    }
    setOperation("load");
    setError("");
    try {
      const loaded = await intakeRequest<IntakeReceipt>(
        `/api/stock-intakes?id=${id}`,
      );
      setReceipt(loaded);
      setDraft({
        id: loaded.id,
        revision: loaded.revision,
        dirty: false,
        document: loaded.document,
      });
      setEditing(false);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not open receipt",
      );
    } finally {
      setOperation(null);
    }
  }
  async function prepare() {
    setOperation("prepare");
    setError("");
    try {
      const parsed = intakeDocumentSchema.safeParse(draft.document);
      if (!parsed.success)
        throw new Error(
          parsed.error.issues
            .map((issue) => {
              const label =
                issue.path[0] === "lines"
                  ? `Line ${Number(issue.path[1]) + 1}`
                  : "Receipt";
              return `${label}: ${issue.message}`;
            })
            .join("; "),
        );
      const saved = await intakeRequest<IntakeReceipt>("/api/stock-intakes", {
        action: "save",
        id: draft.id,
        revision: draft.revision,
        document: parsed.data,
      });
      // Keep the acknowledged revision before fetching the review snapshot.
      setDraft({
        id: saved.id,
        revision: saved.revision,
        dirty: false,
        document: saved.document,
      });
      setReceipt(saved);
      setEditing(false);
      const snapshot = await intakeRequest<IntakeReceipt>(
        `/api/stock-intakes?id=${saved.id}`,
      );
      setReceipt(snapshot);
      await cache.invalidateQueries({ queryKey: ["stock-intakes"] });
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not prepare receipt",
      );
    } finally {
      setOperation(null);
    }
  }
  async function approveAndPost() {
    if (!receipt) return;
    setOperation("post");
    setError("");
    try {
      const approved =
        receipt.status === "approved"
          ? receipt
          : await intakeRequest<IntakeReceipt>("/api/stock-intakes", {
              action: "approve",
              id: receipt.id,
              revision: receipt.revision,
              hash: receipt.payload_hash,
            });
      setReceipt(approved);
      const result = await intakeRequest<IntakeResult>("/api/stock-intakes", {
        action: "post",
        id: approved.id,
        approval_id: approved.approval_id,
      });
      setReceipt({ ...approved, status: "posted", result });
      await Promise.all(
        [
          "stock-intakes",
          "inventory",
          "inventory-movements",
          "intake-catalog",
          "products",
        ].map((key) => cache.invalidateQueries({ queryKey: [key] })),
      );
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Posting failed. Reopen this receipt to check its saved status before retrying.",
      );
    } finally {
      setOperation(null);
    }
  }
  const view = receipt?.document;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="tt-page-title">Receive stock</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter a receipt, review its units and costs, then approve it once.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Drafts save on this device for this account. Preparing review and
            saving stock require a connection.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href="/inventory">Back to inventory</Link>
        </Button>
      </header>
      {storageError && (
        <p role="alert">
          This device could not save your local draft. Save a review copy on the
          server before leaving.
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="break-words rounded-lg border border-destructive p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void prepare();
          }}
          className="space-y-5"
        >
          <fieldset disabled={busy} className="space-y-5">
            <Card>
              <CardContent className="grid gap-4 pt-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="intake-mode">Receipt type</Label>
                  <select
                    id="intake-mode"
                    className={selectClass}
                    value={draft.document.mode}
                    onChange={(event) =>
                      update({
                        mode: event.target.value as IntakeDocument["mode"],
                      })
                    }
                  >
                    <option value="additional_delivery">
                      Additional delivery
                    </option>
                    <option value="opening_stock">Opening stock</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    Opening stock requires no existing stock position or
                    movement history.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-location">Location</Label>
                  <select
                    required
                    id="intake-location"
                    className={selectClass}
                    value={draft.document.warehouse_id}
                    onChange={(event) =>
                      update({ warehouse_id: event.target.value })
                    }
                  >
                    <option value="">Choose a location</option>
                    {catalog.data?.warehouses.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-supplier">Supplier (optional)</Label>
                  <Input
                    id="intake-supplier"
                    maxLength={255}
                    value={draft.document.supplier}
                    onChange={(event) =>
                      update({ supplier: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="intake-invoice">
                    Invoice reference (optional)
                  </Label>
                  <Input
                    id="intake-invoice"
                    maxLength={100}
                    value={draft.document.invoice_reference}
                    onChange={(event) =>
                      update({ invoice_reference: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="intake-duplicate">
                    Reason if this repeats a previous invoice (optional)
                  </Label>
                  <Input
                    id="intake-duplicate"
                    maxLength={500}
                    value={draft.document.duplicate_reason}
                    onChange={(event) =>
                      update({ duplicate_reason: event.target.value })
                    }
                  />
                </div>
              </CardContent>
            </Card>
            <div className="space-y-2">
              <Label htmlFor="intake-search">
                Find catalog products by name
              </Label>
              <Input
                id="intake-search"
                value={search}
                maxLength={100}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setCatalogPages([0]);
                }}
              />
              {catalog.isLoading && <p role="status">Loading catalog…</p>}
              {catalog.isError && (
                <p role="alert">
                  Could not load catalog. {catalog.error.message}{" "}
                  <button
                    type="button"
                    className="underline"
                    onClick={() => void catalog.refetch()}
                  >
                    Retry
                  </button>
                </p>
              )}
              {catalog.data && (
                <p className="text-sm text-muted-foreground">
                  Showing {catalog.data.products.length} matches on this page.
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy || catalog.isFetching || catalogPages.length === 1
                  }
                  onClick={() => setCatalogPages((pages) => pages.slice(0, -1))}
                >
                  Previous catalog matches
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    busy ||
                    catalog.isFetching ||
                    catalog.data?.nextOffset == null
                  }
                  onClick={() =>
                    setCatalogPages((pages) => [
                      ...pages,
                      catalog.data!.nextOffset!,
                    ])
                  }
                >
                  More catalog matches
                </Button>
              </div>
            </div>
            {draft.document.lines.map((line, index) => (
              <Card key={line.id}>
                <CardContent className="space-y-4 pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-semibold">Line {index + 1}</h2>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={draft.document.lines.length === 1}
                      onClick={() =>
                        update({
                          lines: draft.document.lines.filter(
                            (value) => value.id !== line.id,
                          ),
                        })
                      }
                    >
                      Remove line {index + 1}
                    </Button>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`product-${line.id}`}>
                      Product {index + 1}
                    </Label>
                    <select
                      id={`product-${line.id}`}
                      className={selectClass}
                      value={line.new_product ? "new" : (line.product_id ?? "")}
                      onChange={(event) => {
                        if (event.target.value === "new")
                          updateLine(line.id, {
                            product_id: null,
                            conversion_confirmed: false,
                            product_snapshot: undefined,
                            new_product: {
                              draft_id: crypto.randomUUID(),
                              name: "",
                              sku: "",
                              barcode: "",
                              cost_price: 0,
                              selling_price: 0,
                              confirmed: false,
                            },
                          });
                        else {
                          const product = catalog.data?.products.find(
                            (product) => product.id === event.target.value,
                          );
                          updateLine(line.id, {
                            product_id: product?.id ?? null,
                            conversion_confirmed: false,
                            new_product: null,
                            product_snapshot: product
                              ? {
                                  name: product.name,
                                  sku: product.sku,
                                  barcode: product.barcode,
                                  make: product.make,
                                  status: product.status,
                                }
                              : undefined,
                          });
                        }
                      }}
                    >
                      <option value="">Choose a catalog product</option>
                      {line.product_id &&
                        !catalog.data?.products.some(
                          (product) => product.id === line.product_id,
                        ) && (
                          <option value={line.product_id}>
                            {line.product_snapshot?.name ?? line.product_id}
                          </option>
                        )}
                      {catalog.data?.products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name} · {product.sku}
                        </option>
                      ))}
                      <option value="new">
                        Create an explicitly reviewed new product
                      </option>
                    </select>
                  </div>
                  {line.new_product && (
                    <div className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
                      <p className="text-sm text-muted-foreground sm:col-span-2">
                        Catalog cost and selling price apply to one stock unit.
                        The receipt cost below applies to the purchase unit.
                      </p>
                      {(["name", "sku", "barcode"] as const).map((field) => (
                        <div className="space-y-1" key={field}>
                          <Label htmlFor={`${field}-${line.id}`}>
                            New product {field} {index + 1}
                          </Label>
                          <Input
                            id={`${field}-${line.id}`}
                            value={line.new_product![field]}
                            maxLength={field === "name" ? 255 : 100}
                            onChange={(event) =>
                              updateLine(line.id, {
                                new_product: {
                                  ...line.new_product!,
                                  [field]: event.target.value,
                                  confirmed: false,
                                },
                              })
                            }
                          />
                        </div>
                      ))}
                      {(["selling_price", "cost_price"] as const).map(
                        (field) => (
                          <div className="space-y-1" key={field}>
                            <Label htmlFor={`${field}-${line.id}`}>
                              Catalog{" "}
                              {field === "selling_price"
                                ? "selling price"
                                : "cost"}{" "}
                              {index + 1}
                            </Label>
                            <Input
                              id={`${field}-${line.id}`}
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.new_product![field]}
                              onChange={(event) =>
                                updateLine(line.id, {
                                  new_product: {
                                    ...line.new_product!,
                                    [field]: Number(event.target.value),
                                    confirmed: false,
                                  },
                                })
                              }
                            />
                          </div>
                        ),
                      )}
                      <label className="flex items-center gap-2 text-sm sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={line.new_product.confirmed}
                          onChange={(event) =>
                            updateLine(line.id, {
                              new_product: {
                                ...line.new_product!,
                                confirmed: event.target.checked,
                              },
                            })
                          }
                        />
                        I reviewed this new product identity and its catalog
                        prices
                      </label>
                      <Button
                        type="button"
                        variant="outline"
                        className="sm:col-span-2"
                        onClick={() =>
                          update({
                            lines: [
                              ...draft.document.lines,
                              { ...line, id: crypto.randomUUID() },
                            ],
                          })
                        }
                      >
                        Add another line using this product draft
                      </Button>
                    </div>
                  )}
                  <div className="grid gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label htmlFor={`quantity-${line.id}`}>
                        Purchase quantity {index + 1}
                      </Label>
                      <Input
                        required
                        id={`quantity-${line.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.id, {
                            quantity: Number(event.target.value),
                            conversion_confirmed: false,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`unit-${line.id}`}>
                        Purchase unit {index + 1}
                      </Label>
                      <Input
                        required
                        id={`unit-${line.id}`}
                        maxLength={40}
                        value={line.purchase_unit}
                        onChange={(event) =>
                          updateLine(line.id, {
                            purchase_unit: event.target.value,
                            conversion_confirmed: false,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`conversion-${line.id}`}>
                        Stock units per purchase unit {index + 1}
                      </Label>
                      <Input
                        required
                        id={`conversion-${line.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={line.conversion}
                        onChange={(event) =>
                          updateLine(line.id, {
                            conversion: Number(event.target.value),
                            conversion_confirmed: false,
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor={`cost-${line.id}`}>
                        Cost per purchase unit {index + 1}
                      </Label>
                      <Input
                        required
                        id={`cost-${line.id}`}
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.receipt_unit_cost ?? ""}
                        onChange={(event) =>
                          updateLine(line.id, {
                            receipt_unit_cost:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      className="mt-1"
                      type="checkbox"
                      checked={line.conversion_confirmed}
                      onChange={(event) =>
                        updateLine(line.id, {
                          conversion_confirmed: event.target.checked,
                        })
                      }
                    />
                    I confirm {line.quantity} {line.purchase_unit} ×{" "}
                    {line.conversion} = {line.quantity * line.conversion} whole
                    stock units
                  </label>
                </CardContent>
              </Card>
            ))}
            <Button
              type="button"
              variant="outline"
              disabled={draft.document.lines.length >= 1000}
              onClick={() =>
                update({ lines: [...draft.document.lines, emptyLine()] })
              }
            >
              Add product line
            </Button>
            <div className="space-y-2">
              <Label htmlFor="intake-notes">Receipt notes</Label>
              <Textarea
                id="intake-notes"
                maxLength={2000}
                value={draft.document.notes}
                onChange={(event) => update({ notes: event.target.value })}
              />
            </div>
            <Button type="submit" disabled={catalog.isError || !catalog.data}>
              {busy ? "Preparing review…" : "Prepare receipt for review"}
            </Button>
          </fieldset>
        </form>
      ) : (
        receipt &&
        view && (
          <section aria-label="Receipt review" className="space-y-4">
            <Card>
              <CardContent className="space-y-4 pt-6">
                <div>
                  <h2 className="text-xl font-semibold">
                    {receipt.status === "posted"
                      ? "Receipt saved"
                      : "Review receipt"}
                  </h2>
                  <p className="break-all text-sm text-muted-foreground">
                    {receipt.id} · revision {receipt.revision} ·{" "}
                    {receipt.status}
                  </p>
                </div>
                <p>
                  {view.mode === "opening_stock"
                    ? "Opening stock"
                    : "Additional delivery"}{" "}
                  ·{" "}
                  {catalog.data?.warehouses.find(
                    (location) => location.id === view.warehouse_id,
                  )?.name ??
                    (catalog.isFetching
                      ? "Loading location details…"
                      : "Location details unavailable")}
                </p>
                {view.supplier && (
                  <p>
                    Supplier: {view.supplier} · {view.invoice_reference}
                  </p>
                )}
                {view.duplicate_reason && (
                  <p>
                    Repeated invoice acknowledgment: {view.duplicate_reason}
                  </p>
                )}
                {view.lines.map((line) => {
                  const current = line.new_product
                    ? 0
                    : receipt.current_stock
                      ? (receipt.current_stock.find(
                          (stock) => stock.product_id === line.product_id,
                        )?.quantity ?? 0)
                      : null;
                  const combined = view.lines
                    .filter(
                      (value) =>
                        (value.product_id ?? value.new_product?.draft_id) ===
                        (line.product_id ?? line.new_product?.draft_id),
                    )
                    .reduce(
                      (sum, value) => sum + value.quantity * value.conversion,
                      0,
                    );
                  return (
                    <div
                      key={line.id}
                      className="space-y-1 rounded-lg border p-4"
                    >
                      <h3 className="break-words font-semibold">
                        {line.product_snapshot?.name ?? line.new_product?.name}{" "}
                        · {line.product_snapshot?.sku ?? line.new_product?.sku}
                      </h3>
                      <p>
                        {line.quantity} {line.purchase_unit} × {line.conversion}{" "}
                        ={" "}
                        <strong>
                          +{line.stock_units ?? line.quantity * line.conversion}{" "}
                          stock units
                        </strong>
                      </p>
                      <p className="text-sm">
                        Purchase cost:{" "}
                        {money(line.receipt_unit_cost, view.currency)} per{" "}
                        {line.purchase_unit} ·{" "}
                        {money(
                          line.receipt_unit_cost * line.quantity,
                          view.currency,
                        )}{" "}
                        for this line
                      </p>
                      {line.new_product && (
                        <p className="text-sm">
                          New product: catalog cost{" "}
                          {money(line.new_product.cost_price, view.currency)} ·
                          selling price{" "}
                          {money(line.new_product.selling_price, view.currency)}
                        </p>
                      )}
                      {receipt.status !== "posted" && (
                        <p className="text-sm text-muted-foreground">
                          {current === null ? (
                            "Current balance is unavailable. Refresh saved status to load a stock snapshot."
                          ) : (
                            <>
                              Current snapshot: {current} · expected after all
                              lines for this product: {current + combined}.
                              Other stock activity can change this balance
                              before posting.
                            </>
                          )}
                        </p>
                      )}
                    </div>
                  );
                })}
                <p className="font-semibold">
                  Receipt purchase cost:{" "}
                  {money(view.receipt_cost_total ?? 0, view.currency)}
                </p>
                {view.notes && (
                  <p className="break-words text-sm">
                    Receipt notes: {view.notes}
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Existing catalog costs and selling prices stay unchanged. The
                  approved receipt records its own purchase costs.
                </p>
                {receipt.result && (
                  <div role="status" className="space-y-2">
                    <p>
                      All {receipt.result.lines.length} lines saved together.
                    </p>
                    {receipt.result.stocks.map((stock) => {
                      const lineId = receipt.result!.lines.find(
                        (line) => line.product_id === stock.product_id,
                      )?.line_id;
                      const line = view.lines.find(
                        (line) => line.id === lineId,
                      );
                      return (
                        <div key={stock.id}>
                          <p className="font-medium">
                            {line?.product_snapshot?.name ??
                              line?.new_product?.name ??
                              "Receipt product"}
                          </p>
                          <p>
                            Added {stock.added} units · balance immediately
                            after posting: {stock.quantity}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div className="flex flex-wrap gap-3">
                  {receipt.status !== "posted" ? (
                    <>
                      <Button
                        disabled={busy}
                        onClick={() => void approveAndPost()}
                      >
                        {busy
                          ? operation === "post"
                            ? "Saving receipt…"
                            : "Loading review…"
                          : receipt.status === "approved"
                            ? "Retry approved receipt"
                            : "Approve and save receipt"}
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => setEditing(true)}
                      >
                        Edit receipt
                      </Button>
                      <Button
                        variant="outline"
                        disabled={busy}
                        onClick={() => void resume(receipt.id)}
                      >
                        Refresh saved status
                      </Button>
                    </>
                  ) : (
                    <Button
                      onClick={() => {
                        setDraft(fresh());
                        setReceipt(null);
                        setEditing(true);
                        setError("");
                      }}
                    >
                      Start another receipt
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>
        )
      )}
      <Dialog
        open={pendingReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setPendingReceipt(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Replace this local draft?</DialogTitle>
            <DialogDescription>
              Opening a saved receipt will replace your current edits. Keep
              editing and prepare a review copy first if you want to retain this
              receipt on the server.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => setPendingReceipt(null)}>
              Keep editing
            </Button>
            <Button
              onClick={() => {
                const id = pendingReceipt;
                setPendingReceipt(null);
                if (id) void resume(id, true);
              }}
            >
              Replace local draft
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <section aria-label="Saved receipts" className="space-y-3">
        <h2 className="text-lg font-semibold">Saved receipts</h2>
        {history.isLoading ? (
          <p role="status">Loading receipts…</p>
        ) : history.isError ? (
          <p role="alert">
            Could not load receipts.{" "}
            <button
              className="underline"
              onClick={() => void history.refetch()}
            >
              Retry
            </button>
          </p>
        ) : history.data?.receipts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Your prepared and posted receipts will appear here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border">
            {history.data?.receipts.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="break-all text-sm">
                    {item.document.invoice_reference || item.id}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {item.status} · {item.document.lines.length} lines ·{" "}
                    {new Date(item.created_at).toLocaleString()}
                  </p>
                </div>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void resume(item.id)}
                >
                  Open receipt
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={offset === 0 || busy}
            onClick={() => setOffset((value) => Math.max(0, value - 20))}
          >
            Previous receipts
          </Button>
          <Button
            variant="outline"
            disabled={history.data?.nextOffset == null || busy}
            onClick={() => setOffset(history.data!.nextOffset!)}
          >
            Next receipts
          </Button>
        </div>
      </section>
    </div>
  );
}
