# Thrive-Well sales history reset

The merchant confirmed that the customer took the 40 units on invoice
`INV-99886DBB-0FFD-4C4C-BF8F-8E53675B076A`. The cashier submitted twice.
The first receipt was voided and its 40 units returned; the second receipt
had no stock effect. The merchant asked to hide all current and imported sales
and the two mistaken credit balances. Original sale, settlement, reversal,
movement and audit rows remain in the database.

## Apply

1. Confirm the Supabase project ref is `ajrflgewbsosthsjtvuj` and review
   migration `20261117120000_thrive_well_sales_history_reset.sql`.
2. Apply that migration through the normal project migration workflow. It
   creates a one-use, service-role-only maintenance function but does not
   change Thrive-Well's data on deployment.
3. In that project's SQL editor, execute this **once**. The request ID must
   stay the same if the response is lost and the outcome needs checking:

   ```sql
   SELECT public.reset_thrive_well_sales_history(
     '8eab7920-3c72-4aaa-a327-c6872d6cc80c'::uuid
   );
   ```

   The function checks the exact organization, receipt, duplicate, void,
   36 item rows, 40 units, stock ledger and expected 46 current plus 1,050
   imported sales. It fails without a partial change if these facts changed.

## Verify before telling the merchant it is complete

Run in the same project SQL editor:

```sql
SELECT current_sale_count, historical_sale_count, stock_units_deducted
FROM track_private.sales_history_reset_events
WHERE id = '8eab7920-3c72-4aaa-a327-c6872d6cc80c';

SELECT count(*) AS corrected_rows, sum(quantity) AS corrected_units
FROM public.inventory_movements
WHERE organization_id = '461a56a3-86f0-4385-bc17-c2d0e3694ffa'
  AND notes LIKE 'Confirmed physical sale stock correction; Thrive-Well history reset 8eab7920-3c72-4aaa-a327-c6872d6cc80c%';

SELECT count(*) FROM public.sales
WHERE organization_id = '461a56a3-86f0-4385-bc17-c2d0e3694ffa';
SELECT count(*) FROM public.historical_sales
WHERE organization_id = '461a56a3-86f0-4385-bc17-c2d0e3694ffa';
```

Expected: event `(46,1050,40)`, movement `(36,-40)`, and source row
counts still `(46,1050)` because evidence was archived, not deleted.
Sign in as a Thrive-Well owner and check Sales History, Reports, Receipts,
Customer credit and AI insights show no old sales. Make one test sale and
verify it appears and deducts stock once. Reconnect each offline device and
review any pre-reset queued sale that the server rejects; do not silently
discard a legitimate unsynced transaction.

Rollback of merchant visibility requires an explicit reviewed restoration
of the archive policies and markers. The 40-unit correction is a separate
audited stock effect and must be compensated only after a physical count.
