# Import verification — 28 October 2026

The importer retains each source product row and every source line of a grouped historical sale. Cleanup notes and accepted review decisions travel through online requests and offline product commands. The live `apply_import_row` function now stores them under `_import_source`, `_import_fixes`, and `_import_review_accepted` in `import_rows.before_values`. The entity snapshot in `after_values` remains unchanged for reversal checks.

Historical sales remain totals-only and online-only. The original lines are audit evidence, not operational sale-item records. No new line-level history table was created. Multi-worksheet uploads are rejected rather than silently selecting the first sheet. CSV identifiers retain leading zeroes.

Before a real pharmacy import:

1. Obtain the actual CSV/XLSX export and a backup. Export one worksheet at a time.
2. Confirm the intended merchant and warehouse. Map identifiers, prices and quantities; inspect unmapped fields in the preserved original.
3. For sales, choose the source time zone and ambiguous date order. Select a repeated sale-total column if present; otherwise confirm grouping and summed line totals.
4. Resolve every blocked row. Accept review changes explicitly, including negative stock corrections and generated SKU suffixes. Do not assume batch/expiry or pack conversions are supported by this general importer.
5. Download the change log. Reconcile input row counts, grouped sale counts, quantities, gross sales and payments against the old app before confirmation. Account separately for skipped duplicates.
6. After import, download row results and reconcile successful, skipped and failed rows. Retain the original export and both reports.

No real pharmacy export has been supplied or imported during this work. The audit migration is applied and verified live; the frontend changes are not yet deployed. Focused import/API/database tests pass; broader release checks are separate.
