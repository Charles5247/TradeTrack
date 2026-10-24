"use client";

import { cloneElement, useId, useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { intakeRequest } from "@/lib/stock-intake/client";
import type { IntakeCatalog } from "@/lib/stock-intake/contracts";
import {
  INTAKE_FIELDS,
  type BatchCommand,
  type BatchGroup,
  type BatchRow,
  type BatchSource,
} from "@/lib/stock-intake-batches/contracts";
import type { SpreadsheetPlan } from "@/lib/stock-intake-batches/spreadsheet";
import { STOCK_UNITS } from "@/lib/industries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm";
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  const id = useId();
  return (
    <div className="grid gap-1 text-sm">
      <label htmlFor={id}>{label}</label>
      {cloneElement(children as ReactElement<{ id: string }>, { id })}
    </div>
  );
}
export function Check({
  label,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-start gap-2 text-sm">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
function Modal({
  title,
  description,
  close,
  children,
}: {
  title: string;
  description: string;
  close: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}

export function SheetDialog({
  source,
  busy,
  close,
  save,
}: {
  source: BatchSource;
  busy: boolean;
  close: () => void;
  save: (plan: SpreadsheetPlan, reason: string) => Promise<void>;
}) {
  const [plan, setPlan] = useState<SpreadsheetPlan>(
      () => source.plan ?? { sheets: [] },
    ),
    [reason, setReason] = useState(source.duplicate_reason);
  const sheets = source.inspection?.sheets ?? [];
  const update = (
    name: string,
    change: Partial<SpreadsheetPlan["sheets"][number]>,
  ) =>
    setPlan((current) => ({
      sheets: current.sheets.map((sheet) =>
        sheet.name === name ? { ...sheet, ...change } : sheet,
      ),
    }));
  return (
    <Modal
      title="Select complete worksheets"
      description="Preview shows the first 20 physical rows only. Every nonblank data row in each selected sheet is prepared. Confirm the header and column mappings."
      close={close}
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save(plan, reason);
        }}
      >
        {sheets.map((sheet) => {
          const chosen = plan.sheets.find((item) => item.name === sheet.name);
          const headers = sheet.preview.find(
            (row) => row.row === (chosen?.headerRow ?? 1),
          );
          return (
            <fieldset
              key={sheet.name}
              className="space-y-3 rounded-lg border p-3"
            >
              <legend>{sheet.name}</legend>
              <Check
                label={`Include ${sheet.name}`}
                checked={Boolean(chosen)}
                disabled={busy}
                onChange={(checked) =>
                  setPlan((current) => ({
                    sheets: checked
                      ? [
                          ...current.sheets,
                          { name: sheet.name, headerRow: 1, columns: {} },
                        ]
                      : current.sheets.filter((s) => s.name !== sheet.name),
                  }))
                }
              />
              {chosen && (
                <>
                  <Field label="Header physical row">
                    <Input
                      type="number"
                      min={1}
                      max={20001}
                      value={chosen.headerRow}
                      onChange={(e) =>
                        update(sheet.name, {
                          headerRow: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {INTAKE_FIELDS.map((field) => (
                      <Field key={field} label={field.replaceAll("_", " ")}>
                        <select
                          className={selectClass}
                          value={chosen.columns[field] ?? ""}
                          onChange={(e) => {
                            const columns = { ...chosen.columns };
                            if (e.target.value === "") delete columns[field];
                            else columns[field] = Number(e.target.value);
                            update(sheet.name, { columns });
                          }}
                        >
                          <option value="">Not mapped</option>
                          {Array.from(
                            {
                              length: Math.max(
                                headers?.cells.length ?? 0,
                                ...sheet.preview.map((r) => r.cells.length),
                              ),
                            },
                            (_, column) => (
                              <option key={column} value={column}>
                                {column + 1}:{" "}
                                {headers?.cells[column]?.formatted ||
                                  "Unnamed column"}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                    ))}
                  </div>
                  <details>
                    <summary className="cursor-pointer text-sm underline">
                      Inspect source preview
                    </summary>
                    <div className="overflow-x-auto">
                      <table className="text-left text-xs">
                        <tbody>
                          {sheet.preview.map((row) => (
                            <tr key={row.row}>
                              <th className="p-2">{row.row}</th>
                              {row.cells.map((cell, i) => (
                                <td
                                  key={i}
                                  className="max-w-48 break-words border p-2"
                                >
                                  {cell.formatted}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                </>
              )}
            </fieldset>
          );
        })}
        <Field label="Repeated legitimate delivery reason (required for duplicates)">
          <Input
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          type="submit"
          disabled={
            busy ||
            !plan.sheets.length ||
            plan.sheets.some(
              (s) =>
                s.columns.quantity === undefined ||
                [s.columns.description, s.columns.sku, s.columns.barcode].every(
                  (v) => v === undefined,
                ),
            )
          }
        >
          Save worksheet selection
        </Button>
      </form>
    </Modal>
  );
}
type RowPatch = Extract<BatchCommand, { action: "rows" }>["patch"];
export function RowDialog({
  row,
  account,
  busy,
  close,
  save,
  saveDraft,
}: {
  row: BatchRow;
  account: string;
  busy: boolean;
  close: () => void;
  save: (patch: RowPatch) => Promise<void>;
  saveDraft: (
    document: NonNullable<BatchRow["review"]["new_product"]>,
  ) => Promise<void>;
}) {
  const [line, setLine] = useState(row.review),
    [draft, setDraft] = useState(row.review.new_product),
    [search, setSearch] = useState(""),
    [catalogPages, setCatalogPages] = useState([0]);
  const offset=catalogPages[catalogPages.length-1];
  const catalog = useQuery({
    queryKey: ["intake-catalog", account, search, offset],
    queryFn: () =>
      intakeRequest<IntakeCatalog>(
        `/api/stock-intakes/catalog?q=${encodeURIComponent(search)}&offset=${offset}`,
      ),
  });
  const update = (patch: Partial<typeof line>) =>
    setLine((current) => ({ ...current, ...patch }));
  return (
    <Modal
      title={`Inspect row ${row.row_number}`}
      description={`${row.source_name} / ${row.sheet}. Receipt group ${row.group_id}. ${row.group_status === "posted" ? "Posted evidence is immutable." : "Corrections require fresh preparation."}`}
      close={close}
    >
      <div className="grid gap-5 md:grid-cols-2">
        <section className="space-y-2">
          <h3 className="font-semibold">Original extracted evidence</h3>
          <dl className="space-y-2 text-sm">
            {Object.entries(row.raw.values).map(([key, value]) => (
              <div key={key}>
                <dt className="text-muted-foreground">
                  {key.replaceAll("_", " ")}
                </dt>
                <dd className="break-words">
                  {value === null ? "Unreadable or missing" : String(value)}
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary className="cursor-pointer underline">
              All original cells
            </summary>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">
              {JSON.stringify(row.raw.cells, null, 2)}
            </pre>
          </details>
        </section>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save({
              product_id: line.product_id,
              draft_id: line.product_id ? null : row.draft_id,
              quantity: line.quantity,
              purchase_unit: line.purchase_unit,
              conversion: line.conversion,
              conversion_confirmed: line.conversion_confirmed,
              receipt_unit_cost: line.receipt_unit_cost,
            });
          }}
        >
          <h3 className="font-semibold">Reviewed values</h3>
          <Field label="Search catalog">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setCatalogPages([0]);
              }}
            />
          </Field>
          <Field label="Matched product">
            <select
              className={selectClass}
              value={line.product_id ?? ""}
              onChange={(e) =>
                update({
                  product_id: e.target.value || null,
                  conversion_confirmed: false,
                })
              }
            >
              <option value="">Unresolved / shared new draft</option>
              {line.product_id &&
                !catalog.data?.products.some(
                  (p) => p.id === line.product_id,
                ) && (
                  <option value={line.product_id}>
                    {line.product_snapshot?.name ?? line.product_id}
                  </option>
                )}
              {catalog.data?.products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.sku} · {p.stock_unit ?? "piece"}
                </option>
              ))}
            </select>
          </Field>
          {line.product_id && (
            <p className="break-all text-xs">
              Catalog product ID: {line.product_id}
            </p>
          )}
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={catalogPages.length<=1}
              onClick={() => setCatalogPages(pages=>pages.slice(0,-1))}
            >
              Previous products
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={!catalog.data?.hasMore}
              onClick={() => setCatalogPages(pages=>[...pages,catalog.data!.nextOffset!])}
            >
              More products
            </Button>
          </div>
          {catalog.isError && (
            <p role="alert">
              Catalog unavailable.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void catalog.refetch()}
              >
                Retry
              </button>
            </p>
          )}
          {(["quantity", "conversion", "receipt_unit_cost"] as const).map(
            (field) => (
              <Field key={field} label={field.replaceAll("_", " ")}>
                <Input
                  type="number"
                  min={field === "receipt_unit_cost" ? 0 : 1}
                  step={field === "receipt_unit_cost" ? "0.01" : 1}
                  value={line[field] ?? ""}
                  onChange={(e) =>
                    update({
                      [field]:
                        e.target.value === "" ? null : Number(e.target.value),
                      ...(field === "conversion"
                        ? { conversion_confirmed: false }
                        : {}),
                    })
                  }
                />
              </Field>
            ),
          )}
          <Field label="Purchase unit">
            <Input
              maxLength={40}
              value={line.purchase_unit}
              onChange={(e) =>
                update({
                  purchase_unit: e.target.value,
                  conversion_confirmed: false,
                })
              }
            />
          </Field>
          <Check
            label="I confirmed this product, variant, purchase unit and resulting stock-unit conversion."
            checked={line.conversion_confirmed}
            disabled={busy}
            onChange={(value) => update({ conversion_confirmed: value })}
          />
          <Button type="submit" disabled={busy}>
            Save reviewed row
          </Button>
        </form>
      </div>
      {draft && (
        <form
          className="space-y-3 rounded-lg border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft(draft);
          }}
        >
          <h3 className="font-semibold">
            Shared new product draft · {row.draft_appearances} appearances
          </h3>
          <p className="text-sm">
            Saving updates this shared draft across all its unposted
            appearances. Receipt costs remain separate from these catalog
            prices.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {(["name", "sku", "barcode"] as const).map((field) => (
              <Field key={field} label={`Product ${field}`}>
                <Input
                  maxLength={field === "name" ? 255 : 100}
                  value={draft[field]}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [field]: e.target.value,
                      confirmed: false,
                    })
                  }
                />
              </Field>
            ))}
            <Field label="Stock unit">
              <select
                className={selectClass}
                value={draft.stock_unit}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    stock_unit: e.target.value as typeof draft.stock_unit,
                    confirmed: false,
                  })
                }
              >
                {STOCK_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {unit}
                  </option>
                ))}
              </select>
            </Field>
            {(["cost_price", "selling_price"] as const).map((field) => (
              <Field
                key={field}
                label={`Catalog ${field.replaceAll("_", " ")}`}
              >
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  value={draft[field] ?? ""}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      [field]:
                        e.target.value === "" ? null : Number(e.target.value),
                      confirmed: false,
                    })
                  }
                />
              </Field>
            ))}
          </div>
          <Check
            label="I reviewed this new product identity, stock unit and catalog prices for all its appearances."
            checked={draft.confirmed}
            disabled={busy}
            onChange={(confirmed) => setDraft({ ...draft, confirmed })}
          />
          <Button disabled={busy || !draft.confirmed} type="submit">
            Save shared product draft
          </Button>
        </form>
      )}
    </Modal>
  );
}
export function BulkDialog({
  count,
  groups,
  busy,
  close,
  save,
}: {
  count: number;
  groups: BatchGroup[];
  busy: boolean;
  close: () => void;
  save: (fields: {
    patch: RowPatch;
    group_id?: string;
    excluded?: boolean;
  }) => Promise<void>;
}) {
  const [field, setField] = useState("conversion_confirmed"),
    [value, setValue] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  return (
    <Modal
      title={`Correct ${count} selected rows`}
      description="Apply one explicit correction to these selected rows. Product or purchase-unit changes clear conversion confirmation."
      close={close}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const payload: {
            patch: RowPatch;
            group_id?: string;
            excluded?: boolean;
          } = { patch: {} };
          if (field === "group_id") payload.group_id = value;
          else if (field === "excluded") payload.excluded = value === "true";
          else
            payload.patch = {
              [field]:
                field === "conversion_confirmed"
                  ? true
                  : ["quantity", "conversion", "receipt_unit_cost"].includes(
                        field,
                      )
                    ? value === ""
                      ? null
                      : Number(value)
                    : value,
            };
          void save(payload);
        }}
      >
        <Field label="Correction">
          <select
            className={selectClass}
            value={field}
            onChange={(e) => {
              setField(e.target.value);
              setValue("");
              setConfirmed(false);
            }}
          >
            {[
              "conversion_confirmed",
              "quantity",
              "purchase_unit",
              "conversion",
              "receipt_unit_cost",
              "product_id",
              "group_id",
              "excluded",
            ].map((field) => (
              <option key={field} value={field}>
                {field.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </Field>
        {field === "group_id" ? (
          <Field label="Destination receipt group">
            <select
              className={selectClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">Select destination</option>
              {groups
                .filter((g) => g.status !== "posted")
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label} · {g.id}
                  </option>
                ))}
            </select>
          </Field>
        ) : field === "excluded" ? (
          <Field label="Row inclusion">
            <select
              className={selectClass}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            >
              <option value="">Choose</option>
              <option value="true">Exclude selected rows</option>
              <option value="false">Include selected rows</option>
            </select>
          </Field>
        ) : (
          field !== "conversion_confirmed" && (
            <Field
              label={
                field === "product_id"
                  ? "Catalog product ID (copy from row inspector)"
                  : "Reviewed value"
              }
            >
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                type={
                  ["quantity", "conversion", "receipt_unit_cost"].includes(
                    field,
                  )
                    ? "number"
                    : "text"
                }
                step={field === "receipt_unit_cost" ? "0.01" : 1}
              />
            </Field>
          )
        )}
        <Check
          label={
            field === "conversion_confirmed"
              ? "I explicitly checked every selected product, variant and purchase-unit conversion."
              : "I reviewed this correction for exactly these selected rows."
          }
          checked={confirmed}
          onChange={setConfirmed}
          disabled={busy}
        />
        <Button
          type="submit"
          disabled={
            busy || !confirmed || (field !== "conversion_confirmed" && !value)
          }
        >
          Apply selected correction
        </Button>
      </form>
    </Modal>
  );
}
export function GroupDialog({
  group,
  locations,
  busy,
  close,
  save,
}: {
  group: BatchGroup;
  locations: IntakeCatalog["warehouses"];
  busy: boolean;
  close: () => void;
  save: (
    fields: Pick<
      BatchGroup,
      | "label"
      | "warehouse_id"
      | "supplier"
      | "invoice_reference"
      | "duplicate_reason"
      | "excluded"
    >,
  ) => Promise<void>;
}) {
  const [fields, setFields] = useState({
    label: group.label,
    warehouse_id: group.warehouse_id,
    supplier: group.supplier,
    invoice_reference: group.invoice_reference,
    duplicate_reason: group.duplicate_reason,
    excluded: group.excluded,
  });
  return (
    <Modal
      title="Edit receipt grouping"
      description={`Group ID: ${group.id}. Move selected rows here using bulk correction. Edited receipts require fresh preparation.`}
      close={close}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save(fields);
        }}
      >
        {(
          [
            "label",
            "supplier",
            "invoice_reference",
            "duplicate_reason",
          ] as const
        ).map((field) => (
          <Field key={field} label={field.replaceAll("_", " ")}>
            <Input
              value={fields[field]}
              maxLength={
                field === "duplicate_reason"
                  ? 500
                  : field === "invoice_reference"
                    ? 100
                    : 255
              }
              onChange={(e) =>
                setFields({ ...fields, [field]: e.target.value })
              }
            />
          </Field>
        ))}
        <Field label="Receipt location">
          <select
            className={selectClass}
            value={fields.warehouse_id}
            onChange={(e) =>
              setFields({ ...fields, warehouse_id: e.target.value })
            }
          >
            {locations.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
        <Check
          label="Exclude this receipt from approval"
          checked={fields.excluded}
          onChange={(excluded) => setFields({ ...fields, excluded })}
          disabled={busy}
        />
        <Button type="submit" disabled={busy}>
          Save receipt group
        </Button>
      </form>
    </Modal>
  );
}
